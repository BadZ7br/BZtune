import React, { useEffect, useRef, useState } from 'react';
import {createRoot} from 'react-dom/client';
import {audioCommand,emptyAudio,isAndroidBridgeAvailable,type AudioState} from './services/audio';
import './mobile.css';

function time(ms:number) {const seconds=Math.floor(ms/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
function MobileApp() {
  const [state,setState]=useState<AudioState>(emptyAudio);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [seek,setSeek]=useState<number|null>(null);
  const generation=useRef(0);const working=useRef(false);const alive=useRef(true);
  const native=isAndroidBridgeAvailable();
  useEffect(()=>{
    alive.current=true;let timer:ReturnType<typeof setTimeout>;let stopped=false;
    async function poll() {
      if(stopped || !native)return;
      if(!working.current && document.visibilityState!=='hidden') {
        const revision=generation.current;
        try {const snapshot=await audioCommand('snapshot');if(!stopped && revision===generation.current && snapshot){setState(snapshot);setError('');}}
        catch(e){if(!stopped && revision===generation.current)setError((e as Error).message);}
      }
      if(!stopped)timer=setTimeout(()=>void poll(),1000);
    }
    void poll();return()=>{stopped=true;alive.current=false;clearTimeout(timer);};
  },[native]);
  async function action(command:'choose'|'play'|'pause'|'seek'|'stop',args?:object) {
    if(working.current)return;
    working.current=true;generation.current++;setBusy(true);setError('');
    try {const result=await audioCommand(command,args);if(alive.current && result){setState(result);setSeek(null);}}
    catch(e){if(alive.current)setError((e as Error).message);}
    finally {working.current=false;if(alive.current)setBusy(false);}
  }
  return <main className="mobile-app">
    <header><span className="brand">BZtune<span>.</span></span><span className="build-label">Android · teste inicial</span></header>
    <section aria-labelledby="player-title" className="mobile-player">
      <div className="album-placeholder" aria-hidden="true">♫</div>
      <p className="eyebrow">ÁUDIO LOCAL</p><h1 id="player-title">{state.title}</h1>
      <p className="player-status" role="status">{state.failed?'Não foi possível reproduzir este arquivo.':state.loading?'Preparando áudio…':state.playing?'Reproduzindo':state.hasTrack?'Pausado':'Selecione um áudio do seu aparelho para começar.'}</p>
      {!native&&<p className="mobile-notice">Esta página é a interface Android. Para testar reprodução e controles do sistema, use o APK.</p>}
      {error&&<p role="alert" className="mobile-error">{error}</p>}
      <button className="choose" disabled={!native||busy} onClick={()=>void action('choose')}>{busy?'Aguarde…':'Escolher música'}</button>
      <div className="playback-buttons" role="group" aria-label="Controles de reprodução">
        <button disabled={!state.hasTrack||busy} onClick={()=>void action('seek',{position:Math.max(0,state.position-10000)})} aria-label="Voltar 10 segundos">−10s</button>
        <button className="primary" disabled={!state.hasTrack||busy} onClick={()=>void action(state.playing?'pause':'play')}>{state.playing?'Pausar':'Tocar'}</button>
        <button disabled={!state.hasTrack||busy} onClick={()=>void action('seek',{position:Math.min(state.duration,state.position+10000)})} aria-label="Avançar 10 segundos">+10s</button>
      </div>
      <form onSubmit={e=>{e.preventDefault();void action('seek',{position:seek??state.position});}}>
        <label htmlFor="audio-position">Posição da música</label>
        <input id="audio-position" type="range" min="0" max={Math.max(1,state.duration)} step="1000" value={Math.min(seek??state.position,Math.max(1,state.duration))} disabled={!state.duration||busy} onChange={e=>setSeek(Number(e.target.value))}/>
        <div className="position-row"><span>{time(seek??state.position)} / {time(state.duration)}</span><button disabled={seek===null||busy}>Ir para posição</button></div>
      </form>
    </section>
    <aside><h2>Primeira etapa Android</h2><p>Reprodução nativa de um arquivo local. Fila completa, busca online, downloads e letras serão migrados nas próximas etapas.</p><p>O áudio é controlado pelo serviço Android, inclusive quando esta tela estiver em segundo plano.</p></aside>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><MobileApp/></React.StrictMode>);
