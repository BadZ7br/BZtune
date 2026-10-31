import {useEffect,useRef,useState} from 'react';
import {isAndroidBridgeAvailable} from './services/audio';
import {albums,type Album,type AlbumPage,type AlbumQuery} from './services/albums';
export type LibraryFilter={album:string;artist:string;label:string};
type Props={active?:boolean;collectionRequest?:number;disabled:boolean;catalogRevision:number;onWorking:(busy:boolean)=>void;onView:(filter:LibraryFilter)=>void};
export default function Albums({disabled,catalogRevision,onWorking,onView,active=true,collectionRequest=0}:Props) {
 const [data,setData]=useState<AlbumPage|null>(null);const [query,setQuery]=useState('');const [artist,setArtist]=useState('');const [filter,setFilter]=useState<AlbumQuery['filter']>('all');const [page,setPage]=useState(0);
 const [error,setError]=useState('');const [message,setMessage]=useState('');const [working,setWorking]=useState(false);const [loading,setLoading]=useState(false);const [revision,setRevision]=useState(0);
 const collected=useRef(0);const alive=useRef(true),busy=useRef(false),epoch=useRef(0);const native=isAndroidBridgeAvailable();
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;onWorking(false);};},[onWorking]);
 useEffect(()=>{
  const current=++epoch.current;if(!active||!native||working)return;setLoading(true);let stopped=false;
  const timer=setTimeout(()=>void albums({query,artist,filter,page}).then(result=>{if(!stopped&&alive.current&&current===epoch.current){setData(result);}}).catch(e=>{if(!stopped&&alive.current&&current===epoch.current)setError((e as Error).message);}).finally(()=>{if(!stopped&&alive.current&&current===epoch.current)setLoading(false);}),150);
  return()=>{stopped=true;clearTimeout(timer);};
 },[active,native,query,artist,filter,page,catalogRevision,revision,working]);
 useEffect(()=>{if(active&&collectionRequest!==collected.current){collected.current=collectionRequest;setFilter('collection');setQuery('');setArtist('');setPage(0);}},[active,collectionRequest]);
 async function mark(a:Album,field:'favorite'|'collected') {
  if(busy.current||disabled)return;busy.current=true;epoch.current++;setWorking(true);onWorking(true);setError('');setMessage('');
  try {
   const result=await albums({query,artist,filter,page},{id:a.id,favorite:field==='favorite'?!a.favorite:a.favorite,collected:field==='collected'?!a.collected:a.collected,expectedFavorite:a.favorite,expectedCollected:a.collected});
   if(alive.current){setData(result);setMessage('Escolha do álbum salva.');}
  }catch(e){if(alive.current)setError((e as Error).message);}finally{busy.current=false;if(alive.current){setWorking(false);onWorking(false);}}
 }
 const locked=disabled||working||loading||!native;
 if(!active)return null;
 return <section className="mobile-albums" aria-labelledby="albums-title"><h2 id="albums-title">Álbuns e coleção</h2>
  <p>Artista do álbum, título e ano identificam cada edição. Favoritos de álbuns e músicas são independentes.</p>
  <div className="queue-row-actions" role="group" aria-label="Exibição dos álbuns">{([['all','Todos os álbuns'],['favorites','Álbuns favoritos'],['collection','Coleção']] as const).map(([value,label])=><button key={value} disabled={disabled||working||!native} aria-pressed={filter===value} onClick={()=>{setFilter(value);setPage(0);}}>{label}</button>)}</div>
  <div className="library-filters"><label>Buscar álbuns<input type="search" value={query} maxLength={512} disabled={disabled||working||!native} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="Álbum, artista ou ano"/></label><label>Artista do álbum<select value={artist} disabled={disabled||working||!native} onChange={e=>{setArtist(e.target.value);setPage(0);}}><option value="">Todos os artistas</option>{data?.artists.map(a=><option key={a} value={a}>{a}</option>)}</select></label></div>
  {loading&&<p role="status">Carregando álbuns…</p>}{working&&<p role="status">Salvando álbum…</p>}{message&&<p role="status">{message}</p>}
  {error&&<div role="alert"><p>{error}</p><button disabled={disabled||working} onClick={()=>{setError('');setRevision(v=>v+1);}}>Recarregar álbuns</button></div>}
  {data&&<><p>{data.total} álbum(ns) nesta consulta.</p>{data.items.length===0&&!loading&&<p>Nenhum álbum nesta consulta. Importe músicas, ajuste os filtros ou salve um álbum na coleção.</p>}
   <ul className="album-list">{data.items.map(a=><li key={a.id}><strong>{a.title}</strong><p>{a.artist}{a.year?` · ${a.year}`:''} · {a.count} música(s) locais</p>
    <div className="queue-row-actions"><button disabled={locked||a.count===0} onClick={()=>onView({album:a.id,artist:'',label:`Álbum: ${a.title}${a.year?` (${a.year})`:''}`})} aria-label={`Ver músicas de ${a.title} ${a.year}`}>Ver músicas</button><button disabled={locked} onClick={()=>{setArtist(a.artist);setPage(0);onView({album:'',artist:a.artist,label:`Artista: ${a.artist}`});}} aria-label={`Ver artista ${a.artist}`}>Ver artista</button><button disabled={locked} aria-pressed={a.favorite} aria-label={`Favoritar álbum ${a.title} ${a.year}`} onClick={()=>void mark(a,'favorite')}>{a.favorite?'♥ Álbum favorito':'♡ Favoritar álbum'}</button><button disabled={locked} aria-pressed={a.collected} aria-label={`Colecionar álbum ${a.title} ${a.year}`} onClick={()=>void mark(a,'collected')}>{a.collected?'Na coleção':'Adicionar à coleção'}</button></div>
   </li>)}</ul><nav className="queue-row-actions" aria-label="Páginas de álbuns"><button disabled={locked||data.page===0} onClick={()=>setPage(data.page-1)}>Álbuns anteriores</button><span>Página {data.page+1}</span><button disabled={locked||(data.page+1)*50>=data.total} onClick={()=>setPage(data.page+1)}>Próximos álbuns</button></nav>
  </>}
  <p>Álbuns salvos permanecem na coleção mesmo sem arquivos locais. Metadados iguais não permitem distinguir gravações diferentes; revise as tags para separar essas edições.</p>
 </section>;
}
