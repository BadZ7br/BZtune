import { apiFetch } from './api-fetch';
import { contracts } from './response-contracts';

export type CheckResult = { name: string; status: 'ok' | 'warning' | 'failed' | 'not-tested'; detail: string };
export type DiagnosticReport = { createdAt: string; version: string; mode?: 'quick' | 'deep'; checks: CheckResult[] };
const API = 'http://127.0.0.1:5000';
// Only explicit, non-sensitive facts enter the report. Never include response bodies,
// exception messages, library paths, titles, storage contents or provider credentials.
export async function runDiagnostics(signal: AbortSignal, progress: (name: string) => void, version = 'não identificada', mode: 'quick' | 'deep' = 'quick'): Promise<DiagnosticReport> {
  const checks: CheckResult[] = [];
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
  progress('Armazenamento da interface');
  try { localStorage.getItem('bztune-settings-v1'); checks.push({name:'Leitura do armazenamento',status:'ok',detail:'Leitura permitida; conteúdo não incluído.'}); }
  catch { checks.push({name:'Leitura do armazenamento',status:'failed',detail:'Acesso indisponível.'}); }
  checks.push({name:'Reprodução, áudio, download, letras, APIs externas, atualização e interação visual',status:'not-tested',detail:'Exigem testes específicos; esta verificação não comprova seu funcionamento.'});
  return {createdAt:new Date().toISOString(),version,mode,checks};
}
export function diagnosticMarkdown(report: DiagnosticReport): string {
  const labels = {ok:'OK',warning:'ATENÇÃO',failed:'FALHA','not-tested':'NÃO TESTADO'};
  return `## Diagnóstico BZtune\nVersão: ${report.version}\nData UTC: ${report.createdAt}\n\n` + report.checks.map(c=>`- ${labels[c.status]} — ${c.name}: ${c.detail}`).join('\n') + '\n\n## O que aconteceu?\nDescreva o problema, os passos para reproduzir e o resultado esperado.\n';
}
export function diagnosticIssueUrl(report: DiagnosticReport): string {
  return 'https://github.com/BadZ7br/BZtune/issues/new?' + new URLSearchParams({title:'Diagnóstico do BZtune',body:diagnosticMarkdown(report)});
}
