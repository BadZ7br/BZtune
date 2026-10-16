import { useEffect, useState } from "react";
import { Check, ListPlus, LoaderCircle, X } from "lucide-react";
import { API, videoIdValid } from "../music-utils";
import "./add-to-playlist.css";

type Playlist = {id:string;name:string};
type Song = {video_id:string|null;title:string;artist?:string};
type Props = {artist:string;title:string;kind:"track"|"release";videoId?:string|null;albumId?:string|null;cover?:string|null;album?:string};
async function readJson<T>(url:string,init?:RequestInit):Promise<T> {
  const res=await fetch(url,init);
  const value=await res.json() as T & {error?:string};
  if(!res.ok)throw new Error(value.error || `Erro HTTP ${res.status}`);
  return value;
}
export default function AddToPlaylistButton({artist,title,kind,videoId,albumId,cover,album}:Props) {
  const [open,setOpen]=useState(false);
  const [lists,setLists]=useState<Playlist[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  useEffect(()=>{setOpen(false);setNotice("");setError("")},[artist,title,kind,videoId,albumId]);
  async function toggle() {
    if(open){setOpen(false);return;}
    setOpen(true);setBusy(true);setError("");setNotice("");
    try {const data=await readJson<{playlists:Playlist[]}>(`${API}/api/playlists`);setLists(data.playlists)}
    catch(e){setError(e instanceof Error?e.message:"Erro ao listar playlists")}
    finally{setBusy(false)}
  }
  async function addTo(playlist:Playlist) {
    setBusy(true);setError("");setNotice("");
    try {
      let entries:{video_id:string;title:string;artist:string;album:string;cover:string|null}[]=[];
      if(kind==="track"){
        if(!videoIdValid(videoId))throw new Error("Esta música não tem ID de reprodução disponível.");
        entries=[{video_id:videoId,title,artist,album:album||"",cover:cover||null}];
      }else{
        if(!albumId)throw new Error("Não foi possível identificar o lançamento.");
        const data=await readJson<{tracks:Song[]}>(`${API}/api/albums/${encodeURIComponent(albumId)}`);
        entries=(data.tracks||[]).filter((t):t is Song&{video_id:string}=>videoIdValid(t.video_id))
          .map(t=>({video_id:t.video_id,title:t.title,artist:t.artist||artist,album:title,cover:cover||null}));
        if(!entries.length)throw new Error("Nenhuma faixa online disponível neste lançamento.");
      }
      const result=await readJson<{added:number;duplicates:number;invalid:number}>(`${API}/api/playlists/${encodeURIComponent(playlist.id)}/tracks/bulk`,{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tracks:entries})});
      setNotice(`${result.added} adicionada(s) à playlist “${playlist.name}”${result.duplicates?` · ${result.duplicates} já existente(s)`:""}${result.invalid?` · ${result.invalid} inválida(s)`:""}.`);
      window.dispatchEvent(new Event("doomvault-playlists-updated"));
    }catch(e){setError(e instanceof Error?e.message:"Falha ao adicionar à playlist")}
    finally{setBusy(false)}
  }
  return <span className="dv-pl-add">
    <button type="button" className="dv-pl-add-trigger" title="Adicionar à playlist" aria-label={`Adicionar ${title} à playlist`} aria-expanded={open} onClick={()=>void toggle()}><ListPlus size={17}/></button>
    {open&&<span className="dv-pl-popover" role="dialog" aria-label="Escolher playlist">
      <span className="dv-pl-popover-heading"><strong>Adicionar à playlist</strong><button onClick={()=>setOpen(false)} aria-label="Fechar"><X size={15}/></button></span>
      <span className="dv-pl-popover-subtitle">{title} · {artist}</span>
      {busy&&<span className="dv-pl-feedback"><LoaderCircle size={14}/> Processando...</span>}
      {!busy&&lists.length===0&&!error&&<span className="dv-pl-feedback">Cria uma playlist na aba Playlists primeiro.</span>}
      {lists.map(list=><button type="button" key={list.id} className="dv-pl-choice" disabled={busy} onClick={()=>void addTo(list)}><ListPlus size={15}/>{list.name}</button>)}
      {error&&<span className="dv-pl-error" role="alert">{error}</span>}
      {notice&&<span className="dv-pl-success" role="status"><Check size={14}/>{notice}</span>}
    </span>}
  </span>;
}
