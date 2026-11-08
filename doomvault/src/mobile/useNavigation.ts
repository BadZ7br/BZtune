import {validAlbums,type Album} from './services/albums';
import {validCatalogRoute,type CatalogRoute} from './services/catalog';
import {useEffect,useRef,useState} from 'react';
export type Screen='home'|'search'|'library'|'settings';
export type LibraryView='tracks'|'albums'|'artists'|'playlists';
export type LocalDetail={kind:'artist';name:string}|{kind:'album';album:Album};
export function validLocalDetail(v:unknown):v is LocalDetail{
 if(!v||typeof v!=='object')return false;const d=v as LocalDetail;
 return (d.kind==='artist'&&typeof d.name==='string'&&d.name.length>0&&d.name.length<=512)||(d.kind==='album'&&validAlbums({items:[d.album],total:1,page:0,pageSize:50,artists:[]}));
}
export type Navigation={bztune:1;screen:Screen;view:LibraryView;player:boolean;panel:'player'|'queue';queueLayer:boolean;searchMode:'local'|'online';catalog:CatalogRoute|null;detail:LocalDetail|null;playlistId:string|null;artistList:{query:string;page:number}};
const initial:Navigation={bztune:1,screen:'home',view:'tracks',player:false,panel:'player',queueLayer:false,searchMode:'local',catalog:null,detail:null,playlistId:null,artistList:{query:'',page:0}};
function read(value:unknown):Navigation {
 const v=value as Navigation|null;
 return v&&v.bztune===1&&['home','search','library','settings'].includes(v.screen)&&['tracks','albums','artists','playlists'].includes(v.view)&&typeof v.player==='boolean'&&['player','queue'].includes(v.panel)?{bztune:1,screen:v.screen,view:v.view,player:v.player,panel:v.panel,queueLayer:v.queueLayer===true&&v.player&&v.panel==='queue',searchMode:v.searchMode==='online'?'online':'local',catalog:validCatalogRoute(v.catalog)?v.catalog:null,detail:validLocalDetail(v.detail)?v.detail:null,playlistId:typeof v.playlistId==='string'&&v.playlistId.length>0&&v.playlistId.length<=512?v.playlistId:null,artistList:v.artistList&&typeof v.artistList.query==='string'&&v.artistList.query.length<=512&&Number.isInteger(v.artistList.page)&&v.artistList.page>=0?{query:v.artistList.query,page:v.artistList.page}:{query:'',page:0}}:initial;
}
export function useNavigation() {
 const [route,setRoute]=useState(()=>read(history.state));const current=useRef(route);const pendingBack=useRef(false);
 useEffect(()=>{const onPop=()=>{pendingBack.current=false;current.current=read(history.state);setRoute(current.current);};window.addEventListener('popstate',onPop);if(history.state?.bztuneSheet&&history.length>1){if(!pendingBack.current){pendingBack.current=true;history.back();}}else history.replaceState(current.current,'');return()=>window.removeEventListener('popstate',onPop);},[]);
 function update(next:Navigation,replace=false) {
  if(pendingBack.current)return;
  if(JSON.stringify(next)===JSON.stringify(current.current))return;
  if(replace)history.replaceState(next,'');else history.pushState(next,'');
  current.current=next;setRoute(next);
 }
 function closePlayer() {
  if(!current.current.player||pendingBack.current)return;
  // Reloaded modal entries still have their previous screen in the WebView history.
  pendingBack.current=true;history.go(current.current.panel==='queue'&&current.current.queueLayer?-2:-1);
 }
 function openPlayer(panel:Navigation['panel']='player'){
  const base={...current.current,player:true,panel:'player' as const,queueLayer:false};update(base);
  if(panel==='queue')update({...base,panel:'queue',queueLayer:true});
 }
 function playerPanel(panel:Navigation['panel']){
  if(!current.current.player||pendingBack.current||panel===current.current.panel)return;
  if(panel==='queue')update({...current.current,panel,queueLayer:true});else if(current.current.queueLayer){pendingBack.current=true;history.back();}else update({...current.current,panel,queueLayer:false},true);
 }
 return {route,openPlaylist:(playlistId:string|null,replace=false)=>update({...current.current,screen:'library',view:'playlists',detail:null,playlistId,player:false},replace),filterArtists:(query:string,page:number)=>update({...current.current,artistList:{query,page}},true),openDetail:(detail:LocalDetail)=>update({...current.current,screen:'library',detail,playlistId:null,player:false}),back:()=>history.back(),explore:(catalog:CatalogRoute)=>update({...current.current,screen:'search',searchMode:'online',catalog,player:false}),searchMode:(searchMode:'local'|'online')=>update({...current.current,screen:'search',searchMode,player:false}),navigate:(screen:Screen,view:LibraryView=current.current.view)=>update({...current.current,screen,view,detail:null,playlistId:null,player:false}),openPlayer,panel:playerPanel,closePlayer};
}
