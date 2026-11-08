import {useEffect,useRef,useState} from 'react';
import {Search,UserRound,ChevronRight} from 'lucide-react';
import {libraryPage} from './services/library';
import {isAndroidBridgeAvailable} from './services/audio';

type Props={query:string;page:number;onFilter:(query:string,page:number)=>void;active:boolean;revision:number;disabled:boolean;onOpen:(name:string)=>void};
export default function Artists({active,revision,disabled,onOpen,query,page,onFilter}:Props){
 const [names,setNames]=useState<string[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0);
 const epoch=useRef(0);const native=isAndroidBridgeAvailable();
 useEffect(()=>{const id=++epoch.current;if(!active||!native)return;setLoading(true);setError('');
  void libraryPage({query:'',artist:'',album:'',page:0,favoritesOnly:false}).then(result=>{if(id===epoch.current)setNames(result.artists);}).catch(e=>{if(id===epoch.current)setError((e as Error).message);}).finally(()=>{if(id===epoch.current)setLoading(false);});
  return()=>{epoch.current++;};
 },[active,revision,native,retry]);
 if(!active)return null;
 const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
 const list=names.filter(n=>fold(n).includes(fold(query))),current=Math.min(page,Math.floor(Math.max(0,list.length-1)/50));
 return <section className="mobile-artists" aria-labelledby="artists-title">
  <h2 id="artists-title" className="sr-only">Artistas locais</h2>
  <div className="library-searchbar"><Search aria-hidden="true"/><label htmlFor="artist-search" className="sr-only">Buscar artistas</label><input id="artist-search" type="search" maxLength={512} value={query} onChange={e=>onFilter(e.target.value,0)} placeholder="Buscar artistas"/></div>
  {loading&&<p role="status">Carregando artistas…</p>}
  {error&&<div role="alert"><p>{error}</p><button onClick={()=>setRetry(v=>v+1)}>Recarregar artistas</button></div>}
  <p className="catalog-count">{list.length} artista(s) na biblioteca</p>
  {!loading&&!error&&list.length===0&&<p>Nenhum artista encontrado. Importe músicas ou ajuste a busca.</p>}
  <ul className="artist-list">{list.slice(current*50,current*50+50).map(name=><li key={name}><button disabled={disabled||loading} onClick={()=>onOpen(name)} aria-label={`Abrir artista ${name}`}><span className="artist-avatar"><UserRound/></span><span className="track-copy"><strong>{name||'Artista sem nome'}</strong><span>Ver álbuns e músicas locais</span></span><ChevronRight/></button></li>)}</ul>
  {list.length>50&&<nav className="queue-row-actions" aria-label="Páginas de artistas"><button disabled={current===0} onClick={()=>onFilter(query,current-1)}>Artistas anteriores</button><span>Página {current+1}</span><button disabled={(current+1)*50>=list.length} onClick={()=>onFilter(query,current+1)}>Próximos artistas</button></nav>}
 </section>;
}
