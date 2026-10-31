import Albums,{type LibraryFilter} from "./Albums";
import Playlists,{type PendingTrack} from "./Playlists";
import Backup from "./Backup";
import Library from "./Library";
import React, { useEffect, useRef, useState } from 'react';
import {createRoot} from 'react-dom/client';
import {audioCommand,emptyAudio,isAndroidBridgeAvailable,type AudioState,type AudioCommand} from './services/audio';
import './mobile.css';

function time(ms:number) {const seconds=Math.floor(ms/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
function MobileApp() {
  const [albumWorking,setAlbumWorking]=useState(false);const [requestedFilter,setRequestedFilter]=useState<LibraryFilter|null>(null);
  const [playlistWorking,setPlaylistWorking]=useState(false);const [catalogRevision,setCatalogRevision]=useState(0);const [pendingTrack,setPendingTrack]=useState<PendingTrack|null>(null);
  const [libraryWorking,setLibraryWorking]=useState(false);const [backupWorking,setBackupWorking]=useState(false);const [libraryRevision,setLibraryRevision]=useState(0);
  const [state,setState]=useState<AudioState>(emptyAudio);
  const [error,setError]=useState('');const [pollError,setPollError]=useState('');const [busy,setBusy]=useState(false);const [seek,setSeek]=useState<number|null>(null);
  const generation=useRef(0);const working=useRef(false);const alive=useRef(true);
  const native=isAndroidBridgeAvailable();
  useEffect(()=>{
    alive.current=true;let timer:ReturnType<typeof setTimeout>;let stopped=false;
    async function poll() {
      if(stopped || !native)return;
      if(!working.current && document.visibilityState!=='hidden') {
        const revision=generation.current;
        try {const snapshot=await audioCommand('snapshot');if(!stopped && revision===generation.current && snapshot){setState(snapshot);setPollError('');}}
        catch(e){if(!stopped && revision===generation.current)setPollError((e as Error).message);}
      }
      if(!stopped)timer=setTimeout(()=>void poll(),1000);
    }
    void poll();return()=>{stopped=true;alive.current=false;clearTimeout(timer);};
  },[native]);
  async function perform(command:AudioCommand,args?:object) {
    if(working.current)throw Error("Aguarde a operação atual do player.");
    working.current=true;generation.current++;setBusy(true);setError('');
    try {const result=await audioCommand(command,args);if(alive.current && result){setState(result);setSeek(null);}}
    finally {working.current=false;if(alive.current)setBusy(false);}
  }
  async function action(command:AudioCommand,args?:object) {
    try {await perform(command,args);}catch(e){if(alive.current)setError((e as Error).message);}
  }
  return <main className="mobile-app">
    <header><span className="brand">BZtune<span>.</span></span><span className="build-label">Android · teste inicial</span></header>
    <section aria-labelledby="player-title" className="mobile-player">
      <div className="album-placeholder" aria-hidden="true">♫</div>
      <p className="eyebrow">ÁUDIO LOCAL</p><h1 id="player-title">{state.title}</h1>
      <p className="player-status" role="status">{state.failed?'Não foi possível reproduzir este arquivo.':state.loading?'Preparando áudio…':state.playing?'Reproduzindo':state.hasTrack?'Pausado':'Selecione um áudio do seu aparelho para começar.'}</p>
      {!native&&<p className="mobile-notice">Esta página é a interface Android. Para testar reprodução e controles do sistema, use o APK.</p>}
      {(error||pollError)&&<p role="alert" className="mobile-error">{error||pollError}</p>}
      <button className="choose" disabled={!native||busy} onClick={()=>void action('choose')}>{busy?'Aguarde…':'Escolher músicas'}</button>
      <div className="playback-buttons" role="group" aria-label="Controles de reprodução">
        <button disabled={!state.hasTrack||busy} onClick={()=>void action('seek',{position:Math.max(0,state.position-10000)})} aria-label="Voltar 10 segundos">−10s</button>
        <button className="primary" disabled={!state.hasTrack||busy} onClick={()=>void action(state.playing?'pause':'play')}>{state.playing?'Pausar':'Tocar'}</button>
        <button disabled={!state.hasTrack||busy} onClick={()=>void action('seek',{position:Math.min(state.duration,state.position+10000)})} aria-label="Avançar 10 segundos">+10s</button>
      </div>
      <div className="queue-controls" role="group" aria-label="Controles da fila">
        <button disabled={!state.canPrevious||busy} onClick={()=>void action('previous')}>Anterior</button>
        <button disabled={!state.canNext||busy} onClick={()=>void action('next')}>Próxima</button>
        <button disabled={!state.hasTrack||busy} aria-pressed={state.shuffle} onClick={()=>void action('shuffle')}>Shuffle</button>
        <button disabled={!state.hasTrack||busy} onClick={()=>void action('repeat')} aria-label={`Repetição: ${['desligada','uma música','toda a fila'][state.repeat]}`}>Repetir: {['não','uma','todas'][state.repeat]}</button>
      </div>
      <form onSubmit={e=>{e.preventDefault();void action('seek',{position:seek??state.position});}}>
        <label htmlFor="audio-position">Posição da música</label>
        <input id="audio-position" type="range" min="0" max={Math.max(1,state.duration)} step="1000" value={Math.min(seek??state.position,Math.max(1,state.duration))} disabled={!state.duration||busy} onChange={e=>setSeek(Number(e.target.value))}/>
        <div className="position-row"><span>{time(seek??state.position)} / {time(state.duration)}</span><button disabled={seek===null||busy}>Ir para posição</button></div>
      </form>
    </section>
    <fieldset aria-label="Biblioteca local" disabled={busy||backupWorking||playlistWorking||albumWorking} className="mobile-section-fieldset"><Library requestedFilter={requestedFilter} onPlaylist={(id,title)=>setPendingTrack({id,title})} onCatalogChange={()=>setCatalogRevision(v=>v+1)} key={libraryRevision} onWorking={setLibraryWorking} playerBusy={busy} onPlay={async(id,append)=>{await perform(append?"library_enqueue":"library_play",{id});}}/></fieldset>
    <Albums key={libraryRevision} disabled={busy||backupWorking||libraryWorking||playlistWorking} catalogRevision={catalogRevision} onWorking={setAlbumWorking} onView={setRequestedFilter}/>
    <Playlists key={libraryRevision} disabled={busy||backupWorking||libraryWorking||albumWorking} catalogRevision={catalogRevision} pending={pendingTrack} onClearPending={()=>setPendingTrack(null)} onWorking={setPlaylistWorking} onPlay={(id,revision,append)=>perform(append?"playlist_enqueue":"playlist_play",{id,revision})}/>
    <Backup disabled={busy||libraryWorking||playlistWorking||albumWorking} onWorking={setBackupWorking} onRestore={async(token)=>{try {await perform("restore_backup",{token});} finally {setRequestedFilter(null);setPendingTrack(null);setLibraryRevision(v=>v+1);}}}/>
    <section aria-labelledby="queue-title" className="mobile-queue"><h2 id="queue-title">Fila · {state.queue.length}</h2>
      <button disabled={!native||busy} onClick={()=>void action('choose',{append:true})}>Adicionar músicas à fila</button>
      {state.queue.length===0?<p>A fila está vazia.</p>:<ol>{state.queue.map((track,index)=><li key={track.id} aria-current={index===state.index?'true':undefined}>
        <button className="queue-title" disabled={busy} onClick={()=>void action('jump',{index,id:track.id})} aria-label={`Selecionar ${track.title}`}>{index===state.index?'● ':''}{track.title}</button>
        <div className="queue-row-actions">
          <button disabled={busy||index===0} onClick={()=>void action('reorder',{index,id:track.id,to:index-1})} aria-label={`Subir ${track.title}`}>↑</button>
          <button disabled={busy||index===state.queue.length-1} onClick={()=>void action('reorder',{index,id:track.id,to:index+1})} aria-label={`Descer ${track.title}`}>↓</button>
          <button disabled={busy} onClick={()=>void action('remove',{index,id:track.id})} aria-label={`Remover ${track.title} da fila`}>Remover</button>
        </div>
      </li>)}</ol>}
      <p>Até 200 músicas nesta versão de teste. Remover da fila não apaga os arquivos.</p>
    </section>
    <aside><h2>Primeira etapa Android</h2><p>Reprodução e fila local nativas. Biblioteca e fila locais. Busca online, downloads e letras serão migrados nas próximas etapas.</p><p>O áudio é controlado pelo serviço Android, inclusive quando esta tela estiver em segundo plano.</p></aside>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><MobileApp/></React.StrictMode>);
