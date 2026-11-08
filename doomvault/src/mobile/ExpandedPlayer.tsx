import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {ChevronDown,FolderOpen,SkipBack,SkipForward,Shuffle,Repeat,Repeat1,Play,Pause,ListMusic,Plus,Disc3,Heart,MoreHorizontal,ArrowUp,ArrowDown,Trash2} from 'lucide-react';
import LyricsPanel from './LyricsPanel';
import SleepTimerPanel from './SleepTimerPanel';
import Artwork from './Artwork';
import ActionSheet from './ActionSheet';
import {useArtworkColor} from './useArtworkColor';
import type {AudioCommand,AudioState} from './services/audio';
import type {TrackDetails} from './services/details';
export function time(ms:number) {const seconds=Math.floor(ms/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
type Props={open:boolean;panel:'player'|'queue';state:AudioState;details:TrackDetails|null;detailsError:string;onRetryDetails:()=>void;busy:boolean;native:boolean;error:string;seek:number|null;setSeek:(value:number|null)=>void;onClose:()=>void;onPanel:(panel:'player'|'queue')=>void;action:(command:AudioCommand,args?:object)=>Promise<void>;favoriteBusy:boolean;favoriteFeedback:{message:string;failed:boolean}|null;onFavorite:()=>void};
export default function ExpandedPlayer({open,panel,state,details,detailsError,onRetryDetails,busy,native,error,seek,setSeek,onClose,onPanel,action,favoriteBusy,favoriteFeedback,onFavorite}:Props) {
 const dialog=useRef<HTMLDialogElement>(null),close=useRef<HTMLButtonElement>(null),content=useRef<HTMLDivElement>(null),footer=useRef<HTMLElement>(null),queueClose=useRef<HTMLButtonElement>(null),queueButton=useRef<HTMLButtonElement>(null),queueScroll=useRef<HTMLDivElement>(null);
 const [lyricsOpen,setLyricsOpen]=useState(false);
 const [timerOpen,setTimerOpen]=useState(false);
 const previousPanel=useRef(panel);const [queueMenu,setQueueMenu]=useState<string|null>(null);
 const color=useArtworkColor(details?.cover??null,open),currentId=state.queue[state.index]?.id;
 useEffect(()=>{
  const node=dialog.current;if(!node)return;
  if(!open){if(node.open)node.close();return;}
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';node.showModal();close.current?.focus();
  return()=>{if(node.open)node.close();document.body.style.overflow=previous;};
 },[open]);
 useEffect(()=>{
  if(!open){previousPanel.current=panel;return;}
  if(panel==='queue')queueClose.current?.focus();else if(previousPanel.current==='queue')queueButton.current?.focus();
  previousPanel.current=panel;
 },[panel,open]);
 useEffect(()=>{if(open&&panel==='queue')queueScroll.current?.querySelector<HTMLElement>('li[aria-current="true"]')?.scrollIntoView({block:'nearest'});},[open,panel,currentId]);
 useEffect(()=>{
  const node=footer.current,root=dialog.current;if(!open||!node||!root)return;
  const update=()=>root.style.setProperty('--player-footer-height',`${node.offsetHeight}px`);update();
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(update);observer?.observe(node);window.addEventListener('resize',update);
  return()=>{observer?.disconnect();window.removeEventListener('resize',update);root.style.removeProperty('--player-footer-height');};
 },[open]);
 function containTab(event:React.KeyboardEvent<HTMLDialogElement>) {
  if((event.target as HTMLElement).closest('.action-sheet')||event.key!=='Tab')return;
  const node=dialog.current;if(!node)return;
  const focusable=Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href],[tabindex]:not([tabindex="-1"])')).filter(el=>!el.closest('.action-sheet')&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden');
  const first=focusable[0],last=focusable[focusable.length-1];
  if(!first){event.preventDefault();node.focus();return;}
  if((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)){event.preventDefault();(event.shiftKey?last:first).focus();}
 }
 const titles=new Map<string,number>();state.queue.forEach(t=>titles.set(t.title,(titles.get(t.title)??0)+1));
 const artist=details?.artist||'Áudio local',menuIndex=state.queue.findIndex(t=>t.id===queueMenu),menuTrack=state.queue[menuIndex];
 const canFavorite=native&&!!details?.libraryId&&details.favorite!==null&&state.hasTrack;
 return <dialog ref={dialog} className={`player-dialog${panel==='queue'?' player-with-queue':''}`} style={{'--player-art-color':color} as CSSProperties} aria-labelledby="expanded-title" onKeyDown={containTab} onCancel={e=>{if(e.target!==e.currentTarget)return;e.preventDefault();if(panel==='queue')onPanel('player');else onClose();}}>
 {open&&<>
  <div className="player-dialog-header"><button ref={close} className="icon-button" onClick={onClose} aria-label="Minimizar player"><ChevronDown/></button><span id="expanded-title">{panel==='queue'?'Fila de reprodução':'Agora tocando'}</span><details className="player-menu"><summary aria-label="Mais opções do player">•••</summary><button disabled={!native||busy} onClick={()=>void action('choose')}>Escolher músicas</button><button disabled={!native||!state.hasTrack||busy} onClick={()=>setTimerOpen(true)}>Temporizador</button><button disabled={!native||!state.hasTrack||busy} onClick={()=>setLyricsOpen(true)}>Letras</button></details></div>
  <div className="player-dialog-content" ref={content} aria-hidden={panel==='queue'?true:undefined}>
   <fieldset className="player-content-fieldset" disabled={panel==='queue'}>
   {error&&<p role="alert" className="mobile-error">{error}</p>}
   <section className="mobile-player" aria-labelledby="player-title">
    <Artwork src={details?.cover??null}/>
    <div className="player-track-heading"><div className="player-title-line"><h2 id="player-title">{state.title}</h2><button className="icon-button player-favorite" disabled={!canFavorite||busy||favoriteBusy} aria-label={details?.favorite?'Remover música atual das favoritas':'Favoritar música atual'} aria-pressed={canFavorite?details!.favorite!:undefined} aria-busy={favoriteBusy} aria-describedby={!canFavorite&&details?'player-favorite-help':undefined} onClick={onFavorite}><Heart fill={canFavorite&&details?.favorite?'currentColor':'none'}/></button></div><p className="track-artist">{artist}</p>{details?.album&&<p className="track-album">{details.album}</p>}</div>
    {details&&!canFavorite&&state.hasTrack&&<p className="favorite-help" id="player-favorite-help">Importe esta música na Biblioteca para favoritar.</p>}
    {favoriteFeedback&&<p className={favoriteFeedback.failed?'mobile-error favorite-message':'favorite-message'} role={favoriteFeedback.failed?'alert':'status'}>{favoriteFeedback.message}</p>}
    <p className="player-status" role="status">{state.failed?'Não foi possível reproduzir este arquivo.':state.loading?'Preparando áudio…':state.playing?'Reproduzindo':state.hasTrack?'Pausado':'Escolha músicas ou reproduza pela biblioteca.'}</p>
    {detailsError&&<div className="details-notice"><p>{detailsError}</p><button disabled={busy} onClick={onRetryDetails}>Recarregar detalhes</button></div>}
    <form onSubmit={e=>{e.preventDefault();void action('seek',{position:seek??state.position});}}>
     <label htmlFor="audio-position" className="sr-only">Posição da música</label><input id="audio-position" className="player-seek" style={{'--seek-percent':`${Math.min(100,Math.max(0,(seek??state.position)/Math.max(1,state.duration)*100))}%`} as CSSProperties} type="range" min="0" max={Math.max(1,state.duration)} step="1000" value={Math.min(seek??state.position,Math.max(1,state.duration))} disabled={!state.hasTrack||!state.duration||busy} onChange={e=>setSeek(Number(e.target.value))} onPointerUp={e=>{if(!busy)void action('seek',{position:Number(e.currentTarget.value)});}}/>
     <div className="position-row"><span>{time(seek??state.position)} / {time(state.duration)}</span>{seek!==null&&<button disabled={busy}>Ir para posição</button>}</div>
    </form>
    <div className="seek-shortcuts"><button disabled={!state.hasTrack||busy} onClick={()=>void action('seek',{position:Math.max(0,state.position-10000)})} aria-label="Voltar 10 segundos">−10s</button><button disabled={!state.hasTrack||busy} onClick={()=>void action('seek',{position:Math.min(state.duration,state.position+10000)})} aria-label="Avançar 10 segundos">+10s</button></div>
    {!state.hasTrack&&<button className="choose" disabled={!native||busy} onClick={()=>void action('choose')}><FolderOpen/>Escolher músicas</button>}
   </section>
   </fieldset>
  </div>
  {panel==='queue'&&<>
   <div className="queue-panel-scrim" aria-hidden="true" onClick={()=>onPanel('player')}/>
   <section aria-labelledby="queue-title" className="mobile-queue queue-panel">
    <div className="sheet-handle" aria-hidden="true"/><header className="queue-panel-header"><h2 id="queue-title">Fila · {state.queue.length}</h2><button ref={queueClose} className="icon-button" aria-label="Fechar fila" onClick={()=>onPanel('player')}><ChevronDown/></button></header>
    <div className="queue-panel-scroll" ref={queueScroll}>
     {error&&<p role="alert" className="mobile-error">{error}</p>}
     {state.hasTrack&&<div className="queue-current"><Artwork small src={details?.cover??null}/><div><h3>{state.title}</h3><p>{artist}</p></div></div>}
     {state.queue.length===0?<p>A fila está vazia.</p>:<ol>{state.queue.map((track,index)=><li key={track.id} aria-current={index===state.index?'true':undefined}>
      <button className="queue-title" disabled={busy} onClick={()=>void action('jump',{index,id:track.id})} aria-label={`Selecionar ${track.title}${(titles.get(track.title)??0)>1?`, posição ${index+1}`:''}`}><span aria-hidden="true">{index===state.index?'●':index+1}</span><strong>{track.title}</strong></button>
      <button className="icon-button" aria-label={`Opções de ${track.title} na fila, posição ${index+1}`} disabled={busy} onClick={()=>setQueueMenu(track.id)}><MoreHorizontal/></button>
     </li>)}</ol>}
     <p className="queue-help">Até 200 músicas. Remover da fila não apaga os arquivos.</p>
    </div>
   </section>
   {queueMenu&&<ActionSheet title={menuTrack?.title??'Faixa removida da fila'} onClose={()=>setQueueMenu(null)}>{dismiss=>menuTrack?<><p className="sheet-subtitle">Posição {menuIndex+1} de {state.queue.length}</p><div className="sheet-actions"><button disabled={busy||menuIndex===0} aria-label={`Subir ${menuTrack.title}`} onClick={()=>dismiss(()=>void action('reorder',{index:menuIndex,id:menuTrack.id,to:menuIndex-1}))}><ArrowUp/>Mover para cima</button><button disabled={busy||menuIndex===state.queue.length-1} aria-label={`Descer ${menuTrack.title}`} onClick={()=>dismiss(()=>void action('reorder',{index:menuIndex,id:menuTrack.id,to:menuIndex+1}))}><ArrowDown/>Mover para baixo</button><button className="destructive" disabled={busy} aria-label={`Remover ${menuTrack.title} da fila`} onClick={()=>dismiss(()=>void action('remove',{index:menuIndex,id:menuTrack.id}))}><Trash2/>Remover da fila</button></div></>:<p>Esta entrada não está mais na fila.</p>}</ActionSheet>}
  </>}
  {lyricsOpen&&<LyricsPanel state={state} action={action} onClose={()=>setLyricsOpen(false)}/>}
  {timerOpen&&<SleepTimerPanel onClose={()=>setTimerOpen(false)}/>}
  <footer className="player-dialog-footer" ref={footer}>
   <div className="transport" role="group" aria-label="Controles de reprodução"><button className="icon-button" disabled={!state.hasTrack||busy} aria-pressed={state.shuffle} aria-label="Shuffle" onClick={()=>void action('shuffle')}><Shuffle/></button><button className="icon-button" disabled={!state.canPrevious||busy} aria-label="Anterior" onClick={()=>void action('previous')}><SkipBack/></button><button className="player-primary icon-button" disabled={!state.hasTrack||busy} onClick={()=>void action(state.playing?'pause':'play')} aria-label={state.playing?'Pausar':'Tocar'}>{state.playing?<Pause fill="currentColor"/>:<Play fill="currentColor"/>}</button><button className="icon-button" disabled={!state.canNext||busy} aria-label="Próxima" onClick={()=>void action('next')}><SkipForward/></button><button className="icon-button" disabled={!state.hasTrack||busy} aria-pressed={state.repeat!==0} aria-label={`Repetição: ${['desligada','uma música','toda a fila'][state.repeat]}`} onClick={()=>void action('repeat')}>{state.repeat===1?<Repeat1/>:<Repeat/>}</button></div>
   <div className="player-functions" role="group" aria-label="Telas do player"><button aria-pressed={panel==='player'} onClick={()=>onPanel('player')}><Disc3/>Player</button><button ref={queueButton} aria-pressed={panel==='queue'} onClick={()=>onPanel('queue')}><ListMusic/>Fila · {state.queue.length}</button><button disabled={!native||busy} aria-label="Adicionar músicas à fila" onClick={()=>void action('choose',{append:true})}><Plus/>Adicionar à fila</button></div>
  </footer>
 </>}
 </dialog>;
}
