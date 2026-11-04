import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Search,Disc3,UserRound,Music2,ChevronRight} from 'lucide-react';
import {isAndroidBridgeAvailable} from './services/audio';
import {catalog,cancelCatalog,type CatalogRoute,type CatalogKind,type CatalogResult,type CatalogItem} from './services/catalog';
let nextRequest=0;
export default function OnlineExplore({active,route,onNavigate}:{active:boolean;route:CatalogRoute|null;onNavigate:(route:CatalogRoute)=>void}) {
 const [query,setQuery]=useState(route?.query??'');const [kind,setKind]=useState<CatalogKind>(route?.kind??'artists');
 const [data,setData]=useState<{key:string;value:CatalogResult}|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [cancelled,setCancelled]=useState(false);const [revision,setRevision]=useState(0);const [trackPage,setTrackPage]=useState(0);
 const epoch=useRef(0),currentRequest=useRef(''),force=useRef(false);const heading=useRef<HTMLHeadingElement>(null);const search=useRef<HTMLInputElement>(null);
 const key=JSON.stringify(route);const native=isAndroidBridgeAvailable();const dirty=!!route&&(query!==route.query||kind!==route.kind);
 useEffect(()=>{setQuery(route?.query??'');setKind(route?.kind??'artists');setCancelled(false);setError('');force.current=false;setTrackPage(0);},[key]);
 useEffect(()=>{if(active){if(route)heading.current?.focus();else search.current?.focus();}},[key,active]);
 useEffect(()=>{
  const generation=++epoch.current;setLoading(false);
  if(!active||!route||dirty||cancelled||!native)return;
  const requestId=`online-${Date.now()}-${++nextRequest}`;currentRequest.current=requestId;setLoading(true);setError('');
  void catalog(route,requestId,force.current).then(value=>{if(generation===epoch.current)setData({key,value});}).catch(e=>{if(generation===epoch.current)setError((e as Error).message);}).finally(()=>{if(generation===epoch.current)setLoading(false);});
  return()=>{epoch.current++;void cancelCatalog(requestId);};
 },[active,key,dirty,cancelled,revision,native]);
 const result=data?.key===key?data.value:null;
 function refresh(){force.current=true;setCancelled(false);setRevision(v=>v+1);}
 function open(item:CatalogItem){if(item.entity==='track')return;onNavigate({action:item.entity,query,kind,id:item.id,page:0,label:item.title});}
 if(!active)return null;
 return <section className="online-explore" aria-labelledby="online-title">
  <h2 id="online-title" ref={heading} tabIndex={-1}>{route?.action==='search'?`Resultados: ${route.query}`:route?.label||'Explorar música online'}</h2>
  <p>Artistas, lançamentos e gravações do MusicBrainz. A consulta é enviada a esse catálogo; a reprodução destas faixas ainda não está disponível.</p>
  <form className="online-search" onSubmit={e=>{e.preventDefault();if(!native||query.trim().length<2)return;onNavigate({action:'search',query:query.trim(),kind,id:'',page:0,label:''});}}>
   <label>Pesquisar por<select value={kind} onChange={e=>setKind(e.target.value as CatalogKind)}><option value="artists">Artistas</option><option value="albums">Álbuns</option><option value="recordings">Músicas</option></select></label>
   <label>Pesquisar online<input ref={search} type="search" maxLength={160} value={query} onChange={e=>setQuery(e.target.value)} placeholder={kind==='artists'?'Nome do artista':kind==='albums'?'Nome do álbum':'Nome da música'}/></label>
   <button className="primary" disabled={!native||query.trim().length<2}><Search/>Pesquisar</button>
  </form>
  {route&&<div className="queue-row-actions"><button onClick={()=>history.back()}><ArrowLeft/>Voltar</button><button disabled={loading||!native||dirty} onClick={refresh}>Atualizar catálogo</button></div>}
  {loading&&<div role="status"><p>Consultando o catálogo…</p><button onClick={()=>{epoch.current++;setCancelled(true);setLoading(false);void cancelCatalog(currentRequest.current);}}>Cancelar consulta</button></div>}
  {cancelled&&<p role="status">Consulta cancelada.</p>}
  {dirty&&<p>Toque em Pesquisar para consultar o novo texto ou categoria.</p>}
  {error&&<div role="alert"><p>{error}{result?' Os últimos dados válidos desta página foram preservados.':''}</p><button onClick={refresh}>Tentar novamente</button></div>}
  {!dirty&&result&&<>
   <div className="catalog-context"><p>{result.heading}{result.description?` · ${result.description}`:''}</p><p>{result.cached?'Dados salvos':'Dados consultados'} · {new Date(result.fetchedAt).toLocaleString('pt-BR')}{result.offline?' · Fonte indisponível; exibindo a cópia salva.':''}</p></div>
   <p>{result.pageable?`${result.total} resultado(s). Página ${result.page+1}.`:`${result.items.length} item(ns) retornado(s).`}</p>
   {!result.complete&&<p>A fonte não garante uma lista completa neste detalhe.</p>}
   {result.items.length===0&&!loading&&<p>Nenhum resultado nesta página. Ajuste a busca ou volte à página anterior.</p>}
   <ul className="online-results">{result.items.slice(trackPage*50,trackPage*50+50).map(item=><li key={item.id}>
    <div className="online-result"><span className="catalog-symbol" aria-hidden="true">{item.entity==='artist'?<UserRound/>:item.entity==='recording'||item.entity==='track'?<Music2/>:<Disc3/>}</span><div><strong>{item.title}</strong>{item.artist&&<p>{item.artist}</p>}{item.detail&&<p>{item.detail}</p>}{item.duration!==null&&<p>{Math.floor(item.duration/60000)}:{String(Math.floor(item.duration/1000)%60).padStart(2,'0')}</p>}</div></div>
    {item.entity!=='track'&&<button onClick={()=>open(item)} aria-label={`${item.entity==='artist'?'Ver álbuns de':item.entity==='group'?'Ver edições de':item.entity==='release'?'Ver faixas de':'Ver lançamentos de'} ${item.title}`}>{item.entity==='artist'?'Ver álbuns':item.entity==='group'?'Escolher edição':item.entity==='release'?'Ver faixas':'Ver lançamentos'}<ChevronRight/></button>}
   </li>)}</ul>
   {!result.pageable&&result.items.length>50&&<nav className="queue-row-actions" aria-label="Páginas de faixas"><button disabled={trackPage===0} onClick={()=>setTrackPage(v=>v-1)}>{result.items[0]?.entity==='track'?'Faixas anteriores':'Lançamentos anteriores'}</button><span>Página {trackPage+1}</span><button disabled={(trackPage+1)*50>=result.items.length} onClick={()=>setTrackPage(v=>v+1)}>{result.items[0]?.entity==='track'?'Próximas faixas':'Próximos lançamentos'}</button></nav>}
   {result.pageable&&<nav className="queue-row-actions" aria-label="Páginas do catálogo"><button disabled={loading||result.page===0} onClick={()=>onNavigate({...route!,page:result.page-1})}>Página online anterior</button><button disabled={loading||result.page===399||(result.page+1)*25>=result.total} onClick={()=>onNavigate({...route!,page:result.page+1})}>Próxima página online</button></nav>}
   {result.pageable&&result.total>10000&&<p>Até 10.000 resultados por consulta. Refine o texto para encontrar outros resultados.</p>}
  </>}
 </section>;
}
