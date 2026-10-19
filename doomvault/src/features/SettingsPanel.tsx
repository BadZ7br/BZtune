import { useEffect, useState } from "react";
import { usePlayer } from "../player/PlayerContext";

type Theme = "dark" | "light" | "system";
type Density = "comfortable" | "compact";
type Preference = { theme: Theme; accent: string; density: Density; textSize: number; radius: number; motion: boolean; };
const STORAGE = "bztune-appearance-v1";
const DEFAULT: Preference = { theme: "dark", accent: "#d1ff63", density: "comfortable", textSize: 100, radius: 12, motion: true };
const PALETTE = ["#d1ff63", "#37cf7c", "#35c9ba", "#519bfd", "#a477f9", "#eb72bb", "#ff8f57", "#ffd45d"];
function load(): Preference {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) || "null") as Partial<Preference> | null;
    return {
      theme: raw?.theme === "dark" || raw?.theme === "light" || raw?.theme === "system" ? raw.theme : DEFAULT.theme,
      accent: typeof raw?.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.accent) ? raw.accent : DEFAULT.accent,
      density: raw?.density === "compact" ? "compact" : "comfortable",
      textSize: [90, 100, 110, 120].includes(raw?.textSize ?? -1) ? raw!.textSize! : DEFAULT.textSize,
      radius: [4, 8, 12, 18].includes(raw?.radius ?? -1) ? raw!.radius! : DEFAULT.radius,
      motion: typeof raw?.motion === "boolean" ? raw.motion : DEFAULT.motion,
    };
  } catch { return { ...DEFAULT }; }
}
function apply(p: Preference) {
  const root = document.documentElement;
  root.dataset.bztuneTheme = p.theme;
  if (p.theme === "system" && typeof window.matchMedia === "function") {
    root.dataset.bztuneSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches ? "yes" : "no";
  }
  root.dataset.bztuneDensity = p.density;
  root.dataset.bztuneMotion = p.motion ? "on" : "off";
  root.style.setProperty("--bz-user-accent", p.accent);
  root.style.setProperty("--bz-user-font-scale", String(p.textSize / 100));
  root.style.setProperty("--bz-user-radius", p.radius + "px");
}
export function initAppearance() {
  apply(load());
}
type Page = "general" | "appearance" | "playback" | "downloads" | "updates" | "data";
const NAV: { id: Page; name: string; hint: string }[] = [
  { id: "general", name: "Geral", hint: "Início e preferências" },
  { id: "appearance", name: "Interface", hint: "Temas e personalização" },
  { id: "playback", name: "Reprodução", hint: "Volume e player" },
  { id: "downloads", name: "Downloads", hint: "Biblioteca offline" },
  { id: "updates", name: "Atualizações", hint: "Versão e canal oficial" },
  { id: "data", name: "Dados", hint: "Backup e diagnóstico" },
];
export default function SettingsPanel({ onBackup }: { onBackup: () => void }) {
  const [page, setPage] = useState<Page>("appearance");
  const [prefs, setPrefs] = useState<Preference>(load);
  const { volume, setVolume, muted, toggleMute } = usePlayer();
  useEffect(() => {
    apply(prefs);
    try { localStorage.setItem(STORAGE, JSON.stringify(prefs)); } catch { /* acesso privado */ }
  }, [prefs]);
  useEffect(() => {
    if (prefs.theme !== "system") return;
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => document.documentElement.dataset.bztuneSystemDark = query.matches ? "yes" : "no";
    sync();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", sync);
      return () => query.removeEventListener("change", sync);
    }
    query.addListener(sync);
    return () => query.removeListener(sync);
  }, [prefs.theme]);
  function change<K extends keyof Preference>(key: K, value: Preference[K]) {
    setPrefs(before => ({ ...before, [key]: value }));
  }
  return <section className="bz-settings" aria-label="Configurações do BZtune">
    <div className="bz-settings-nav" role="tablist" aria-label="Categorias de configurações">
      {NAV.map(item => <button type="button" key={item.id} role="tab" aria-selected={page === item.id}
        onClick={() => setPage(item.id)} className={page === item.id ? "selected" : ""}>
        <strong>{item.name}</strong><small>{item.hint}</small>
      </button>)}
    </div>
    <div className="bz-settings-content" role="tabpanel">
      {page === "appearance" && <>
        <header><h2>Aparência e interface</h2><p>Personalize o BZtune. As mudanças são aplicadas imediatamente e salvas neste computador.</p></header>
        <div className="bz-settings-card"><h3>Tema</h3><div className="bz-settings-options">
          {(["dark", "light", "system"] as const).map(t => <button type="button" key={t} onClick={() => change("theme", t)}
            aria-pressed={prefs.theme === t} className={prefs.theme === t ? "chosen" : ""}>{t === "dark" ? "Escuro" : t === "light" ? "Claro (experimental)" : "Sistema"}</button>)}
        </div><p className="bz-theme-note">O tema escuro é o padrão recomendado. O tema claro está em desenvolvimento e mantém algumas páginas antigas escuras para preservar o contraste.</p></div>
        <div className="bz-settings-card"><h3>Cor de destaque</h3><div className="bz-settings-colors">
          {PALETTE.map(c => <button type="button" key={c} aria-label={`Selecionar cor ${c}`} title={c}
            aria-pressed={prefs.accent === c} className={prefs.accent === c ? "chosen" : ""}
            style={{ backgroundColor: c }} onClick={() => change("accent", c)} />)}
        </div><label className="bz-custom-color">Cor personalizada <input type="color" aria-label="Escolher uma cor personalizada de destaque" value={prefs.accent} onChange={e => change("accent", e.target.value)} /></label></div>
        <div className="bz-settings-card"><h3>Layout e legibilidade</h3>
          <label>Densidade <select value={prefs.density} onChange={e => change("density", e.target.value as Density)}>
            <option value="comfortable">Confortável</option><option value="compact">Compacta</option>
          </select></label>
          <label>Tamanho de texto <select value={prefs.textSize} onChange={e => change("textSize", Number(e.target.value))}>
            {[90, 100, 110, 120].map(n => <option key={n} value={n}>{n}%</option>)}
          </select></label>
          <label>Arredondamento <select value={prefs.radius} onChange={e => change("radius", Number(e.target.value))}>
            {[4, 8, 12, 18].map(n => <option key={n} value={n}>{n}px</option>)}
          </select></label>
          <label className="bz-settings-toggle">Permitir animações <input type="checkbox" checked={prefs.motion} onChange={e => change("motion", e.target.checked)} /></label>
          <button className="bz-settings-reset" type="button" onClick={() => setPrefs({ ...DEFAULT })}>Restaurar aparência padrão</button>
        </div>
      </>}
      {page === "general" && <div className="bz-settings-card"><h2>Geral</h2><p>As preferências de inicialização do Windows serão adicionadas quando puderem ser aplicadas pelo sistema.</p><p>Você já pode personalizar a aparência na aba Interface.</p></div>}
      {page === "playback" && <div className="bz-settings-card"><h2>Reprodução</h2>
        <label>Volume do aplicativo: {volume}% <input type="range" min="0" max="100" value={volume} onChange={e => setVolume(Number(e.target.value))}/></label>
        <label className="bz-settings-toggle">Silenciar <input type="checkbox" checked={muted} onChange={toggleMute}/></label>
        <p>Outros recursos de áudio continuam nos controles do player expandido.</p>
      </div>}
      {page === "downloads" && <div className="bz-settings-card"><h2>Downloads</h2><p>Gerencie as músicas baixadas e o armazenamento offline pela aba Biblioteca → Músicas offline.</p><p>A escolha da pasta de downloads depende de integração específica com o backend Windows.</p></div>}
      {page === "updates" && <div className="bz-settings-card"><h2>Atualizações</h2><p>A central de atualizações assinadas está no cartão Sistema → Atualizações, logo abaixo destas configurações.</p><p>Canal: GitHub Releases oficial.</p></div>}
      {page === "data" && <div className="bz-settings-card"><h2>Dados e backup</h2><p>Exporte, restaure e diagnostique os dados da sua biblioteca.</p>
        <button type="button" className="bz-settings-reset" onClick={onBackup}>Abrir Backup e diagnóstico</button>
      </div>}
    </div>
  </section>;
}
