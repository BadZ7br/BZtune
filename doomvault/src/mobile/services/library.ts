import {bridge} from './audio';
export type LibraryTrack={id:string;title:string;artist:string;album:string;year:string;duration:number;favorite:boolean;cover:string|null};
export type LibraryPage={items:LibraryTrack[];total:number;page:number;pageSize:number;artists:string[];albums:{id:string;label:string}[];imported?:number};
export function validLibraryPage(value:unknown):value is LibraryPage {
  if(!value||typeof value!=='object')return false;
  const v=value as Record<string,unknown>;
  return Array.isArray(v.items)&&v.items.length<=50&&v.items.every(t=>t&&typeof t==='object'
    &&['id','title','artist','album','year'].every(k=>typeof t[k]==='string')&&t.id.length>0
    &&typeof t.favorite==='boolean'
    &&typeof t.duration==='number'&&Number.isFinite(t.duration)&&t.duration>=0
    &&(t.cover===null||(typeof t.cover==='string'&&t.cover.length<=220000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(t.cover))))
    &&new Set(v.items.map(t=>t.id)).size===v.items.length
    &&['total','page'].every(k=>Number.isInteger(v[k])&&Number(v[k])>=0)&&v.pageSize===50
    &&v.items.length<=Number(v.total)&&Number(v.page)<=Math.floor(Math.max(0,Number(v.total)-1)/50)
    &&(v.imported===undefined||(Number.isInteger(v.imported)&&Number(v.imported)>=0&&Number(v.imported)<=200))
    &&Array.isArray(v.artists)&&v.artists.every(a=>typeof a==='string')&&new Set(v.artists).size===v.artists.length
    &&Array.isArray(v.albums)&&v.albums.every(a=>a&&typeof a==='object'&&typeof a.id==='string'&&a.id.length>0&&typeof a.label==='string')&&new Set(v.albums.map(a=>a.id)).size===v.albums.length;
}
async function invoke(command:string,args?:object):Promise<unknown> {
  const core=bridge();if(!core)throw Error('A biblioteca local está disponível no APK Android.');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const request=core.invoke(`plugin:bztune-audio|${command}`,args);
    return command==='import_library'?await request:await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('A biblioteca não respondeu. Tente novamente.')),10000);})]);
  } catch(e) {throw Error(e instanceof Error?e.message:typeof e==='string'?e:'Não foi possível acessar a biblioteca.');}
  finally {clearTimeout(timer);}
}
export async function libraryPage(args:{query:string;artist:string;album:string;page:number;favoritesOnly:boolean;sort?:'title'|'artist'|'album'|'recent'}):Promise<LibraryPage> {
  const result=await invoke('library_list',args);if(!validLibraryPage(result))throw Error('Resposta inválida da biblioteca. Tente novamente.');return result;
}
export async function importLibrary():Promise<LibraryPage|null> {
  const result=await invoke('import_library');
  if(result&&typeof result==='object'&&(result as {cancelled?:boolean}).cancelled===true)return null;
  if(!validLibraryPage(result))throw Error('Resposta inválida da importação. Recarregue a biblioteca para conferir.');return result;
}
export async function forgetLibraryTrack(id:string):Promise<void> {
  const result=await invoke('library_forget',{id});
  if(!result||typeof result!=='object'||(result as {removed?:boolean}).removed!==true)throw Error('Não foi possível confirmar a remoção. Recarregue a biblioteca.');
}

export async function setLibraryFavorite(id:string,favorite:boolean):Promise<void> {
  const result=await invoke('library_favorite',{id,favorite});
  if(!result||typeof result!=='object'||(result as {updated?:boolean}).updated!==true)throw Error('Não foi possível confirmar o favorito. Recarregue a biblioteca.');
}

export type HomeLibrary={total:number;recentTotal:number;favoriteTotal:number;recent:LibraryTrack[];favorites:LibraryTrack[]};
export function validHomeLibrary(value:unknown):value is HomeLibrary {
 if(!value||typeof value!=='object')return false;const v=value as HomeLibrary;
 const count=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0;
 const cards=(items:unknown,total:number)=>Array.isArray(items)&&items.length===Math.min(6,total)&&validLibraryPage({items,total,page:0,pageSize:50,artists:[],albums:[]});
 return count(v.total)&&count(v.recentTotal)&&count(v.favoriteTotal)&&v.recentTotal<=v.total&&v.favoriteTotal<=v.total&&cards(v.recent,v.recentTotal)&&cards(v.favorites,v.favoriteTotal)&&v.favorites.every(t=>t.favorite);
}
export async function homeLibrary():Promise<HomeLibrary>{
 const value=await invoke('library_list',{home:true});
 if(!validHomeLibrary(value))throw Error('Resposta inválida do início. Tente recarregar.');return value;
}
