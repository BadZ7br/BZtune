import {useEffect,useRef} from 'react';
import {ChevronDown,FolderOpen,SkipBack,SkipForward,Shuffle,Repeat,Repeat1,Play,Pause,ListMusic,Plus,Disc3} from 'lucide-react';
import Artwork from './Artwork';
import type {AudioCommand,AudioState} from './services/audio';
import type {TrackDetails} from './services/details';
export function time(ms:number) {const seconds=Math.floor(ms/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
type Props={open:boolean;panel:'player'|'queue';state:AudioState;details:TrackDetails|null;detailsError:string;onRetryDetails:()=>void;busy:boolean;native:boolean;error:string;seek:number|null;setSeek:(value:number|null)=>void;onClose:()=>void;onPanel:(panel:'player'|'queue')=>void;action:(command:AudioCommand,args?:object)=>Promise<void>};
export default function ExpandedPlayer({open,panel,state,details,detailsError,onRetryDetails,busy,native,error,seek,setSeek,onClose,onPanel,action}:Props) {
 const dialog=useRef<HTMLDialogElement>(null);const close=useRef<HTMLButtonElement>(null);const content=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const node=dialog.current;if(!node)return;
  if(!open){if(node.open)node.close();return;}
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';node.showModal();close.current?.focus();
  return()=>{if(node.open)node.close();document.body.style.overflow=previous;};
 },[open]);
 useEffect(()=>{if(open){content.current?.scrollTo(0,0);if(document.activeElement===document.body)close.current?.focus();}},[panel,open,state.queue.length]);
 function containTab(event:React.KeyboardEvent<HTMLDialogElement>) {
  if(event.key!=='Tab')return;
  const node=dialog.current;if(!node)return;
  const focusable=Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href],[tabindex]:not([tabindex="-1"])')).filter(el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden');
  const first=focusable[0],last=focusable[focusable.length-1];
  if(!first){event.preventDefault();node.focus();return;}
  if((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)){event.preventDefault();(event.shiftKey?last:first).focus();}
 }

 const artist=details?.artist||'Áudio local';
 return <dialog ref={dialog} className="player-dialog" aria-labelledby="expanded-title" onKeyDown={containTab} onCancel={e=>{e.preventDefault();onClose();}}>
 {open&&<>
  <div className="player-dialog-header"><button ref={close} className="icon-button" onClick={onClose} aria-label="Minimizar player"><ChevronDown/></button><span id="expanded-title">{panel==='queue'?'Fila de reprodução':'Agora tocando'}</span><details className="player-menu"><summary aria-label="Mais opções do player">•••</summary><button disabled={!native||busy} onClick={()=>void action('choose')}>Escolher músicas</button></details></div>
  <div className="player-dialog-content" ref={content}>
   {error&&<p role="alert" className="mobile-error">{error}</p>}
   {panel==='player'?<section className="mobile-player" aria-labelledby="player-title">
    <Artwork src={details?.cover??null}/>
    <div className="player-track-heading"><p className="eyebrow">ÁUDIO LOCAL</p><h2 id="player-title">{state.title}</h2><p className="track-artist">{artist}</p>{details?.album&&<p className="track-album">{details.album}</p>}</div>
    <p className="player-status" role="status">{state.failed?'Não foi possível reproduzir este arquivo.':state.loading?'Preparando áudio…':state.playing?'Reproduzindo':state.hasTrack?'Pausado':'Escolha músicas ou reproduza pela biblioteca.'}</p>
    {detailsError&&<div className="details-notice"><p>{detailsError}</p><button disabled={busy} onClick={onRetryDetails}>Recarregar detalhes</button></div>}
    <form onSubmit={e=>{e.preventDefault();void action('seek',{position:seek??state.position});}}>
     <label htmlFor="audio-position" className="sr-only">Posição da música</label><input id="audio-position" type="range" min="0" max={Math.max(1,state.duration)} step="1000" value={Math.min(seek??state.position,Math.max(1,state.duration))} disabled={!state.duration||busy} onChange={e=>setSeek(Number(e.target.value))} onPointerUp={e=>{if(!busy)void action('seek',{position:Number(e.currentTarget.value)});}}/>
     <div className="position-row"><span>{time(seek??state.position)} / {time(state.duration)}</span>{seek!==null&&<button disabled={busy}>Ir para posição</button>}</div>
    </form>
    <div className="seek-shortcuts"><button disabled={!state.hasTrack||busy} onClick={()=>void action('seek',{position:Math.max(0,state.position-10000)})} aria-label="Voltar 10 segundos">−10s</button><button disabled={!state.hasTrack||busy} onClick={()=>void action('seek',{position:Math.min(state.duration,state.position+10000)})} aria-label="Avançar 10 segundos">+10s</button></div>
    {!state.hasTrack&&<button className="choose" disabled={!native||busy} onClick={()=>void action('choose')}><FolderOpen/>Escolher músicas</button>}
   </section>:<section aria-labelledby="queue-title" className="mobile-queue">
    <h2 id="queue-title">Fila · {state.queue.length}</h2>
    {state.hasTrack&&<div className="queue-current"><Artwork small src={details?.cover??null}/><div><h3>{state.title}</h3><p>{artist}</p></div></div>}
    {state.queue.length===0?<p>A fila está vazia.</p>:<ol>{state.queue.map((track,index)=><li key={track.id} aria-current={index===state.index?'true':undefined}>
     <button className="queue-title" disabled={busy} onClick={()=>void action('jump',{index,id:track.id})} aria-label={`Selecionar ${track.title}`}><span aria-hidden="true">{index===state.index?'●':index+1}</span>{track.title}</button>
     <div className="queue-row-actions"><button disabled={busy||index===0} onClick={()=>void action('reorder',{index,id:track.id,to:index-1})} aria-label={`Subir ${track.title}`}>Subir</button><button disabled={busy||index===state.queue.length-1} onClick={()=>void action('reorder',{index,id:track.id,to:index+1})} aria-label={`Descer ${track.title}`}>Descer</button><button disabled={busy} onClick={()=>void action('remove',{index,id:track.id})} aria-label={`Remover ${track.title} da fila`}>Remover</button></div>
    </li>)}</ol>}
    <p>Até 200 músicas. Remover da fila não apaga os arquivos.</p>
   </section>}
  </div>
  <footer className="player-dialog-footer">
   <div className="transport" role="group" aria-label="Controles de reprodução"><button className="icon-button" disabled={!state.hasTrack||busy} aria-pressed={state.shuffle} aria-label="Shuffle" onClick={()=>void action('shuffle')}><Shuffle/></button><button className="icon-button" disabled={!state.canPrevious||busy} aria-label="Anterior" onClick={()=>void action('previous')}><SkipBack/></button><button className="player-primary icon-button" disabled={!state.hasTrack||busy} onClick={()=>void action(state.playing?'pause':'play')} aria-label={state.playing?'Pausar':'Tocar'}>{state.playing?<Pause fill="currentColor"/>:<Play fill="currentColor"/>}</button><button className="icon-button" disabled={!state.canNext||busy} aria-label="Próxima" onClick={()=>void action('next')}><SkipForward/></button><button className="icon-button" disabled={!state.hasTrack||busy} aria-pressed={state.repeat!==0} aria-label={`Repetição: ${['desligada','uma música','toda a fila'][state.repeat]}`} onClick={()=>void action('repeat')}>{state.repeat===1?<Repeat1/>:<Repeat/>}</button></div>
   <div className="player-functions" role="group" aria-label="Telas do player"><button aria-pressed={panel==='player'} onClick={()=>onPanel('player')}><Disc3/>Player</button><button aria-pressed={panel==='queue'} onClick={()=>onPanel('queue')}><ListMusic/>Fila · {state.queue.length}</button><button disabled={!native||busy} aria-label="Adicionar músicas à fila" onClick={()=>void action('choose',{append:true})}><Plus/>Adicionar à fila</button></div>
  </footer>
 </>}
 </dialog>;
}
