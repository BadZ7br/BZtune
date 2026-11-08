import {useEffect,useRef,type ReactNode,type KeyboardEvent} from 'react';
import {X} from 'lucide-react';

type Dismiss=(after?:()=>void)=>void;
/** One history entry lets the Android Back button dismiss the sheet before leaving its screen. */
export default function ActionSheet({title,onClose,children,busy=false}:{title:string;onClose:()=>void;busy?:boolean;children:(dismiss:Dismiss)=>ReactNode}) {
 const dialog=useRef<HTMLDialogElement>(null),callback=useRef(onClose),after=useRef<(()=>void)|undefined>();
 const busyRef=useRef(busy);busyRef.current=busy;
 const entered=useRef(false);const closing=useRef(false),key=useRef(`sheet-${Date.now()}-${Math.random()}`);callback.current=onClose;
 useEffect(()=>{
  const node=dialog.current;if(!node)return;
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  const timer=setTimeout(()=>{history.pushState({...history.state,bztuneSheet:key.current},'');entered.current=true;},0);document.body.style.overflow='hidden';node.showModal();
  function pop(){if(!entered.current||history.state?.bztuneSheet===key.current)return;if(busyRef.current){history.pushState({...history.state,bztuneSheet:key.current},'');return;}entered.current=false;closing.current=true;node?.close();callback.current();after.current?.();}
  window.addEventListener('popstate',pop);
  return()=>{clearTimeout(timer);window.removeEventListener('popstate',pop);node.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[]);
 useEffect(()=>{const node=dialog.current;if(node?.open&&!node.contains(document.activeElement)){(node.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled)')??node.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();}},[title]);
 const dismiss:Dismiss=(task)=>{if(closing.current||busyRef.current)return;closing.current=true;after.current=task;if(entered.current)history.back();else{callback.current();task?.();}};
 function containFocus(e:KeyboardEvent<HTMLDialogElement>){
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismiss();return;}
  if(e.key!=='Tab')return;
  const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')??[]).filter(n=>n.getClientRects().length>0);
  const first=nodes[0],last=nodes[nodes.length-1];
  if(!first){e.preventDefault();dialog.current?.focus();return;}
  if((e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last)){e.preventDefault();(e.shiftKey?last:first).focus();}
 }
 return <dialog ref={dialog} className="action-sheet" aria-label={title} onKeyDown={containFocus} onCancel={e=>{e.preventDefault();dismiss();}} onClick={e=>{if(e.target===dialog.current){const r=dialog.current.getBoundingClientRect();if(e.clientY<r.top||e.clientX<r.left||e.clientX>r.right||e.clientY>r.bottom)dismiss();}}}>
  <div className="sheet-handle" aria-hidden="true"/>
  <header className="sheet-header"><h2>{title}</h2><button className="icon-button" aria-label="Fechar opções" disabled={busy} onClick={()=>dismiss()}><X/></button></header>
  <div className="sheet-content">{children(dismiss)}</div>
 </dialog>;
}
