import {useEffect,useRef,useState} from 'react';
import {isAndroidBridgeAvailable} from './services/audio';
import {libraryPage,importLibrary,forgetLibraryTrack,setLibraryFavorite,type LibraryPage} from './services/library';

function Cover({src}:{src:string|null}) {
  const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);
  return <span className="library-cover">{src&&!failed?<img src={src} alt="" loading="lazy" onError={()=>setFailed(true)}/>:<span aria-hidden="true">♫</span>}</span>;
}
export default function Library({onPlay,playerBusy,onWorking,onPlaylist,onCatalogChange}:{onPlaylist:(id:string,title:string)=>void;onCatalogChange:()=>void;onWorking:(busy:boolean)=>void;onPlay:(id:string,append:boolean)=>Promise<void>;playerBusy:boolean}) {
  const [data,setData]=useState<LibraryPage|null>(null);
  const [favoritesOnly,setFavoritesOnly]=useState(false);
  const [query,setQuery]=useState('');const [artist,setArtist]=useState('');const [album,setAlbum]=useState('');const [page,setPage]=useState(0);
  const [working,setWorking]=useState(false);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [loadError,setLoadError]=useState('');const [message,setMessage]=useState('');const [revision,setRevision]=useState(0);
  const operationBusy=useRef(false);const request=useRef(0);const alive=useRef(true);const native=isAndroidBridgeAvailable();
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;onWorking(false);};},[onWorking]);
  useEffect(()=>{
    const generation=++request.current;
    if(!native||working)return;
    setLoading(true);
    const timer=setTimeout(()=>{void libraryPage({query,artist,album,page,favoritesOnly}).then(result=>{
      if(alive.current&&request.current===generation){setData(result);setLoadError('');}
    }).catch(e=>{if(alive.current&&request.current===generation)setLoadError((e as Error).message);})
      .finally(()=>{if(alive.current&&request.current===generation)setLoading(false);});},200);
    return()=>{clearTimeout(timer);if(request.current===generation)request.current++;};
  },[native,query,artist,album,page,favoritesOnly,working,revision]);
  async function operate(action:()=>Promise<void>) {
    if(operationBusy.current)return;
    operationBusy.current=true;onWorking(true);
    request.current++;setWorking(true);setLoading(false);setError('');setMessage('');
    try {await action();}catch(e){if(alive.current)setError((e as Error).message);}finally{operationBusy.current=false;if(alive.current){setWorking(false);onWorking(false);}}
  }
  async function importFiles() {
    await operate(async()=>{
      const result=await importLibrary();if(!result||!alive.current)return;
      onCatalogChange();setQuery('');setArtist('');setAlbum('');setPage(0);setFavoritesOnly(false);setData(result);
      setMessage(`${result.imported??result.items.length} arquivo(s) processado(s). Reimportar o mesmo arquivo atualiza os metadados.`);
    });
  }
  const disabled=working||loading;
  return <section className="mobile-library" aria-labelledby="library-title">
    <h2 id="library-title">Biblioteca local</h2>
    <p>Salve os arquivos escolhidos no catálogo do aparelho. A fila de reprodução continua separada.</p>
    <button disabled={!native||working} onClick={()=>void importFiles()}>{working?'Aguarde…':'Importar músicas'}</button>
    <div className="queue-row-actions" role="group" aria-label="Exibição da biblioteca">
      <button disabled={working||!native} aria-pressed={!favoritesOnly} onClick={()=>{setFavoritesOnly(false);setPage(0);}}>Todas as músicas</button>
      <button disabled={working||!native} aria-pressed={favoritesOnly} onClick={()=>{setFavoritesOnly(true);setPage(0);}}>Favoritas</button>
    </div>
    <div className="library-filters">
      <label>Buscar músicas<input type="search" value={query} maxLength={512} disabled={working||!native} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="Título, artista ou álbum"/></label>
      <label>Artista<select value={artist} disabled={working||!native} onChange={e=>{setArtist(e.target.value);setAlbum('');setPage(0);}}><option value="">Todos os artistas</option>{data?.artists.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
      <label>Álbum<select value={album} disabled={working||!native} onChange={e=>{setAlbum(e.target.value);setPage(0);}}><option value="">Todos os álbuns</option>{data?.albums.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
    </div>
    {loading&&<p role="status">Atualizando biblioteca…</p>}{working&&<p role="status">Processando arquivos…</p>}
    {message&&<p role="status">{message}</p>}
    {(error||loadError)&&<div role="alert"><p>{error||loadError}{data?' A última consulta válida foi preservada.':''}</p><button disabled={working} onClick={()=>{setError('');setLoadError('');setRevision(v=>v+1);}}>Recarregar biblioteca</button></div>}
    {data&&<><p>{data.total} música(s) nesta consulta.</p>
      {data.items.length===0&&!loading&&<p>{favoritesOnly?'Nenhuma favorita nesta consulta. Marque músicas em Todas as músicas ou ajuste os filtros.':'Nenhuma música encontrada. Importe arquivos ou ajuste os filtros.'}</p>}
      <ul className="library-tracks">{data.items.map(track=><li key={track.id}>
        <div className="library-track-info"><Cover src={track.cover}/><div><strong>{track.title}</strong><p>{track.artist} · {track.album}{track.year?` · ${track.year}`:''}</p></div></div>
        <div className="queue-row-actions">
          <button disabled={disabled} aria-pressed={track.favorite} aria-label={`Favoritar ${track.title}`} onClick={()=>void operate(async()=>{
            await setLibraryFavorite(track.id,!track.favorite);
            if(alive.current){setRevision(v=>v+1);setMessage(track.favorite?'Música removida das favoritas.':'Música adicionada às favoritas.');}
          })}>{track.favorite?'♥ Favorita':'♡ Favoritar'}</button>
          <button disabled={disabled} onClick={()=>onPlaylist(track.id,track.title)} aria-label={`Adicionar ${track.title} à playlist`}>Adicionar à playlist</button>
          <button disabled={disabled||playerBusy} onClick={()=>void operate(()=>onPlay(track.id,false))} aria-label={`Tocar agora ${track.title}`}>Tocar agora</button>
          <button disabled={disabled||playerBusy} onClick={()=>void operate(()=>onPlay(track.id,true))} aria-label={`Adicionar ${track.title} à fila`}>Adicionar à fila</button>
          <button disabled={disabled} onClick={()=>void operate(async()=>{await forgetLibraryTrack(track.id);if(alive.current){setRevision(v=>v+1);onCatalogChange();setMessage('Registro removido da biblioteca. O arquivo e a fila foram preservados.');}})} aria-label={`Remover ${track.title} da biblioteca`}>Remover registro</button>
        </div>
      </li>)}</ul>
      <nav className="queue-row-actions" aria-label="Páginas da biblioteca">
        <button disabled={disabled||data.page===0} onClick={()=>setPage(data.page-1)}>Página anterior</button><span>Página {data.page+1}</span>
        <button disabled={disabled||(data.page+1)*data.pageSize>=data.total} onClick={()=>setPage(data.page+1)}>Próxima página</button>
      </nav></>}
    <p>Escolha até 200 arquivos por importação. Os arquivos não são copiados; mantenha-os no aparelho e preserve a permissão de acesso. Remover um registro não apaga o áudio nem retira músicas da fila.</p>
  </section>;
}
