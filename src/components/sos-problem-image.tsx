"use client";
import {useEffect,useMemo,useRef,useState} from "react";
function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v));}
export default function SosProblemImage({src,alt,maskOriginalNumber=false}:{src:string;alt:string;maskOriginalNumber?:boolean;}){
  const imgRef=useRef<HTMLImageElement|null>(null);
  const [cropPct,setCropPct]=useState(0);
  const [ready,setReady]=useState(!maskOriginalNumber);
  useEffect(()=>{setCropPct(0);setReady(!maskOriginalNumber);},[src,maskOriginalNumber]);
  const detectNumberEnd=()=>{
    if(!maskOriginalNumber){setReady(true);return;}
    const img=imgRef.current;if(!img?.naturalWidth||!img?.naturalHeight)return;
    try{
      const scale=Math.min(1,1400/img.naturalWidth),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
      const bandH=Math.max(24,Math.min(h,Math.round(h*.34))),canvas=document.createElement("canvas");canvas.width=w;canvas.height=bandH;
      const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)throw new Error();ctx.fillStyle="#fff";ctx.fillRect(0,0,w,bandH);ctx.drawImage(img,0,0,img.naturalWidth,img.naturalHeight,0,0,w,h);
      const px=ctx.getImageData(0,0,w,bandH).data,ink=new Array<number>(w).fill(0);
      for(let y=0;y<bandH;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(px[i+3]<30)continue;const lum=px[i]*.299+px[i+1]*.587+px[i+2]*.114;if(lum<175)ink[x]++;}
      const minInk=Math.max(1,Math.round(bandH*.012)),active=ink.map(v=>v>=minInk);for(let x=2;x<w-2;x++)if(!active[x]&&(active[x-1]||active[x-2])&&(active[x+1]||active[x+2]))active[x]=true;
      const searchEnd=Math.max(40,Math.round(w*.34));let first=-1;for(let x=0;x<searchEnd;x++)if(active[x]){first=x;break;}
      if(first<0){setCropPct(4.5);setReady(true);return;}
      const minGap=Math.max(5,Math.round(w*.007));let gap=-1,cut=-1;
      for(let x=first;x<searchEnd;x++){if(active[x])gap=-1;else{if(gap<0)gap=x;if(x-gap+1>=minGap&&gap-first>=Math.max(4,Math.round(w*.005))){cut=gap;break;}}}
      if(cut<0)cut=first+Math.round(w*.06);setCropPct(clamp(cut/w*100,2.2,14));setReady(true);
    }catch{setCropPct(5.5);setReady(true);}
  };
  const style=useMemo(()=>!maskOriginalNumber||cropPct<=0?undefined:{width:`${100/(1-cropPct/100)}%`,maxWidth:"none",transform:`translateX(-${cropPct}%)`,transformOrigin:"left top"} as React.CSSProperties,[maskOriginalNumber,cropPct]);
  return <div className={`sos-problem-image-wrap ${maskOriginalNumber?"number-crop":""}`}><img ref={imgRef} src={src} alt={alt} crossOrigin="anonymous" onLoad={detectNumberEnd} style={style} className={ready?"number-crop-ready":"number-crop-pending"}/></div>;
}
