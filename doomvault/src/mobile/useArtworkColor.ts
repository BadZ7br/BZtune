import {useEffect,useState} from 'react';
export const neutralArtworkColor='37, 48, 61';
const cache=new Map<string,string>();
/** Only embedded thumbnails are decoded; no URL supplied by metadata is fetched. */
export function useArtworkColor(source:string|null,active:boolean){
 const [result,setResult]=useState<{source:string;color:string}|null>(null);
 useEffect(()=>{
  if(!active||!source||source.length>220000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(source))return;
  const known=cache.get(source);if(known){setResult({source,color:known});return;}
  let cancelled=false;const img=new Image();
  img.onload=()=>{
   if(cancelled||!img.naturalWidth||!img.naturalHeight||img.naturalWidth>4096||img.naturalHeight>4096)return;
   try{
    const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return;
    ctx.drawImage(img,0,0,32,32);const pixels=ctx.getImageData(0,0,32,32).data;
    const buckets=new Map<number,{weight:number;r:number;g:number;b:number}>();
    for(let i=0;i<pixels.length;i+=4){
     const r=pixels[i],g=pixels[i+1],b=pixels[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
     if(pixels[i+3]<128||max<24||min>235)continue;
     const weight=1+(max-min)/255,key=(r>>5)*64+(g>>5)*8+(b>>5),value=buckets.get(key)??{weight:0,r:0,g:0,b:0};
     value.weight+=weight;value.r+=r*weight;value.g+=g*weight;value.b+=b*weight;buckets.set(key,value);
    }
    const dominant=Array.from(buckets.values()).sort((a,b)=>b.weight-a.weight)[0];
    // Tint only the background. Cap each component at 80 to keep text/controls on a dark surface.
    const color=dominant?[dominant.r,dominant.g,dominant.b].map(v=>Math.round(16+v/dominant.weight*.25)).join(', '):neutralArtworkColor;
    if(!cancelled){if(cache.size>=8)cache.delete(cache.keys().next().value!);cache.set(source,color);setResult({source,color});}
   }catch{/* Broken artwork must not affect playback or leave the previous song's color. */}
  };
  img.src=source;
  return()=>{cancelled=true;img.onload=null;img.onerror=null;};
 },[source,active]);
 return active&&source&&result?.source===source?result.color:neutralArtworkColor;
}
