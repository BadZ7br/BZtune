import {MoreHorizontal,Search,SlidersHorizontal,Plus,Heart,Play,ListPlus,ListMusic,Trash2,Music2} from 'lucide-react';
import ActionSheet from './ActionSheet';
import type {LibraryFilter} from './Albums';
import {useEffect,useRef,useState} from 'react';
import {isAndroidBridgeAvailable} from './services/audio';
import {libraryPage,importLibrary,forgetLibraryTrack,setLibraryFavorite,type LibraryPage,type LibraryTrack} from './services/library';

function Cover({src}:{src:string|null}) {
  const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);
  return <span className="library-cover">{src&&!failed?<img src={src} alt="" loading="lazy" onError={()=>setFailed(true)}/>:<Music2 aria-hidden="true"/>}</span>;
}
export default function Library({onPlay,playerBusy,onWorking,onPlaylist,onCatalogChange,requestedFilter,active=true,searchRequest=0,favoritesRequest=0,fixedFilter,onSummary,catalogRevision=0,onBatch}:{onBatch?:(ids:string[],playlist:boolean)=>Promise<void>;catalogRevision?:number;fixedFilter?:LibraryFilter;onSummary?:(value:{total:number;cover:string|null})=>void;active?:boolean;searchRequest?:number;favoritesRequest?:number;requestedFilter:LibraryFilter|null;onPlaylist:(id:string,title:string)=>void;onCatalogChange:()=>void;onWorking:(busy:boolean)=>void;onPlay:(id:string,append:boolean)=>Promise<void>;playerBusy:boolean}) {
  const summary=useRef(onSummary);summary.current=onSummary;
  const searchInput=useRef<HTMLInputElement>(null);const appliedFilter=useRef<LibraryFilter|null>(null);const searched=useRef(0);const favorited=useRef(0);
  const heading=useRef<HTMLHeadingElement>(null);const [filterLabel,setFilterLabel]=useState('');
  const [data,setData]=useState<LibraryPage|null>(null);
  const [sheet,setSheet]=useState<'filters'|LibraryTrack|null>(null);
  const [selection,setSelection]=useState<string[]|null>(null);
  const [sort,setSort]=useState<'title'|'artist'|'album'|'recent'>('title');
  const [favoritesOnly,setFavoritesOnly]=useState(false);
  const [query,setQuery]=useState('');const [artist,setArtist]=useState('');const [album,setAlbum]=useState('');const [page,setPage]=useState(0);
  const [working,setWorking]=useState(false);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [loadError,setLoadError]=useState('');const [message,setMessage]=useState('');const [revision,setRevision]=useState(0);
  const operationBusy=useRef(false);const request=useRef(0);const alive=useRef(true);const native=isAndroidBridgeAvailable();
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;onWorking(false);};},[onWorking]);
  useEffect(()=>{
    const generation=++request.current;
    if(!active||!native||working)return;
    setLoading(true);
    const timer=setTimeout(()=>{void libraryPage({query,artist:fixedFilter?.artist??artist,album:fixedFilter?.album??album,page,favoritesOnly,sort}).then(result=>{
      if(alive.current&&request.current===generation){setData(result);setLoadError('');if(!query&&!favoritesOnly)summary.current?.({total:result.total,cover:result.items.find(t=>t.cover)?.cover??null});}
    }).catch(e=>{if(alive.current&&request.current===generation)setLoadError((e as Error).message);})
      .finally(()=>{if(alive.current&&request.current===generation)setLoading(false);});},200);
    return()=>{clearTimeout(timer);if(request.current===generation)request.current++;};
  },[active,native,query,artist,album,page,favoritesOnly,working,revision,catalogRevision,sort,fixedFilter?.artist,fixedFilter?.album]);
  useEffect(()=>{if(active&&requestedFilter&&appliedFilter.current!==requestedFilter){appliedFilter.current=requestedFilter;setQuery('');setArtist(requestedFilter.artist);setAlbum(requestedFilter.album);setFavoritesOnly(false);setPage(0);setFilterLabel(requestedFilter.label);setRevision(v=>v+1);heading.current?.focus();heading.current?.scrollIntoView({block:'start'});}},[active,requestedFilter]);
  useEffect(()=>{if(active&&searchRequest!==searched.current){searched.current=searchRequest;setFilterLabel('');setArtist('');setAlbum('');setFavoritesOnly(false);setPage(0);searchInput.current?.focus();}},[active,searchRequest]);
  useEffect(()=>{if(active&&favoritesRequest!==favorited.current){favorited.current=favoritesRequest;setFilterLabel('');setQuery('');setArtist('');setAlbum('');setFavoritesOnly(true);setPage(0);heading.current?.focus();}},[active,favoritesRequest]);
  async function operate(action:()=>Promise<void>) {
    if(operationBusy.current)return;
    operationBusy.current=true;onWorking(true);
    request.current++;setWorking(true);setLoading(false);setError('');setMessage('');
    try {await action();}catch(e){if(alive.current)setError((e as Error).message);}finally{operationBusy.current=false;if(alive.current){setWorking(false);onWorking(false);}}
  }
  async function importFiles() {
    await operate(async()=>{
      const result=await importLibrary();if(!result||!alive.current)return;
      onCatalogChange();setFilterLabel('');setQuery('');setArtist('');setAlbum('');setPage(0);setFavoritesOnly(false);setData(result);
      setMessage(`${result.imported??result.items.length} arquivo(s) processado(s). Reimportar o mesmo arquivo atualiza os metadados.`);
    });
  }
  const disabled=working||loading;
  if(!active)return null;
  return <section className="mobile-library" aria-labelledby="library-title">
    <h2 id="library-title" className="sr-only" tabIndex={-1} ref={heading}>Biblioteca local</h2>
    <div className="library-searchbar"><Search aria-hidden="true"/><label className="sr-only" htmlFor="library-search">Buscar músicas</label><input id="library-search" ref={searchInput} type="search" value={query} maxLength={512} disabled={working||!native} onChange={e=>{setFilterLabel('');setQuery(e.target.value);setPage(0);}} placeholder="Buscar na biblioteca"/></div>
    <div className="library-toolbar">
     <div className="library-segments" role="group" aria-label="Exibição da biblioteca">
      <button disabled={working||!native} aria-pressed={!favoritesOnly} onClick={()=>{setFavoritesOnly(false);setPage(0);}}>Todas as músicas</button>
      <button disabled={working||!native} aria-pressed={favoritesOnly} onClick={()=>{setFavoritesOnly(true);setPage(0);}}>Favoritas</button>
     </div>
     {!fixedFilter&&<button className="icon-button" aria-label="Filtrar biblioteca" aria-haspopup="dialog" onClick={()=>setSheet('filters')}><SlidersHorizontal/>{(artist||album)&&<span className="filter-dot"/>}</button>}
     {!fixedFilter&&<button className="icon-button" aria-label="Importar músicas" disabled={!native||working} onClick={()=>void importFiles()}><Plus/></button>}
    </div>
    {!fixedFilter&&filterLabel&&<div><p role="status">{filterLabel}</p><button disabled={working} onClick={()=>{setFilterLabel('');setQuery('');setArtist('');setAlbum('');setFavoritesOnly(false);setPage(0);}}>Mostrar toda a biblioteca</button></div>}
    {!fixedFilter&&(artist||album)&&<p className="filter-summary">Filtros ativos · <button onClick={()=>{setArtist('');setAlbum('');setFilterLabel('');setPage(0);}}>Limpar</button></p>}
    {sheet==='filters'&&<ActionSheet title="Filtros da biblioteca" onClose={()=>setSheet(null)}>{dismiss=><>
     <div className="library-filters"><label>Ordenar por<select value={sort} onChange={e=>{setSort(e.target.value as typeof sort);setPage(0);}}><option value="title">Título</option><option value="artist">Artista</option><option value="album">Álbum</option><option value="recent">Adicionadas recentemente</option></select></label><label>Artista<select value={artist} disabled={working||!native} onChange={e=>{setFilterLabel('');setArtist(e.target.value);setAlbum('');setPage(0);}}><option value="">Todos os artistas</option>{data?.artists.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
     <label>Álbum<select value={album} disabled={working||!native} onChange={e=>{setFilterLabel('');setAlbum(e.target.value);setPage(0);}}><option value="">Todos os álbuns</option>{data?.albums.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label></div>
     <button className="primary" onClick={()=>dismiss()}>Ver resultados</button>
    </>}</ActionSheet>}
    {onBatch&&<div className="batch-toolbar"><button disabled={working} onClick={()=>setSelection(selection===null?[]:null)}>{selection===null?'Selecionar músicas':'Cancelar seleção'}</button>{selection!==null&&<><span role="status">{selection.length} selecionadas</span><button disabled={!selection.length||working} onClick={()=>void operate(async()=>{await onBatch(selection,false);if(alive.current)setSelection(null);})}>Adicionar seleção à fila</button><button disabled={!selection.length||working} onClick={()=>void operate(async()=>{await onBatch(selection,true);if(alive.current)setSelection(null);})}>Adicionar seleção à playlist</button></>}</div>}
    {loading&&<p role="status">Atualizando biblioteca…</p>}{working&&<p role="status">Processando arquivos…</p>}
    {message&&<p role="status">{message}</p>}
    {(error||loadError)&&<div role="alert"><p>{error||loadError}{data?' A última consulta válida foi preservada.':''}</p><button disabled={working} onClick={()=>{setError('');setLoadError('');setRevision(v=>v+1);}}>Recarregar biblioteca</button></div>}
    {data&&<><p>{data.total} música(s) nesta consulta.</p>
      {data.items.length===0&&!loading&&<p>{favoritesOnly?'Nenhuma favorita nesta consulta. Marque músicas em Todas as músicas ou ajuste os filtros.':'Nenhuma música encontrada. Importe arquivos ou ajuste os filtros.'}</p>}
      <ul className="library-tracks">{data.items.map(track=><li key={track.id}>
        {selection!==null&&<input type="checkbox" aria-label={`Selecionar ${track.title}`} checked={selection.includes(track.id)} disabled={working||(!selection.includes(track.id)&&selection.length>=200)} onChange={()=>setSelection(prev=>prev?.includes(track.id)?prev.filter(id=>id!==track.id):[...(prev??[]),track.id])}/>}
        <button className="library-track-main" disabled={disabled||playerBusy} onClick={()=>void operate(()=>onPlay(track.id,false))} aria-label={`Tocar agora ${track.title}`}>
         <Cover src={track.cover}/><span className="track-copy"><strong>{track.title}</strong><span>{track.artist} · {track.album}</span></span>{track.favorite&&<Heart className="track-favorite" fill="currentColor" aria-label="Favorita"/>}
        </button>
        <button className="icon-button track-more" aria-label={`Opções de ${track.title}`} aria-haspopup="dialog" disabled={disabled} onClick={()=>setSheet(track)}><MoreHorizontal/></button>
      </li>)}</ul>
      <nav className="queue-row-actions" aria-label="Páginas da biblioteca">
        <button disabled={disabled||data.page===0} onClick={()=>setPage(data.page-1)}>Página anterior</button><span>Página {data.page+1}</span>
        <button disabled={disabled||(data.page+1)*data.pageSize>=data.total} onClick={()=>setPage(data.page+1)}>Próxima página</button>
      </nav></>}
    {sheet&&typeof sheet==='object'&&<ActionSheet title={sheet.title} onClose={()=>setSheet(null)}>{dismiss=><>
     <p className="sheet-subtitle">{sheet.artist} · {sheet.album}</p>
     <div className="sheet-actions">
      <button disabled={disabled||playerBusy} aria-label={`Tocar agora ${sheet.title}`} onClick={()=>dismiss(()=>void operate(()=>onPlay(sheet.id,false)))}><Play/>Tocar agora</button>
      <button disabled={disabled||playerBusy} aria-label={`Adicionar ${sheet.title} à fila`} onClick={()=>dismiss(()=>void operate(()=>onPlay(sheet.id,true)))}><ListPlus/>Adicionar à fila</button>
      <button disabled={disabled} aria-label={`Adicionar ${sheet.title} à playlist`} onClick={()=>dismiss(()=>onPlaylist(sheet.id,sheet.title))}><ListMusic/>Adicionar à playlist</button>
      <button disabled={disabled} aria-pressed={data?.items.find(t=>t.id===sheet.id)?.favorite??sheet.favorite} aria-label={`Favoritar ${sheet.title}`} onClick={()=>dismiss(()=>void operate(async()=>{await setLibraryFavorite(sheet.id,!sheet.favorite);if(alive.current){setRevision(v=>v+1);onCatalogChange();setMessage(sheet.favorite?'Música removida das favoritas.':'Música adicionada às favoritas.');}}))}><Heart/>{sheet.favorite?'Remover das favoritas':'Marcar como favorita'}</button>
      <button className="destructive" disabled={disabled} aria-label={`Remover ${sheet.title} da biblioteca`} onClick={()=>dismiss(()=>void operate(async()=>{await forgetLibraryTrack(sheet.id);if(alive.current){setRevision(v=>v+1);onCatalogChange();setMessage('Registro removido da biblioteca. O arquivo e a fila foram preservados.');}}))}><Trash2/>Remover da biblioteca</button>
     </div><p className="sheet-help">Remover da biblioteca preserva o arquivo e a fila, mas retira a música das playlists.</p>
    </>}</ActionSheet>}
    <details className="library-help"><summary>Sobre seus arquivos</summary><p>Escolha até 200 arquivos por importação. Os arquivos não são copiados; mantenha-os no aparelho e preserve a permissão de acesso.</p></details>
  </section>;
}
