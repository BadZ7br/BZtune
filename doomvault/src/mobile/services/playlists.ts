import {bridge} from './audio';
export type PlaylistSummary={id:string;name:string;revision:number;count:number};
export type PlaylistTrack={id:string;title:string;artist:string;album:string};
export type Playlist=PlaylistSummary&{tracks:PlaylistTrack[]};
export type PlaylistsState={playlists:PlaylistSummary[];selected:Playlist|null};
export type PlaylistRequest={action:'list'|'create'|'rename'|'delete'|'add'|'add_many'|'remove'|'reorder';id?:string;name?:string;trackId?:string;trackIds?:string[];revision?:number};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object';
const summary=(v:unknown):v is PlaylistSummary=>object(v)&&typeof v.id==='string'&&v.id.length>0&&typeof v.name==='string'&&v.name.trim().length>0&&v.name.length<=120&&Number.isSafeInteger(v.revision)&&Number(v.revision)>=0&&Number.isInteger(v.count)&&Number(v.count)>=0&&Number(v.count)<=200;
export function validPlaylists(value:unknown):value is PlaylistsState {
  if(!object(value)||!Array.isArray(value.playlists)||value.playlists.length>100||!value.playlists.every(summary)||new Set(value.playlists.map(p=>p.id)).size!==value.playlists.length)return false;
  const selected=value.selected;if(selected===null)return true;
  if(!summary(selected))return false;
  const tracks=(selected as PlaylistSummary&Record<string,unknown>).tracks;
  if(!Array.isArray(tracks)||tracks.length!==selected.count)return false;
  if(!tracks.every(t=>object(t)&&['id','title','artist','album'].every(k=>typeof t[k]==='string')&&String(t.id).length>0)||new Set(tracks.map(t=>t.id)).size!==tracks.length)return false;
  return value.playlists.some(p=>p.id===selected.id&&p.name===selected.name&&p.revision===selected.revision&&p.count===selected.count);
}
export async function playlists(request:PlaylistRequest):Promise<PlaylistsState> {
  const core=bridge();if(!core)throw Error('As playlists locais estão disponíveis no APK Android.');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const pending=core.invoke('plugin:bztune-audio|playlists',{request});
    // A confirmed local mutation cannot be safely abandoned by a frontend timer.
    const value=request.action==='list'?await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('As playlists não responderam. Tente recarregar.')),10000);})]):await pending;
    if(!validPlaylists(value))throw Error('Resposta inválida das playlists. Recarregue para conferir os dados.');
    return value;
  } catch(error) {throw Error(error instanceof Error?error.message:typeof error==='string'?error:'Não foi possível acessar as playlists.');}
  finally {clearTimeout(timer);}
}
