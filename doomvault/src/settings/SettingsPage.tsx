import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Settings2, Monitor, Headphones, Download, RefreshCw, Database,
  RotateCcw, Volume2, Palette, Info, FolderOpen, ArrowRight,
} from "lucide-react";
import { usePlayer } from "../player/PlayerContext";
import BZtuneVersionLabel from "../BZtuneVersionLabel";
import { ACCENT_COLORS, useAppearance } from "./AppearanceContext";

type Category = "general" | "interface" | "playback" | "downloads" | "updates" | "data";
type Props = { onOpenBackup: () => void; onOpenDownloads: () => void; updater: ReactNode };
const CATEGORIES: { id: Category; name: string; summary: string }[] = [
  { id: "general", name: "Geral", summary: "Inicialização e comportamento" },
  { id: "interface", name: "Interface", summary: "Temas, cores e aparência" },
  { id: "playback", name: "Reprodução", summary: "Volume, ordem e áudio" },
  { id: "downloads", name: "Downloads", summary: "Músicas e armazenamento" },
  { id: "updates", name: "Atualizações", summary: "Versão e segurança" },
  { id: "data", name: "Dados", summary: "Backup e diagnóstico" },
];

function SectionHeading({ title, description }: { title: string; description: string }) {
  return <div className="bz-settings-section-heading"><h2>{title}</h2><p>{description}</p></div>;
}
function Field({ label, hint, hintId, children }: { label: string; hint?: string; hintId?: string; children: ReactNode }) {
  return <div className="bz-settings-field">
    <div><strong>{label}</strong>{hint && <small id={hintId}>{hint}</small>}</div>
    <div className="bz-settings-field-control">{children}</div>
  </div>;
}
function Switch({ checked, onChange, label, describedBy }: { checked: boolean; onChange: (next: boolean) => void; label: string; describedBy?: string }) {
  return <button type="button" role="switch" aria-label={label} aria-describedby={describedBy} aria-checked={checked}
    className={"bz-settings-switch " + (checked ? "on" : "")} onClick={() => onChange(!checked)}>
    <span className="bz-settings-switch-track" aria-hidden="true"><span className="bz-settings-switch-thumb" /></span>
  </button>;
}
export default function SettingsPage({ onOpenBackup, onOpenDownloads, updater }: Props) {
  const { preferences: pref, update, resetAppearance } = useAppearance();
  const player = usePlayer();
  const [category, setCategory] = useState<Category>("interface");
  const [crossfade, setCrossfadeValue] = useState(() => {
    try {
      const n: unknown = JSON.parse(localStorage.getItem("bztune-crossfade-v13") || "0");
      return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : 0;
    } catch { return 0; }
  });
  useEffect(() => {
    function syncPlayerCrossfade(event: Event) {
      const value = (event as CustomEvent<number>).detail;
      if (Number.isFinite(value) && value >= 0 && value <= 10) setCrossfadeValue(value);
    }
    window.addEventListener("bztune-crossfade-change", syncPlayerCrossfade);
    return () => window.removeEventListener("bztune-crossfade-change", syncPlayerCrossfade);
  }, []);
  const setCrossfade = (value: number) => {
    setCrossfadeValue(value);
    try { localStorage.setItem("bztune-crossfade-v13", JSON.stringify(value)); } catch { /* restrito */ }
    window.dispatchEvent(new CustomEvent("bztune-crossfade-change", { detail: value }));
  };
  return <section className="bz-settings-page" aria-label="Configurações do BZtune">
    <header className="bz-settings-header">
      <span className="bz-settings-eyebrow">BZtune / Sistema</span>
      <div className="bz-settings-header-line"><div><h1>Configurações<span>.</span></h1>
        <p>Personalize o BZtune do seu jeito. As alterações são aplicadas imediatamente.</p></div>
        <button type="button" className="bz-settings-reset" onClick={resetAppearance}><RotateCcw size={15} /> Redefinir aparência</button>
      </div>
    </header>
    <nav className="bz-settings-categories" aria-label="Categorias de configurações">
      {CATEGORIES.map(c => <button type="button" key={c.id}
        className={"bz-settings-category " + (category === c.id ? "active" : "")}
        aria-current={category === c.id ? "page" : undefined} onClick={() => setCategory(c.id)}>
        {c.id === "general" && <Settings2 size={21} />}
        {c.id === "interface" && <Monitor size={21} />}
        {c.id === "playback" && <Headphones size={21} />}
        {c.id === "downloads" && <Download size={21} />}
        {c.id === "updates" && <RefreshCw size={21} />}
        {c.id === "data" && <Database size={21} />}
        <span><strong>{c.name}</strong><small>{c.summary}</small></span>
      </button>)}
    </nav>

    {category === "general" && <div className="bz-settings-panel">
      <SectionHeading title="Geral" description="Preferências de navegação e verificações automáticas." />
      <Field label="Página inicial" hint="Escolha qual área abrir ao iniciar o BZtune.">
        <select aria-label="Página inicial" value={pref.startPage} onChange={e => update("startPage", e.target.value as typeof pref.startPage)}>
          <option value="last">Continuar de onde parei</option><option value="home">Início</option>
          <option value="explore">Explorar</option><option value="library">Biblioteca</option><option value="system">Sistema</option>
        </select>
      </Field>
      <Field label="Verificar atualizações automaticamente" hint="Consulta o canal oficial ao abrir o aplicativo, sem instalar sem permissão.">
        <Switch label="Verificar atualizações automaticamente" checked={pref.autoUpdates} onChange={v => update("autoUpdates", v)} />
      </Field>
      <Field label="Idioma" hint="Outros idiomas poderão ser adicionados futuramente."><span className="bz-settings-static">Português (Brasil)</span></Field>
    </div>}

    {category === "interface" && <div className="bz-settings-panel">
      <SectionHeading title="Aparência" description="Escolha um tema e personalize cores, tamanho e efeitos." />
      <div className="bz-settings-theme-grid" role="group" aria-label="Tema do BZtune">
        {([
          ["dark", "Escuro", "Preto clássico"],
          ["midnight", "Meia-noite", "Azul profundo"],
          ["light", "Claro", "Interface luminosa"],
          ["system", "Sistema", "Segue o Windows"],
        ] as const).map(([theme, title, subtitle]) =>
          <button key={theme} type="button" className={"bz-theme-option " + (pref.theme === theme ? "selected" : "")}
            aria-pressed={pref.theme === theme} onClick={() => update("theme", theme)}>
            <span className={"bz-theme-preview theme-" + theme}>
              <i /><i /><i /><b /><em />
            </span><strong>{title}</strong><small>{subtitle}</small>
          </button>
        )}
      </div>

      <SectionHeading title="Cor de destaque" description="Escolha uma cor. Textos e controles se adaptam ao tema para manter a legibilidade." />
      <div className="bz-accent-picker" role="group" aria-label="Cor de destaque">
        {ACCENT_COLORS.map(color => <button type="button" key={color}
          className={"bz-accent-swatch " + (pref.accent.toLowerCase() === color ? "active" : "")}
          aria-label={"Cor " + color}
          aria-pressed={pref.accent.toLowerCase() === color} onClick={() => update("accent", color)}>
          <span className="bz-accent-swatch-color" style={{ backgroundColor: color }} aria-hidden="true" />
        </button>)}
        <label className="bz-color-custom">Cor personalizada
          <input type="color" value={pref.accent} onChange={e => update("accent", e.target.value)} aria-label="Selecionar cor personalizada" />
        </label>
      </div>
      <div className="bz-settings-grid-fields">
        <Field label="Densidade" hint="Espaçamento de listas, cartões e controles.">
          <select aria-label="Densidade" value={pref.density} onChange={e => update("density", e.target.value as typeof pref.density)}>
            <option value="compact">Compacta</option><option value="normal">Padrão</option><option value="spacious">Espaçosa</option>
          </select>
        </Field>
        <Field label="Tamanho dos textos" hint="Ajuste a legibilidade do aplicativo.">
          <select aria-label="Tamanho dos textos" value={pref.fontSize} onChange={e => update("fontSize", e.target.value as typeof pref.fontSize)}>
            <option value="small">Pequeno</option><option value="medium">Médio</option><option value="large">Grande</option>
          </select>
        </Field>
        <Field label="Cantos dos cartões" hint="Arredondamento de cartões, campos e botões.">
          <select aria-label="Cantos dos cartões" value={pref.corners} onChange={e => update("corners", e.target.value as typeof pref.corners)}>
            <option value="square">Discretos</option><option value="soft">Arredondados</option><option value="round">Bem arredondados</option>
          </select>
        </Field>
        <Field label="Transparência" hint="Fundos translúcidos e desfoque nos painéis, menus e player.">
          <Switch label="Efeitos de transparência" checked={pref.transparency} onChange={v => update("transparency", v)} />
        </Field>
        <Field label="Animações" hint="Transições e movimentos decorativos.">
          <Switch label="Animações da interface" checked={pref.animations} onChange={v => update("animations", v)} />
        </Field>
        <Field label="Sombras" hint="Profundidade nos cartões, player e pop-ups.">
          <Switch label="Sombras de cartões" checked={pref.shadows} onChange={v => update("shadows", v)} />
        </Field>
        <Field label="Brilho da lateral" hint="Destaque luminoso no menu selecionado.">
          <Switch label="Brilho da barra lateral" checked={pref.sidebarGlow} onChange={v => update("sidebarGlow", v)} />
        </Field>
        <Field label="Reforçar indicador de foco" hintId="bz-focus-hint" hint="Aumenta o contorno de 2 para 3 px ao navegar com teclado. Desligado, mantém o foco básico visível.">
          <Switch label="Reforçar indicador de foco" describedBy="bz-focus-hint" checked={pref.focusRings} onChange={v => update("focusRings", v)} />
        </Field>
      </div>
      <p className="bz-settings-note"><Palette size={14} /> A alteração afeta somente a aparência; seus arquivos, músicas e playlists não são modificados.</p>
    </div>}

    {category === "playback" && <div className="bz-settings-panel">
      <SectionHeading title="Reprodução" description="Preferências aplicadas ao player atual." />
      <Field label="Volume" hint="Altera o volume do player imediatamente.">
        <label className="bz-settings-range"><Volume2 size={17}/><input type="range" min="0" max="100"
          aria-label="Volume" value={player.volume} onChange={e => player.setVolume(Number(e.target.value))} />
          <strong>{player.volume}%</strong></label>
      </Field>
      <Field label="Reprodução aleatória" hint="Escolhe a próxima música de forma aleatória.">
        <Switch label="Reprodução aleatória" checked={player.shuffle} onChange={() => player.toggleShuffle()} />
      </Field>
      <Field label="Repetição" hint="Desativada, toda a fila ou somente a música atual.">
        <button className="bz-settings-action" type="button" onClick={player.cycleRepeat}>
          {player.repeat === "off" ? "Desativada" : player.repeat === "all" ? "Repetir fila" : "Repetir música"}
        </button>
      </Field>
      <Field label="Crossfade entre faixas locais" hint="Transição gradual entre arquivos locais; não se aplica ao YouTube nem ao modo aleatório.">
        <label className="bz-settings-range"><input type="range" min="0" max="10" step="1" aria-label="Crossfade"
          value={crossfade} onChange={e => setCrossfade(Number(e.target.value))} /><strong>{crossfade}s</strong></label>
      </Field>
    </div>}

    {category === "downloads" && <div className="bz-settings-panel">
      <SectionHeading title="Downloads e biblioteca" description="Acesse os downloads reais e a biblioteca offline." />
      <div className="bz-settings-info"><FolderOpen size={20}/><div>
        <strong>Biblioteca local</strong>
        <p>Arquivos e transferências são gerenciados no módulo de Biblioteca; o armazenamento permanece preservado.</p>
      </div></div>
      <button className="bz-settings-action" type="button" onClick={onOpenDownloads}><Download size={16}/> Abrir biblioteca e downloads <ArrowRight size={15}/></button>
      <p className="bz-settings-note">A escolha de pasta e formatos será adicionada quando o serviço de downloads oferecer suporte a essas opções.</p>
    </div>}

    {/* Deixe o slot sempre montado, mesmo quando esta categoria está oculta.
        O script Tauri injeta e mantém o botão apenas uma vez. */}
    <div className="bz-settings-panel" style={{ display: category === "updates" ? "block" : "none" }} aria-hidden={category !== "updates"}>
      <SectionHeading title="Atualizações" description="Baixe e instale versões assinadas pelo próprio BZtune." />
      <div className="bz-settings-info"><RefreshCw size={20}/><div><strong>BZtune <BZtuneVersionLabel /></strong>
        <p>O instalador é verificado antes de ser aplicado. A biblioteca é preservada.</p></div></div>
      <div className="bz-system-card bz-system-update-card">{updater}</div>
      <Field label="Verificação ao iniciar" hint="Consulta silenciosamente as atualizações disponíveis.">
        <Switch label="Verificação automática de atualizações" checked={pref.autoUpdates} onChange={v => update("autoUpdates", v)} />
      </Field>
    </div>

    {category === "data" && <div className="bz-settings-panel">
      <SectionHeading title="Dados e segurança" description="Mantenha seus arquivos e coleções protegidos." />
      <div className="bz-settings-info"><Database size={20}/><div><strong>Backup, restauração e diagnóstico</strong>
        <p>Use as ferramentas existentes para exportar dados ou conferir o estado dos serviços locais.</p></div></div>
      <button className="bz-settings-action" type="button" onClick={onOpenBackup}><FolderOpen size={16}/> Abrir Backup e diagnóstico <ArrowRight size={15}/></button>
      <p className="bz-settings-note"><Info size={14}/> Redefinir a aparência não apaga músicas, histórico ou playlists.</p>
    </div>}
  </section>;
}
