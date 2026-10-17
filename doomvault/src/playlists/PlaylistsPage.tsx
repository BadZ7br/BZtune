import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Disc3, GripVertical, ImagePlus, ListPlus, Pencil, Play, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { usePlayer } from "../player/PlayerContext";
import type { PlayerTrack } from "../player/PlayerContext";
import { API, fullUrl, videoIdValid, type StoredTrack } from "../utils/music-utils";
type Entry={id:string;source:"web"|"local";videoId:string;title:string;artist:string;album?:string|null;cover?:string|null;audioUrl?:string|null;trackId?:string|null};
type Playlist={id:string;name:string;description:string;coverUrl?:string|null;count:number;tracks:Entry[]};
const headers={"Content-Type":"application/json"};
async function json<T>(path:string,init?:RequestInit):Promise<T>{
  const res=await fetch(`${API}${path}`,init);const data=await res.json() as T&{error?:string};
  if(!res.ok)throw new Error(data.error||`Erro HTTP ${res.status}`);return data;
}
function toPlayer(e:Entry):PlayerTrack {
  const videoId=e.source==="local" ? (e.videoId||`library:${e.trackId}`) : e.videoId;
  return {videoId,title:e.title,artist:e.artist,album:e.album||null,audioUrl:fullUrl(e.audioUrl),cover:fullUrl(e.cover)||null};
}
export default function PlaylistsPage(){
  const {playTrack,addToQueue}=usePlayer();
  const [lists,setLists]=useState<Playlist[]>([]);const [library,setLibrary]=useState<StoredTrack[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [name,setName]=useState("");const [description,setDescription]=useState("");const [filter,setFilter]=useState("");
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");const [editing,setEditing]=useState(false);
  const [dragOver,setDragOver]=useState<number|null>(null);const dragging=useRef<number|null>(null);const imageInput=useRef<HTMLInputElement>(null);
  const active=lists.find(p=>p.id===selected)||null;
  const refresh=useCallback(async()=>{
    try{const [p,t]=await Promise.all([json<{playlists:Playlist[]}>("/api/playlists"),json<{tracks:StoredTrack[]}>("/api/library/tracks")]);
      setLists(p.playlists);setLibrary(t.tracks);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Falha ao carregar playlists")}
  },[]);
  useEffect(()=>{void refresh();const handler=()=>{void refresh()};window.addEventListener("doomvault-playlists-updated",handler);
    return()=>window.removeEventListener("doomvault-playlists-updated",handler)},[refresh]);
  async function action(task:()=>Promise<unknown>,msg:string){
    setBusy(true);setError("");setNotice("");
    try{await task();await refresh();setNotice(msg)}catch(e){setError(e instanceof Error?e.message:"Operação falhou")}
    finally{setBusy(false)}
  }
  async function create(){if(!name.trim())return;let id="";
    await action(async()=>{const value=await json<{playlist:Playlist}>("/api/playlists",{method:"POST",headers,body:JSON.stringify({name,description})});
      id=value.playlist.id;setName("");setDescription("")},"Playlist criada.");if(id)setSelected(id);
  }
  async function saveEdit(){if(!active||!name.trim())return;const id=active.id;
    await action(()=>json(`/api/playlists/${id}`,{method:"PATCH",headers,body:JSON.stringify({name,description})}),"Playlist atualizada.");
    setEditing(false);setName("");setDescription("");
  }
  function startEdit(){if(!active)return;setName(active.name);setDescription(active.description);setEditing(true)}
  async function removeList(){if(!active||!window.confirm(`Excluir playlist “${active.name}”?`))return;
    await action(()=>json(`/api/playlists/${active.id}`,{method:"DELETE"}),"Playlist excluída.");setSelected(null);setEditing(false);
  }
  async function addLocal(t:StoredTrack){if(!active)return;
    await action(()=>json(`/api/playlists/${active.id}/tracks`,{method:"POST",headers,body:JSON.stringify({track_id:t.id})}),"Música adicionada.");
  }
  async function removeEntry(e:Entry){if(!active)return;
    await action(()=>json(`/api/playlists/${active.id}/entries/${e.id}`,{method:"DELETE"}),"Música removida.");
  }
  async function reorder(from:number,to:number){if(!active||from===to||from<0||to<0||to>=active.tracks.length)return;
    const ids=active.tracks.map(t=>t.id);const [moved]=ids.splice(from,1);ids.splice(to,0,moved);
    await action(()=>json(`/api/playlists/${active.id}/order`,{method:"PUT",headers,body:JSON.stringify({entry_ids:ids})}),"Ordem atualizada.");
  }
  async function uploadCover(file:File|undefined){if(!active||!file)return;
    if(file.size>3*1024*1024){setError("A imagem deve ter até 3 MiB.");return;}
    const form=new FormData();form.append("file",file);
    await action(()=>json(`/api/playlists/${active.id}/cover`,{method:"POST",body:form}),"Capa atualizada.");
  }
  async function clearCover(){if(!active)return;
    await action(()=>json(`/api/playlists/${active.id}/cover`,{method:"DELETE"}),"Capa removida.");
  }
  function playAll(entry?:Entry){if(!active?.tracks.length)return;
    const playable=active.tracks.filter(t=>t.audioUrl||videoIdValid(t.videoId));
    if(!playable.length)return;
    const list=playable.map(toPlayer);const target=entry&&playable.find(t=>t.id===entry.id)||playable[0];
    playTrack(toPlayer(target),list);
  }
  const used=new Set(active?.tracks.filter(t=>t.trackId).map(t=>t.trackId)||[]);
  const available=library.filter(t=>!used.has(t.id)&&`${t.title} ${t.artist}`.toLowerCase().includes(filter.toLowerCase()));
  const art=active?.coverUrl?`${fullUrl(active.coverUrl)}?v=${encodeURIComponent(notice||active.id)}`:fullUrl(active?.tracks[0]?.cover);
  return <section className="pl-root">
    <div className="pl-heading"><div><div className="pl-kicker">DOOMVAULT / TUAS MÚSICAS</div><h1>Playlists<span>.</span></h1><p>Mistura músicas online e offline na mesma playlist, com ordem e capa personalizadas.</p></div>
      <button className="pl-icon" onClick={()=>void refresh()} title="Atualizar" aria-label="Atualizar playlists"><RefreshCw size={17}/></button></div>
    {error&&<p className="pl-error" role="alert">{error}</p>}{notice&&<p className="pl-notice" role="status">{notice}</p>}
    <div className="pl-columns"><aside className="pl-side"><h2>Minhas playlists <small>{lists.length}</small></h2>
      <form className="pl-create" onSubmit={e=>{e.preventDefault();void create()}}>
        <input value={editing?"":name} disabled={editing} onChange={e=>setName(e.target.value)} maxLength={100} placeholder="Nome da playlist" required aria-label="Nome da playlist"/>
        <input value={editing?"":description} disabled={editing} onChange={e=>setDescription(e.target.value)} maxLength={400} placeholder="Descrição (opcional)" aria-label="Descrição da playlist"/>
        <button className="pl-primary" type="submit" disabled={busy||editing||!name.trim()}><Plus size={16}/> Criar playlist</button>
      </form>
      {lists.map(p=><button key={p.id} className={`pl-select ${selected===p.id?"active":""}`} onClick={()=>{setSelected(p.id);setEditing(false);setName("");setDescription("")}}>
        <Disc3 size={20}/><span><strong>{p.name}</strong><small>{p.count} faixas</small></span></button>)}
    </aside>
    <div className="pl-detail">{!active?<div className="pl-empty"><Disc3 size={40}/><h2>Seleciona ou cria uma playlist</h2><p>As listas são salvas permanentemente no SQLite.</p></div>:<>
      <div className="pl-hero"><div className="pl-hero-art">{art?<img src={art} alt={`Capa de ${active.name}`} onError={e=>e.currentTarget.style.display="none"}/>:<Disc3 size={44}/>}</div>
        <div className="pl-hero-info"><span>PLAYLIST</span><h2>{active.name}</h2><p>{active.description||"Sem descrição"}</p><small>{active.count} faixas · online e offline</small>
          <input ref={imageInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e=>{void uploadCover(e.target.files?.[0]);e.target.value=""}}/>
          <div className="pl-hero-actions"><button className="pl-primary" disabled={!active.count} onClick={()=>playAll()}><Play size={15}/> Reproduzir tudo</button>
            <button title="Trocar capa" disabled={busy} onClick={()=>imageInput.current?.click()}><ImagePlus size={16}/></button>
            {active.coverUrl&&<button title="Remover capa personalizada" disabled={busy} onClick={()=>void clearCover()}><X size={16}/></button>}
            <button title="Editar playlist" disabled={busy} onClick={startEdit}><Pencil size={16}/></button>
            <button title="Excluir playlist" disabled={busy} onClick={()=>void removeList()}><Trash2 size={16}/></button>
          </div>
        </div>
      </div>
      {editing&&<form className="pl-edit" onSubmit={e=>{e.preventDefault();void saveEdit()}}>
        <input value={name} onChange={e=>setName(e.target.value)} required aria-label="Novo nome"/>
        <input value={description} onChange={e=>setDescription(e.target.value)} aria-label="Nova descrição"/>
        <button disabled={busy||!name.trim()}><Check size={16}/> Salvar</button><button type="button" onClick={()=>{setEditing(false);setName("");setDescription("")}}><X size={16}/> Cancelar</button>
      </form>}
      <h3>Faixas da playlist</h3>{!active.tracks.length&&<p className="pl-muted">Ainda vazia. Usa o botão de playlist na pesquisa ou adiciona arquivos abaixo.</p>}
      {active.tracks.map((t,i)=><div className={`pl-track ${dragOver===i?"pl-drop-target":""}`} key={t.id}
        onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";setDragOver(i)}}
        onDragLeave={()=>setDragOver(null)}
        onDrop={e=>{e.preventDefault();const from=dragging.current;dragging.current=null;setDragOver(null);if(from!==null)void reorder(from,i)}}>
        <span className="pl-drag-handle" draggable={!busy} title="Arrastar" onDragStart={e=>{dragging.current=i;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",t.id)}} onDragEnd={()=>{dragging.current=null;setDragOver(null)}}><GripVertical size={18}/></span>
        <div className="pl-track-art">{t.cover?<img src={fullUrl(t.cover)} alt="" onError={e=>e.currentTarget.style.display="none"}/>:<Disc3 size={18}/>}</div>
        <div className="pl-track-text"><strong>{i+1}. {t.title}</strong><small>{t.artist} · {t.audioUrl?"Offline disponível":"Online"}</small></div>
        <button title="Reproduzir" onClick={()=>playAll(t)}><Play size={16}/></button><button title="Adicionar à fila" onClick={()=>addToQueue(toPlayer(t))}><ListPlus size={16}/></button>
        <button disabled={busy||i===0} title="Subir" onClick={()=>void reorder(i,i-1)}><ArrowUp size={16}/></button>
        <button disabled={busy||i===active.tracks.length-1} title="Descer" onClick={()=>void reorder(i,i+1)}><ArrowDown size={16}/></button>
        <button disabled={busy} title="Remover da playlist" onClick={()=>void removeEntry(t)}><X size={16}/></button>
      </div>)}
      <h3>Adicionar da Biblioteca offline</h3><input className="pl-search" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Pesquisar músicas baixadas..." aria-label="Pesquisar músicas para adicionar"/>
      <div className="pl-add-list">{available.map(t=><div className="pl-add-item" key={t.id}><span><strong>{t.title}</strong><small>{t.artist}</small></span><button disabled={busy} onClick={()=>void addLocal(t)}><Plus size={16}/> Adicionar</button></div>)}</div>
    </>}</div></div>
  </section>;
}
