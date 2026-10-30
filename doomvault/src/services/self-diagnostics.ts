import { recentRequestFailures } from "./diagnostic-events";
import { readStorage, unsavedStorage } from "./storage";
import { parseBrowserBackup } from "./browser-backup";
import { apiFetch } from './api-fetch';
import { contracts } from './response-contracts';

export type CheckResult = { name: string; status: 'ok' | 'warning' | 'failed' | 'not-tested'; detail: string };
export type DiagnosticReport = { createdAt: string; version: string; mode?: 'quick' | 'deep'; checks: CheckResult[] };
const API = 'http://127.0.0.1:5000';
// Only explicit, non-sensitive facts enter the report. Never include response bodies,
// exception messages, library paths, titles, storage contents or provider credentials.
export async function runDiagnostics(signal: AbortSignal, progress: (name: string) => void, version = 'não identificada', mode: 'quick' | 'deep' = 'quick'): Promise<DiagnosticReport> {
  const recent = recentRequestFailures();
  const checks: CheckResult[] = [{name:'Falhas recentes de requisições locais',status:recent.length?'warning':'ok',detail:recent.length?`${recent.length} falha(s) nos últimos 15 minutos desta sessão: ${[...new Set(recent)].join(', ')}. Não inclui todas as fontes de erro.`:'Nenhuma falha registrada pelo monitor local nos últimos 15 minutos. Não comprova ausência de erros.'}];
  const probes = [
    ['Ambiente e banco', '/api/bztune/maintenance/diagnostics', contracts.diagnosis],
    ['Biblioteca de músicas', '/api/library/tracks', contracts.tracks],
    ['Biblioteca de álbuns', '/api/library/albums', contracts.localAlbums],
    ['Playlists', '/api/playlists', contracts.playlists],
    ['Histórico e estatísticas', '/api/bztune/stats/summary?period=all', contracts.summary],
  ] as const;
  for (const [name, path, validate] of probes) {
    signal.throwIfAborted(); progress(name);
    try {
      const response = await apiFetch(API + path, { signal }, 8000);
      if (!response.ok) { checks.push({name, status:'failed', detail:`HTTP ${response.status}`}); continue; }
      const data = await response.json();
      if (!validate(data)) { checks.push({name, status:'failed', detail:'Resposta fora do formato esperado.'}); continue; }
      checks.push({name, status:'ok', detail:'Resposta recebida e validada.'});
      if (name === 'Ambiente e banco') {
        checks.push({name:'Integridade SQLite', status:data.sqliteOK ? 'ok' : 'failed', detail:data.sqliteOK ? 'Verificação rápida aprovada.' : 'Verificação não aprovada.'});
        const missing = Object.values(data.packages).some(value => !value) || Object.values(data.ffmpeg).some(value => !value);
        checks.push({name:'Dependências do backend', status:missing ? 'warning' : 'ok', detail:missing ? 'Uma ou mais dependências não foram encontradas.' : 'Dependências encontradas.'});
      }
    } catch {
      signal.throwIfAborted();
      checks.push({name, status:'failed', detail:'Serviço inacessível, prazo excedido ou resposta ilegível.'});
    }
  }
  if (mode === 'deep') {
    for (const area of ['lrclib', 'catalog', 'github', 'files', 'tools']) {
      signal.throwIfAborted(); progress(`Verificação aprofundada: ${area}`);
      try {
        const response = await apiFetch(`${API}/api/bztune/maintenance/checks/${area}`, {signal}, 12000);
        if (!response.ok) throw Error('HTTP');
        const data = await response.json();
        if (!Array.isArray(data.checks) || data.checks.length > 10 || !data.checks.every((c: CheckResult) => c && typeof c.name === 'string' && typeof c.detail === 'string' && ['ok','warning','failed','not-tested'].includes(c.status))) throw Error('format');
        checks.push(...data.checks);
      } catch {
        signal.throwIfAborted();
        checks.push({name:`Verificação aprofundada: ${area}`, status:'failed', detail:'Não foi possível concluir a consulta.'});
      }
    }
  }
  if(mode==='quick')checks.push({name:'Conexões externas, amostra de arquivos e ferramentas de download',status:'not-tested',detail:'Selecione a verificação aprofundada para examinar estas áreas.'});
  progress('Armazenamento da interface');
  try { localStorage.getItem('bztune-settings-v1'); checks.push({name:'Leitura do armazenamento',status:'ok',detail:'Leitura permitida; conteúdo não incluído.'}); }
  catch { checks.push({name:'Leitura do armazenamento',status:'failed',detail:'Acesso indisponível.'}); }
  const storageKey = `bztune-diagnostic-temp-${crypto.randomUUID()}`;
  try {
    localStorage.setItem(storageKey, 'diagnostic');
    if (localStorage.getItem(storageKey) !== 'diagnostic') throw Error('readback');
    checks.push({name:'Gravação das configurações',status:'ok',detail:'Chave temporária gravada e lida; preferências preservadas.'});
  } catch { checks.push({name:'Gravação das configurações',status:'failed',detail:'Gravação ou leitura de conferência indisponível.'}); }
  finally { try { localStorage.removeItem(storageKey); } catch { checks.push({name:'Limpeza do teste de armazenamento',status:'warning',detail:'Não foi possível remover a chave temporária de teste.'}); } }
  checks.push({name:'Alterações pendentes',status:unsavedStorage()?'warning':'ok',detail:unsavedStorage()?'Existem alterações ainda não gravadas no dispositivo.':'Nenhuma gravação pendente identificada.'});
  for (const [key, name] of [['bztune-settings-v1','Formato das preferências'], ['doomvault-player-state-v11','Formato da fila salva']] as const) {
    try {
      const raw=readStorage(key);
      if(raw===null) { checks.push({name,status:'not-tested',detail:'Nenhum valor salvo disponível.'}); continue; }
      parseBrowserBackup({format:'bztune-browser-settings-v1',settings:{[key]:raw}});
      checks.push({name,status:'ok',detail:'Compatível com o contrato de restauração; conteúdo não incluído.'});
    } catch {checks.push({name,status:'warning',detail:'Valor salvo incompatível com o contrato de restauração; nada foi alterado.'});}
  }
  checks.push({name:'Reprodução real, decodificação completa, capas, download completo, letras, assinatura de atualização, backup completo e interação visual',status:'not-tested',detail:'Exigem testes específicos; esta verificação não comprova seu funcionamento.'});
  return {createdAt:new Date().toISOString(),version,mode,checks};
}
export function diagnosticMarkdown(report: DiagnosticReport, description = ''): string {
  const labels = {ok:'OK',warning:'ATENÇÃO',failed:'FALHA','not-tested':'NÃO TESTADO'};
  return `## Diagnóstico BZtune\nVersão: ${report.version}\nData UTC: ${report.createdAt}\nModo: ${report.mode === 'deep' ? 'Aprofundada' : 'Rápida'}\n\n` + report.checks.map(c=>`- ${labels[c.status]} — ${c.name}: ${c.detail}`).join('\n') + `\n\n## O que aconteceu?\n${description.slice(0,400) || 'Descreva o problema, os passos para reproduzir e o resultado esperado.'}\n`;
}
export function diagnosticIssueUrl(report: DiagnosticReport, description = ''): string {
  return 'https://github.com/BadZ7br/BZtune/issues/new?' + new URLSearchParams({title:'Diagnóstico do BZtune',body:diagnosticMarkdown(report, description)});
}
