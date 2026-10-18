import { useEffect, useState } from "react";
import { BarChart3, Download, RefreshCw, Trash2 } from "lucide-react";

const API = "http://127.0.0.1:5000";
type Ranked = { name: string; artist?: string; title?: string; seconds: number; plays?: number };
type Entry = { id: string; artist: string; title: string; album: string; source: string; seconds: number; started_at: string };
type Summary = {
  totals: { seconds: number; plays: number; tracks: number; artists: number };
  artists: Ranked[]; tracks: Array<Ranked & { id: string; title: string; artist: string }>;
  albums: Ranked[]; daily: Array<{ day: string; seconds: number }>;
  history: Entry[]; thresholdSeconds: number;
};
type Wrapped = { year: number; month?: number | null; seconds: number; plays: number; uniqueArtists: number; topArtists: Ranked[]; months: Array<{ month: string; seconds: number }> };
function time(value: number): string { return `${Math.round(value / 60).toLocaleString("pt-BR")} min`; }

export default function ListeningStatsPage() {
  const [period, setPeriod] = useState("month");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [wrapped, setWrapped] = useState<Wrapped | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let live = true;
    setBusy(true);setError("");
    Promise.all([
      fetch(`${API}/api/bztune/stats/summary?period=${period}`).then(async r => {if (!r.ok) throw Error("API de estatísticas indisponível"); return await r.json() as Summary;}),
      fetch(`${API}/api/bztune/stats/wrapped?year=${year}&month=${month}`).then(async r => {if (!r.ok) throw Error("Retrospectiva indisponível"); return await r.json() as Wrapped;}),
    ]).then(([s,w]) => {if (live){setSummary(s);setWrapped(w);}})
      .catch((e: unknown) => {if(live)setError(e instanceof Error?e.message:"Erro ao carregar estatísticas");})
      .finally(() => {if (live)setBusy(false);});
    return () => {live=false;};
  },[period,year,month,revision]);

  async function clear() {
    if (!window.confirm("Excluir TODO o histórico de reprodução? Essa operação não pode ser desfeita sem backup.")) return;
    const response = await fetch(`${API}/api/bztune/stats/history`,{
      method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirm:"EXCLUIR HISTORICO"})
    });
    if (response.ok) setRevision(r => r+1);
    else setError("Não foi possível limpar o histórico.");
  }

  const max = Math.max(1,...(summary?.daily || []).map(row=>row.seconds));
  return <section className="bz-feat-root">
    <div className="bz-feat-header"><div><p className="bz-eyebrow">BZTUNE / ESTATÍSTICAS</p><h2>Minhas estatísticas<span>.</span></h2><p>Tempo de escuta e favoritos reais, guardados apenas na tua biblioteca local.</p></div>
      <button title="Atualizar" onClick={()=>setRevision(n=>n+1)}><RefreshCw size={18}/></button></div>
    <div className="bz-feat-form"><label>Período<select value={period} onChange={e=>setPeriod(e.target.value)}><option value="week">7 dias</option><option value="month">30 dias</option><option value="year">12 meses</option><option value="all">Todo o histórico</option></select></label>
      <label>Ano da retrospectiva<input type="number" min="2000" max={new Date().getFullYear()+1} value={year} onChange={e=>setYear(Number(e.target.value))}/></label>
      <label>Mês<select value={month} onChange={e=>setMonth(Number(e.target.value))}><option value={0}>Ano inteiro</option>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{String(i+1).padStart(2,"0")}</option>)}</select></label></div>
    {busy && <p role="status" className="bz-hint">Carregando estatísticas...</p>}
    {error && <p role="alert" className="bz-error">{error}</p>}
    {summary && <>
      <div className="bz-stats-cards"><div><strong>{time(summary.totals.seconds)}</strong><span>Tempo ouvido</span></div><div><strong>{summary.totals.plays}</strong><span>Reproduções (+30s)</span></div><div><strong>{summary.totals.artists}</strong><span>Artistas</span></div><div><strong>{summary.totals.tracks}</strong><span>Faixas distintas</span></div></div>
      <div className="bz-stats-columns"><div><h3>Artistas mais ouvidos</h3>{summary.artists.map((a,i)=><div className="bz-stat-row" key={a.name}><span>{i+1}. {a.name}</span><strong>{time(a.seconds)}</strong></div>)}</div>
        <div><h3>Músicas favoritas</h3>{summary.tracks.map((t,i)=><div className="bz-stat-row" key={t.id}><span>{i+1}. {t.title} — {t.artist}</span><strong>{time(t.seconds)}</strong></div>)}</div></div>
      <h3><BarChart3 size={18} /> Atividade diária</h3>
      <div className="bz-day-bars" aria-label="Gráfico de atividade diária">{summary.daily.slice(-30).map(d=><div key={d.day} title={`${d.day}: ${time(d.seconds)}`} style={{height:`${Math.max(4,d.seconds/max*100)}%`}}><span className="sr-only">{d.day}: {time(d.seconds)}</span></div>)}</div>
      <div className="bz-feat-subheading"><h3>Histórico recente</h3><div className="bz-action-row"><a href={`${API}/api/bztune/stats/export.csv`} download><Download size={15}/> Exportar CSV</a><button onClick={()=>void clear()}><Trash2 size={15}/> Limpar</button></div></div>
      <div className="bz-history">{summary.history.length ? summary.history.map(entry=><div key={entry.id}><span>{entry.title} — {entry.artist}<small> · {entry.source === "local" ? "Local" : "Online"}</small></span><small>{time(entry.seconds)} · {entry.started_at}</small></div>) : <p className="bz-hint">Ainda sem reproduções registradas. Toca uma música por pelo menos 30 segundos.</p>}</div>
    </>}
    {wrapped && <div className="bz-wrapped"><span>BZTUNE WRAPPED {wrapped.month ? `${String(wrapped.month).padStart(2,"0")}/` : ""}{wrapped.year}</span><h3>{time(wrapped.seconds)} de música</h3><p>{wrapped.plays} reproduções · {wrapped.uniqueArtists} artistas diferentes</p>
      <strong>Teu top 5</strong><ol>{wrapped.topArtists.map(row=><li key={row.name}>{row.name} — {time(row.seconds)}</li>)}</ol>
      <button onClick={()=>navigator.clipboard.writeText(`Meu BZtune Wrapped ${year}: ${time(wrapped.seconds)} ouvidos. Top: ${wrapped.topArtists.map(x=>x.name).join(", ")}`)}>Copiar resumo</button>
    </div>}
  </section>;
}
