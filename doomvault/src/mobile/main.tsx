import OnlineExplore from './OnlineExplore';
import Albums,{type LibraryFilter} from './Albums';
import Playlists,{type PendingTrack} from './Playlists';
import Backup from './Backup';
import Library from './Library';
import Artwork from './Artwork';
import ExpandedPlayer from './ExpandedPlayer';
import React,{useEffect,useRef,useState,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {Home,Search,LibraryBig,Settings,Play,Pause,ListMusic,Heart,Disc3,FolderOpen} from 'lucide-react';
import {audioCommand,emptyAudio,isAndroidBridgeAvailable,type AudioState,type AudioCommand} from './services/audio';
import {trackDetails,type TrackDetails} from './services/details';
import {useNavigation,type Screen,type LibraryView} from './useNavigation';
import './mobile.css';

function Retained({active,children}:{active:boolean;children:ReactNode}) {
 const [visited,setVisited]=useState(active);useEffect(()=>{if(active)setVisited(true);},[active]);
 return active||visited?<>{children}</>:null;
}
function MobileApp() {
 const {route,navigate,openPlayer,panel,closePlayer,explore,searchMode}=useNavigation();
 const [albumWorking,setAlbumWorking]=useState(false);const [requestedFilter,setRequestedFilter]=useState<LibraryFilter|null>(null);
 const [playlistWorking,setPlaylistWorking]=useState(false);const [catalogRevision,setCatalogRevision]=useState(0);const [pendingTrack,setPendingTrack]=useState<PendingTrack|null>(null);
 const [libraryWorking,setLibraryWorking]=useState(false);const [backupWorking,setBackupWorking]=useState(false);const [libraryRevision,setLibraryRevision]=useState(0);
 const [state,setState]=useState<AudioState>(emptyAudio);const [details,setDetails]=useState<TrackDetails|null>(null);const [detailsError,setDetailsError]=useState('');const [detailsRevision,setDetailsRevision]=useState(0);
 const [error,setError]=useState('');const [pollError,setPollError]=useState('');const [busy,setBusy]=useState(false);const [seek,setSeek]=useState<number|null>(null);
 const [searchRequest,setSearchRequest]=useState(0);const [favoritesRequest,setFavoritesRequest]=useState(0);const [collectionRequest,setCollectionRequest]=useState(0);
 const [keyboard,setKeyboard]=useState(false);
 const generation=useRef(0),working=useRef(false),alive=useRef(true);const heading=useRef<HTMLHeadingElement>(null);const dock=useRef<HTMLDivElement>(null);
 const native=isAndroidBridgeAvailable();const currentId=state.queue[state.index]?.id;
 const onlineActive=route.screen==='search'&&route.searchMode==='online';
 const tracksActive=(route.screen==='search'&&route.searchMode==='local')||(route.screen==='library'&&route.view==='tracks');
 const albumsActive=route.screen==='library'&&route.view==='albums';const playlistsActive=route.screen==='library'&&route.view==='playlists';const settingsActive=route.screen==='settings';
 const dataWorking=libraryWorking||albumWorking||playlistWorking||backupWorking;
 useEffect(()=>{
  alive.current=true;let timer:ReturnType<typeof setTimeout>;let stopped=false;
  async function poll() {
   if(stopped||!native)return;
   if(!working.current&&document.visibilityState!=='hidden') {
    const revision=generation.current;
    try {const snapshot=await audioCommand('snapshot');if(!stopped&&revision===generation.current&&snapshot){setState(snapshot);setPollError('');}}
    catch(e){if(!stopped&&revision===generation.current)setPollError((e as Error).message);}
   }
   if(!stopped)timer=setTimeout(()=>void poll(),1000);
  }
  void poll();return()=>{stopped=true;alive.current=false;clearTimeout(timer);};
 },[native]);
 useEffect(()=>{
  let stopped=false;setDetails(null);setDetailsError('');setSeek(null);
  if(currentId&&native)void trackDetails(currentId).then(value=>{if(!stopped)setDetails(value);}).catch(e=>{if(!stopped)setDetailsError((e as Error).message);});
  return()=>{stopped=true;};
 },[currentId,native,detailsRevision,catalogRevision,libraryRevision]);
 // A completed old artwork request is never displayed for the new queue entry.
 const currentDetails=details?.id===currentId?details:null;
 useEffect(()=>{
  window.scrollTo(0,0);
  const timer=setTimeout(()=>{const focused=document.activeElement;if(focused===document.body||focused?.closest('.bottom-nav,.library-tabs'))heading.current?.focus();},0);
  return()=>clearTimeout(timer);
 },[route.screen,route.view]);
 useEffect(()=>{
  const viewport=window.visualViewport;let baseline=window.innerHeight;let viewportWidth=window.innerWidth;
  const update=()=>{if(Math.abs(viewportWidth-window.innerWidth)>80){viewportWidth=window.innerWidth;baseline=window.innerHeight;}else baseline=Math.max(baseline,window.innerHeight);const editing=document.activeElement?.matches('input:not([type=range]):not([type=checkbox]):not([type=radio]),textarea,select')??false;setKeyboard(editing&&baseline-(viewport?.height??window.innerHeight)>150);};
  const rotate=()=>{baseline=window.innerHeight;update();};
  viewport?.addEventListener('resize',update);window.addEventListener('resize',update);window.addEventListener('orientationchange',rotate);document.addEventListener('focusin',update);document.addEventListener('focusout',update);
  return()=>{viewport?.removeEventListener('resize',update);window.removeEventListener('resize',update);window.removeEventListener('orientationchange',rotate);document.removeEventListener('focusin',update);document.removeEventListener('focusout',update);};
 },[]);
 useEffect(()=>{
  const node=dock.current;if(!node)return;
  const update=()=>document.documentElement.style.setProperty('--dock-height',`${node.offsetHeight}px`);
  update();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(update);observer?.observe(node);window.addEventListener('resize',update);
  return()=>{observer?.disconnect();window.removeEventListener('resize',update);document.documentElement.style.removeProperty('--dock-height');};
 },[]);
 async function perform(command:AudioCommand,args?:object) {
  if(working.current)throw Error('Aguarde a operação atual do player.');
  working.current=true;generation.current++;setBusy(true);setError('');
  try {const result=await audioCommand(command,args);if(alive.current&&result){setState(result);setSeek(null);}}
  finally {working.current=false;if(alive.current)setBusy(false);}
 }
 async function action(command:AudioCommand,args?:object) {try {await perform(command,args);}catch(e){if(alive.current)setError((e as Error).message);}}
 function expand(panel:'player'|'queue'='player'){if(currentId&&!currentDetails?.artist)setDetailsRevision(v=>v+1);openPlayer(panel);}
 function go(screen:Screen,view:LibraryView=route.view) {if(busy||dataWorking)return;if(screen==='search')setSearchRequest(v=>v+1);navigate(screen,view);}
 const title=route.screen==='home'?'Início':route.screen==='search'?(onlineActive?'Explorar online':'Busca local'):route.screen==='library'?'Biblioteca':'Ajustes';
 return <>
  <main className="mobile-app">
   <header className="app-header"><span className="brand">BZtune<span>.</span></span><span className="build-label">Android · teste</span></header>
   <h1 className="screen-title" ref={heading} tabIndex={-1}>{title}</h1>
   {!native&&<p className="mobile-notice">Esta é a interface Android. Use o APK para reproduzir áudio e acessar arquivos.</p>}
   {(error||pollError)&&!route.player&&<p role="alert" className="mobile-error">{error||pollError}</p>}
   {(busy||dataWorking)&&<p className="operation-notice" role="status">Aguarde a conclusão da operação.</p>}
   {route.screen==='home'&&<section className="home-screen" aria-label="Início">
    <div className="home-feature"><span className="eyebrow">NO SEU APARELHO</span><h2>Sua biblioteca</h2><p>Escolha suas músicas e organize o que quer ouvir.</p><button className="primary" disabled={!native||busy||dataWorking} onClick={()=>void action('choose')}><FolderOpen/>Escolher músicas</button><button disabled={busy||dataWorking} onClick={()=>go('library','tracks')}>Abrir biblioteca</button></div>
    <div className="home-shortcuts"><button disabled={busy||dataWorking} onClick={()=>go('library','tracks')}><LibraryBig/><span>Músicas</span></button><button disabled={busy||dataWorking} onClick={()=>{go('library','tracks');setFavoritesRequest(v=>v+1);}}><Heart/><span>Favoritas</span></button><button disabled={busy||dataWorking} onClick={()=>{go('library','albums');setCollectionRequest(v=>v+1);}}><Disc3/><span>Coleção</span></button><button disabled={busy||dataWorking} onClick={()=>go('library','playlists')}><ListMusic/><span>Playlists</span></button></div>
   </section>}
   {route.screen==='search'&&<><nav className="library-tabs" aria-label="Origem da busca"><button disabled={busy||dataWorking} aria-current={!onlineActive?'page':undefined} onClick={()=>{searchMode('local');setSearchRequest(v=>v+1);}}>No aparelho</button><button disabled={busy||dataWorking} aria-current={onlineActive?'page':undefined} onClick={()=>searchMode('online')}>Online</button></nav>{!onlineActive&&<p className="screen-hint">Busque título, artista ou álbum nos arquivos importados.</p>}</>}
   {route.screen==='library'&&<nav className="library-tabs" aria-label="Categorias da biblioteca">{([['tracks','Músicas'],['albums','Álbuns'],['playlists','Playlists']] as const).map(([view,label])=><button key={view} disabled={busy||dataWorking} aria-current={route.view===view?'page':undefined} onClick={()=>go('library',view)}>{label}</button>)}</nav>}
   <div className="screen-content">
    <Retained active={onlineActive}><OnlineExplore active={onlineActive} route={route.catalog} onNavigate={explore}/></Retained>
    <Retained active={tracksActive}><fieldset hidden={!tracksActive} aria-label="Biblioteca local" disabled={busy||backupWorking||playlistWorking||albumWorking} className="mobile-section-fieldset"><Library active={tracksActive} searchRequest={searchRequest} favoritesRequest={favoritesRequest} requestedFilter={requestedFilter} onPlaylist={(id,title)=>{setPendingTrack({id,title});navigate('library','playlists');}} onCatalogChange={()=>setCatalogRevision(v=>v+1)} key={libraryRevision} onWorking={setLibraryWorking} playerBusy={busy} onPlay={(id,append)=>perform(append?'library_enqueue':'library_play',{id})}/></fieldset></Retained>
    <Retained active={albumsActive}><Albums active={albumsActive} collectionRequest={collectionRequest} key={libraryRevision} disabled={busy||backupWorking||libraryWorking||playlistWorking} catalogRevision={catalogRevision} onWorking={setAlbumWorking} onView={filter=>{setRequestedFilter(filter);navigate('library','tracks');}}/></Retained>
    <Retained active={playlistsActive}><Playlists active={playlistsActive} key={libraryRevision} disabled={busy||backupWorking||libraryWorking||albumWorking} catalogRevision={catalogRevision} pending={pendingTrack} onClearPending={()=>setPendingTrack(null)} onWorking={setPlaylistWorking} onPlay={(id,revision,append)=>perform(append?'playlist_enqueue':'playlist_play',{id,revision})}/></Retained>
    <Retained active={settingsActive}><Backup active={settingsActive} disabled={busy||libraryWorking||playlistWorking||albumWorking} onWorking={setBackupWorking} onRestore={async token=>{try {await perform('restore_backup',{token});}finally{setRequestedFilter(null);setPendingTrack(null);setLibraryRevision(v=>v+1);}}}/></Retained>
    {settingsActive&&<section className="app-information" aria-labelledby="about-title"><h2 id="about-title">Sobre esta versão</h2><p>Reprodução de arquivos locais, biblioteca, favoritas, álbuns, coleção, playlists e consultas online ao catálogo MusicBrainz. Os arquivos originais continuam no destino escolhido.</p><p>Android 7 ou posterior, com Android System WebView compatível. Use os controles de volume do aparelho.</p></section>}
   </div>
  </main>
  <div ref={dock} className="mobile-dock" hidden={keyboard}>
   <section className="mini-player" aria-label="Reprodução atual"><button className="mini-track" aria-label="Abrir player expandido" onClick={()=>expand()}><Artwork small src={currentDetails?.cover??null}/><span><strong>{state.title}</strong><span>{state.hasTrack?(currentDetails?.artist||'Áudio local'):'Escolha uma música'}</span></span></button><button className="icon-button mini-play" disabled={!state.hasTrack||busy} aria-label={state.playing?'Pausar':'Tocar'} onClick={()=>void action(state.playing?'pause':'play')}>{state.playing?<Pause fill="currentColor"/>:<Play fill="currentColor"/>}</button><button className="icon-button" aria-label={`Abrir fila · ${state.queue.length}`} onClick={()=>expand('queue')}><ListMusic/></button></section>
   <nav className="bottom-nav" aria-label="Navegação principal">{([{screen:'home',label:'Início',Icon:Home},{screen:'search',label:'Busca',Icon:Search},{screen:'library',label:'Biblioteca',Icon:LibraryBig},{screen:'settings',label:'Ajustes',Icon:Settings}] as const).map(({screen,label,Icon})=><button key={screen} disabled={busy||dataWorking} aria-current={route.screen===screen?'page':undefined} onClick={()=>go(screen)}><Icon/><span>{label}</span></button>)}</nav>
  </div>
  <ExpandedPlayer open={route.player} panel={route.panel} state={state} details={currentDetails} detailsError={detailsError} onRetryDetails={()=>setDetailsRevision(v=>v+1)} busy={busy} native={native} error={error||pollError} seek={seek} setSeek={setSeek} onClose={closePlayer} onPanel={panel} action={action}/>
 </>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><MobileApp/></React.StrictMode>);
