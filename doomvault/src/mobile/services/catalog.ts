import {bridge} from './audio';
export type CatalogKind='artists'|'albums'|'recordings';
export type CatalogRoute={action:'search'|'artist'|'group'|'recording'|'release';query:string;kind:CatalogKind;id:string;page:number;label:string};
export type CatalogItem={id:string;entity:'artist'|'group'|'recording'|'release'|'track';title:string;artist:string;detail:string;duration:number|null};
export type CatalogResult={provider:'musicbrainz';heading:string;description:string;items:CatalogItem[];total:number;page:number;pageSize:25;pageable:boolean;complete:boolean;cached:boolean;offline:boolean;fetchedAt:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validCatalogRoute(value:unknown):value is CatalogRoute {
 if(!value||typeof value!=='object')return false;const r=value as CatalogRoute;
 return ['search','artist','group','recording','release'].includes(r.action)&&['artists','albums','recordings'].includes(r.kind)&&typeof r.query==='string'&&r.query.length<=160&&typeof r.label==='string'&&r.label.length<=4096&&Number.isInteger(r.page)&&r.page>=0&&r.page<=399&&typeof r.id==='string'&&(r.action==='search'?r.query.trim().length>=2:uuid.test(r.id));
}
function valid(value:unknown):value is CatalogResult {
 if(!value||typeof value!=='object')return false;const r=value as CatalogResult;
 return r.provider==='musicbrainz'&&typeof r.heading==='string'&&r.heading.length<=4096&&typeof r.description==='string'&&r.description.length<=4096&&typeof r.pageable==='boolean'&&typeof r.complete==='boolean'&&typeof r.cached==='boolean'&&typeof r.offline==='boolean'&&(!r.offline||r.cached)&&Number.isSafeInteger(r.fetchedAt)&&r.fetchedAt>=0&&Number.isInteger(r.total)&&r.total>=0&&Number.isInteger(r.page)&&r.page>=0&&r.page<=399&&r.pageSize===25&&Array.isArray(r.items)&&r.items.length<=(r.pageable?25:1000)&&r.total>=r.items.length&&r.items.every(i=>i&&typeof i==='object'&&uuid.test(i.id)&&['artist','group','recording','release','track'].includes(i.entity)&&['title','artist','detail'].every(k=>typeof i[k as keyof CatalogItem]==='string'&&(i[k as keyof CatalogItem] as string).length<=4096)&&i.title.trim().length>0&&(i.duration===null||(Number.isSafeInteger(i.duration)&&i.duration>=0)))&&new Set(r.items.map(i=>i.id)).size===r.items.length;
}
export async function cancelCatalog(requestId:string) {try{await bridge()?.invoke('plugin:bztune-audio|cancel_catalog',{requestId});}catch{/* An inactive read has no UI to update. */}}
export async function catalog(route:CatalogRoute,requestId:string,refresh=false):Promise<CatalogResult> {
 const native=bridge();if(!native)throw Error('Use o APK Android para consultar o catálogo online.');if(!validCatalogRoute(route))throw Error('Consulta inválida.');
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  const response=await Promise.race([native.invoke('plugin:bztune-audio|online_catalog',{request:{...route,requestId,refresh}}),new Promise((_,reject)=>{timer=setTimeout(()=>{void cancelCatalog(requestId);reject(Error('A consulta demorou demais. Tente novamente.'));},35000);})]);
  if(!valid(response)||response.page!==(response.pageable?route.page:0))throw Error('Resposta inválida do catálogo. Tente novamente.');return response;
 }catch(e){throw Error(e instanceof Error?e.message:typeof e==='string'?e:'Não foi possível consultar o catálogo.');}finally{clearTimeout(timer);}
}
