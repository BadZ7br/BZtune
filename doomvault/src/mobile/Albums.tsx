import {Search,Disc3,MoreHorizontal,Heart,Check,UserRound,ListMusic} from 'lucide-react';
import Artwork from './Artwork';
import ActionSheet from './ActionSheet';
import {useEffect,useRef,useState} from 'react';
import {isAndroidBridgeAvailable} from './services/audio';
import {albums,type Album,type AlbumPage,type AlbumQuery} from './services/albums';
export type LibraryFilter={album:string;artist:string;label:string};
type Props={active?:boolean;collectionRequest?:number;disabled:boolean;catalogRevision:number;onWorking:(busy:boolean)=>void;onOpenAlbum:(album:Album)=>void;onOpenArtist:(artist:string)=>void;artistName?:string};
export default function Albums({disabled,catalogRevision,onWorking,onOpenAlbum,onOpenArtist,artistName,active=true,collectionRequest=0}:Props) {
 const [selected,setSelected]=useState<Album|null>(null);
 const [data,setData]=useState<AlbumPage|null>(null);const [query,setQuery]=useState('');const [artist,setArtist]=useState('');const [filter,setFilter]=useState<AlbumQuery['filter']>('all');const [page,setPage]=useState(0);
 const [error,setError]=useState('');const [message,setMessage]=useState('');const [working,setWorking]=useState(false);const [loading,setLoading]=useState(false);const [revision,setRevision]=useState(0);
 const collected=useRef(0);const alive=useRef(true),busy=useRef(false),epoch=useRef(0);const native=isAndroidBridgeAvailable();
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;onWorking(false);};},[onWorking]);
 useEffect(()=>{
  const current=++epoch.current;if(!active||!native||working)return;setLoading(true);let stopped=false;
  const timer=setTimeout(()=>void albums({query,artist:artistName??artist,filter,page}).then(result=>{if(!stopped&&alive.current&&current===epoch.current){setData(result);}}).catch(e=>{if(!stopped&&alive.current&&current===epoch.current)setError((e as Error).message);}).finally(()=>{if(!stopped&&alive.current&&current===epoch.current)setLoading(false);}),150);
  return()=>{stopped=true;clearTimeout(timer);};
 },[active,native,query,artist,filter,page,catalogRevision,revision,working,artistName]);
 useEffect(()=>{if(active&&collectionRequest!==collected.current){collected.current=collectionRequest;setFilter('collection');setQuery('');setArtist('');setPage(0);}},[active,collectionRequest]);
 async function mark(a:Album,field:'favorite'|'collected') {
  if(busy.current||disabled)return;busy.current=true;epoch.current++;setWorking(true);onWorking(true);setError('');setMessage('');
  try {
   const result=await albums({query,artist:artistName??artist,filter,page},{id:a.id,favorite:field==='favorite'?!a.favorite:a.favorite,collected:field==='collected'?!a.collected:a.collected,expectedFavorite:a.favorite,expectedCollected:a.collected});
   if(alive.current){setData(result);setMessage('Escolha do álbum salva.');}
  }catch(e){if(alive.current)setError((e as Error).message);}finally{busy.current=false;if(alive.current){setWorking(false);onWorking(false);}}
 }
 const locked=disabled||working||loading||!native;
 if(!active)return null;
 return <section className="mobile-albums" aria-labelledby="albums-title"><h2 id="albums-title" className={artistName?'':'sr-only'}>{artistName?'Álbuns':'Álbuns e coleção'}</h2>
  {artistName?<details className="artist-album-options"><summary>Filtrar álbuns</summary>  <div className="library-segments album-segments" role="group" aria-label="Exibição dos álbuns">{([['all','Todos os álbuns'],['favorites','Álbuns favoritos'],['collection','Coleção']] as const).map(([value,label])=><button key={value} disabled={disabled||working||!native} aria-pressed={filter===value} onClick={()=>{setFilter(value);setPage(0);}}>{label}</button>)}</div>
  <div className="library-searchbar"><Search aria-hidden="true"/><label className="sr-only" htmlFor="album-search">Buscar álbuns</label><input id="album-search" type="search" value={query} maxLength={512} disabled={disabled||working||!native} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="Álbum, artista ou ano"/></div>
</details>:<>  <div className="library-segments album-segments" role="group" aria-label="Exibição dos álbuns">{([['all','Todos os álbuns'],['favorites','Álbuns favoritos'],['collection','Coleção']] as const).map(([value,label])=><button key={value} disabled={disabled||working||!native} aria-pressed={filter===value} onClick={()=>{setFilter(value);setPage(0);}}>{label}</button>)}</div>
  <div className="library-searchbar"><Search aria-hidden="true"/><label className="sr-only" htmlFor="album-search">Buscar álbuns</label><input id="album-search" type="search" value={query} maxLength={512} disabled={disabled||working||!native} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="Álbum, artista ou ano"/></div>
</>}
  {!artistName&&<details className="album-filter"><summary>Filtrar por artista{artist?` · ${artist}`:''}</summary><label className="sr-only" htmlFor="album-artist">Artista do álbum</label><select id="album-artist" value={artist} disabled={disabled||working||!native} onChange={e=>{setArtist(e.target.value);setPage(0);}}><option value="">Todos os artistas</option>{data?.artists.map(a=><option key={a} value={a}>{a}</option>)}</select></details>}
  {loading&&<p role="status">Carregando álbuns…</p>}{working&&<p role="status">Salvando álbum…</p>}{message&&<p role="status">{message}</p>}
  {error&&<div role="alert"><p>{error}</p><button disabled={disabled||working} onClick={()=>{setError('');setRevision(v=>v+1);}}>Recarregar álbuns</button></div>}
  {data&&<><p>{data.total} álbum(ns) nesta consulta.</p>{data.items.length===0&&!loading&&<p>Nenhum álbum nesta consulta. Importe músicas, ajuste os filtros ou salve um álbum na coleção.</p>}
   <ul className="album-list album-grid">{data.items.map(a=><li key={a.id} data-album-id={a.id} data-favorite={a.favorite} data-collected={a.collected}>
    <button className="album-card" disabled={locked} onClick={()=>onOpenAlbum(a)} aria-label={`Abrir álbum ${a.title} ${a.year}`}>
     <span className="album-art">{a.cover?<Artwork src={a.cover}/>:<Disc3 aria-hidden="true"/>}{a.year&&<span>{a.year}</span>}</span>
     <strong>{a.title}</strong><span className="album-card-artist">{a.artist}</span><span className="album-card-meta">{a.year?`${a.year} · `:''}{a.count} música(s) locais</span>
    </button>
    <div className="album-card-bottom"><span>{a.favorite&&<Heart fill="currentColor" aria-label="Álbum favorito"/>}{a.collected&&<Check aria-label="Na coleção"/>}</span><button className="icon-button" disabled={locked} aria-label={`Opções do álbum ${a.title} ${a.year}`} aria-haspopup="dialog" onClick={()=>setSelected(a)}><MoreHorizontal/></button></div>
   </li>)}</ul><nav className="queue-row-actions" aria-label="Páginas de álbuns"><button disabled={locked||data.page===0} onClick={()=>setPage(data.page-1)}>Álbuns anteriores</button><span>Página {data.page+1}</span><button disabled={locked||(data.page+1)*50>=data.total} onClick={()=>setPage(data.page+1)}>Próximos álbuns</button></nav>
  </>}
  {selected&&<ActionSheet title={`${selected.title}${selected.year?` (${selected.year})`:''}`} onClose={()=>setSelected(null)}>{dismiss=><>
   <p className="sheet-subtitle">{selected.artist} · {selected.count} música(s) locais</p><div className="sheet-actions">
    <button disabled={locked||selected.count===0} aria-label={`Ver músicas de ${selected.title} ${selected.year}`} onClick={()=>dismiss(()=>onOpenAlbum(selected))}><ListMusic/>Ver músicas</button>
    <button disabled={locked} aria-label={`Ver artista ${selected.artist}`} onClick={()=>dismiss(()=>onOpenArtist(selected.artist))}><UserRound/>Ver artista</button>
    <button disabled={locked} aria-pressed={selected.favorite} aria-label={`Favoritar álbum ${selected.title} ${selected.year}`} onClick={()=>dismiss(()=>void mark(selected,'favorite'))}><Heart/>{selected.favorite?'Remover dos álbuns favoritos':'Favoritar álbum'}</button>
    <button disabled={locked} aria-pressed={selected.collected} aria-label={`Colecionar álbum ${selected.title} ${selected.year}`} onClick={()=>dismiss(()=>void mark(selected,'collected'))}><Check/>{selected.collected?'Remover da coleção':'Adicionar à coleção'}</button>
   </div><p className="sheet-help">Favoritas de músicas e álbuns são independentes. A coleção preserva álbuns mesmo sem arquivos locais.</p>
  </>}</ActionSheet>}
  <details className="library-help"><summary>Sobre álbuns e edições</summary><p>Artista do álbum, título e ano identificam cada edição. Metadados iguais não permitem distinguir gravações diferentes; revise as tags para separar essas edições. Álbuns salvos permanecem na coleção mesmo sem arquivos locais.</p></details>
 </section>;
}
