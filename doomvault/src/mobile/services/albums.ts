import {bridge} from './audio';
export type Album={id:string;title:string;artist:string;year:string;favorite:boolean;collected:boolean;count:number};
export type AlbumPage={items:Album[];total:number;page:number;pageSize:number;artists:string[]};
export type AlbumQuery={query:string;artist:string;filter:'all'|'favorites'|'collection';page:number};
export function validAlbums(value:unknown):value is AlbumPage {
 if(!value||typeof value!=='object')return false;const v=value as Record<string,unknown>;
 return Array.isArray(v.items)&&v.items.length<=50&&v.items.every(a=>a&&typeof a==='object'&&['id','title','artist','year'].every(k=>typeof a[k]==='string')&&a.id.length>0&&typeof a.favorite==='boolean'&&typeof a.collected==='boolean'&&Number.isSafeInteger(a.count)&&a.count>=0)&&new Set(v.items.map(a=>a.id)).size===v.items.length&&Number.isSafeInteger(v.total)&&Number(v.total)>=v.items.length&&Number.isInteger(v.page)&&Number(v.page)>=0&&Number(v.page)<=Math.floor(Math.max(0,Number(v.total)-1)/50)&&v.pageSize===50&&Array.isArray(v.artists)&&v.artists.every(a=>typeof a==='string')&&new Set(v.artists).size===v.artists.length;
}
export async function albums(query:AlbumQuery,mark?:{id:string;favorite:boolean;collected:boolean;expectedFavorite:boolean;expectedCollected:boolean}):Promise<AlbumPage> {
 const core=bridge();if(!core)throw Error('Os álbuns locais estão disponíveis no APK Android.');let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  const pending=core.invoke('plugin:bztune-audio|albums',{request:{...query,...mark,action:mark?'mark':'list'}});
  const result=mark?await pending:await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Os álbuns não responderam. Tente recarregar.')),10000);})]);
  if(!validAlbums(result))throw Error('Resposta inválida dos álbuns. Recarregue para conferir.');return result;
 }catch(e){throw Error(e instanceof Error?e.message:typeof e==='string'?e:'Não foi possível carregar os álbuns.');}finally{clearTimeout(timer);}
}
