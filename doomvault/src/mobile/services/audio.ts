export type AudioCommand = 'choose'|'snapshot'|'play'|'pause'|'seek'|'stop'|'next'|'previous'|'shuffle'|'repeat'|'jump'|'remove'|'reorder'|'library_play'|'library_enqueue'|'restore_backup';
export type AudioState = {title:string;hasTrack:boolean;playing:boolean;loading:boolean;position:number;duration:number;failed:boolean;queue:{id:string;title:string}[];index:number;shuffle:boolean;repeat:number;canNext:boolean;canPrevious:boolean};
export const emptyAudio: AudioState = {title:'Escolha uma música',hasTrack:false,playing:false,loading:false,position:0,duration:0,failed:false,queue:[],index:-1,shuffle:false,repeat:0,canNext:false,canPrevious:false};
export function bridge() {return (window as Window & {__TAURI__?:{core?:{invoke:(name:string,args?:object)=>Promise<unknown>}}}).__TAURI__?.core;}
export const isAndroidBridgeAvailable = () => !!bridge();
export function validAudioState(value: unknown): value is AudioState {
  if(!value || typeof value!=='object')return false;
  const v=value as Record<string,unknown>;
  return typeof v.title==='string' && ['hasTrack','playing','loading','failed','shuffle','canNext','canPrevious'].every(key=>typeof v[key]==='boolean')
    && Array.isArray(v.queue) && v.queue.length<=200 && v.queue.every(row=>!!row && typeof row==='object' && typeof row.id==='string' && row.id.length>0 && typeof row.title==='string')
    && new Set(v.queue.map(row=>row.id)).size===v.queue.length && Number.isInteger(v.index) && (v.queue.length===0 ? v.index===-1 : Number(v.index)>=0 && Number(v.index)<v.queue.length)
    && v.hasTrack===(v.queue.length>0) && [0,1,2].includes(Number(v.repeat)) && typeof v.repeat==='number'
    && ['position','duration'].every(key=>typeof v[key]==='number' && Number.isFinite(v[key]) && Number(v[key])>=0);
}
export async function audioCommand(command:AudioCommand,args?:object): Promise<AudioState|null> {
  const native=bridge();if(!native)throw Error('O áudio nativo está disponível no APK Android.');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const pending=native.invoke(`plugin:bztune-audio|${command}`,args);
    const value=(command==='choose'||command==='restore_backup') ? await pending : await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('O player não respondeu. Tente novamente.')),10000);})]);
    if(command==='choose' && value && typeof value==='object' && (value as {cancelled?:boolean}).cancelled===true)return null;
    if(!validAudioState(value))throw Error('Resposta inválida do player. Tente novamente.');
    return value;
  } catch(error) {throw Error(error instanceof Error?error.message:typeof error==='string'?error:'Não foi possível acessar o áudio Android.');}
  finally {clearTimeout(timer);}
}
