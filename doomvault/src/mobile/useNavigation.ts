import {useEffect,useRef,useState} from 'react';
export type Screen='home'|'search'|'library'|'settings';
export type LibraryView='tracks'|'albums'|'playlists';
export type Navigation={bztune:1;screen:Screen;view:LibraryView;player:boolean;panel:'player'|'queue'};
const initial:Navigation={bztune:1,screen:'home',view:'tracks',player:false,panel:'player'};
function read(value:unknown):Navigation {
 const v=value as Navigation|null;
 return v&&v.bztune===1&&['home','search','library','settings'].includes(v.screen)&&['tracks','albums','playlists'].includes(v.view)&&typeof v.player==='boolean'&&['player','queue'].includes(v.panel)?{bztune:1,screen:v.screen,view:v.view,player:v.player,panel:v.panel}:initial;
}
export function useNavigation() {
 const [route,setRoute]=useState(()=>read(history.state));const current=useRef(route);const pendingBack=useRef(false);
 useEffect(()=>{history.replaceState(current.current,'');const onPop=()=>{pendingBack.current=false;current.current=read(history.state);setRoute(current.current);};window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop);},[]);
 function update(next:Navigation,replace=false) {
  if(pendingBack.current)return;
  if(JSON.stringify(next)===JSON.stringify(current.current))return;
  if(replace)history.replaceState(next,'');else history.pushState(next,'');
  current.current=next;setRoute(next);
 }
 function closePlayer() {
  if(!current.current.player||pendingBack.current)return;
  // Reloaded modal entries still have their previous screen in the WebView history.
  pendingBack.current=true;history.back();
 }
 return {route,navigate:(screen:Screen,view:LibraryView=current.current.view)=>update({...current.current,screen,view,player:false}),openPlayer:(panel:Navigation['panel']='player')=>update({...current.current,player:true,panel}),panel:(panel:Navigation['panel'])=>update({...current.current,panel},true),closePlayer};
}
