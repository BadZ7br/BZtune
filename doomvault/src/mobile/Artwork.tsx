import {useState} from 'react';
export default function Artwork({src,small=false}:{src:string|null;small?:boolean}) {
 const [ready,setReady]=useState<string|null>(null);const [failed,setFailed]=useState<string|null>(null);
 return <span className={small?'player-artwork player-artwork-small':'player-artwork'} aria-hidden="true"><span>♫</span>{src&&failed!==src&&<img src={src} alt="" className={ready===src?'artwork-loaded':undefined} onLoad={()=>setReady(src)} onError={()=>setFailed(src)}/>}</span>;
}
