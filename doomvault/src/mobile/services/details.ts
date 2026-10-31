import {bridge} from './audio';
export type TrackDetails={id:string;artist:string;album:string;cover:string|null};
export async function trackDetails(id:string):Promise<TrackDetails> {
 const native=bridge();if(!native)throw Error('Os detalhes estão disponíveis no APK Android.');let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  const value=await Promise.race([native.invoke('plugin:bztune-audio|track_details',{id}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Os detalhes da faixa não responderam.')),10000);})]);
  if(!value||typeof value!=='object')throw Error('Detalhes inválidos da faixa.');
  const v=value as Record<string,unknown>;
  if(v.id!==id||typeof v.artist!=='string'||typeof v.album!=='string'||!(v.cover===null||(typeof v.cover==='string'&&v.cover.length<=220000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v.cover))))throw Error('Detalhes inválidos da faixa.');
  return v as TrackDetails;
 }catch(e){throw Error(e instanceof Error?e.message:typeof e==='string'?e:'Não foi possível carregar os detalhes da faixa.');}finally{clearTimeout(timer);}
}
