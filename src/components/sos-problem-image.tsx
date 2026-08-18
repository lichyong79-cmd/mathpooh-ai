"use client";
import {useEffect,useRef,useState} from "react";
type MaskBox={left:number;top:number;width:number;height:number};
export default function SosProblemImage({src,alt,maskOriginalNumber=false}:{src:string;alt:string;maskOriginalNumber?:boolean;}){
  const imgRef=useRef<HTMLImageElement|null>(null);
  const [box,setBox]=useState<MaskBox|null>(null);
  const [ready,setReady]=useState(!maskOriginalNumber);
  useEffect(()=>{setBox(null);setReady(!maskOriginalNumber);},[src,maskOriginalNumber]);
  const fallback=(w:number,h:number)=>{setBox({left:0.8,top:1.5,width:8.2,height:Math.min(14,Math.max(7,72/h*100))});setReady(true);};
  const detect=()=>{
    if(!maskOriginalNumber){setReady(true);return;}
    const img=imgRef.current;if(!img?.naturalWidth||!img?.naturalHeight)return;
    try{
      const scale=Math.min(1,1400/img.naturalWidth),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
      const bandH=Math.max(40,Math.min(h,Math.round(h*.30))),xLimit=Math.min(w,Math.round(w*.28));
      const c=document.createElement('canvas');c.width=w;c.height=bandH;const ctx=c.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('canvas');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,w,bandH);ctx.drawImage(img,0,0,img.naturalWidth,img.naturalHeight,0,0,w,h);
      const px=ctx.getImageData(0,0,w,bandH).data;
      const dark=(x:number,y:number)=>{const i=(y*w+x)*4;if(px[i+3]<30)return false;return px[i]*.299+px[i+1]*.587+px[i+2]*.114<165;};
      const rows=new Array<number>(bandH).fill(0);for(let y=0;y<bandH;y++){let n=0;for(let x=0;x<xLimit;x++)if(dark(x,y))n++;rows[y]=n;}
      const rt=Math.max(2,Math.round(w*.002));let y0=-1;for(let y=0;y<bandH;y++)if(rows[y]>=rt){y0=y;break;}if(y0<0){fallback(w,h);return;}
      let y1=y0,blank=0;for(let y=y0;y<bandH;y++){if(rows[y]>=rt){y1=y;blank=0;}else if(++blank>=Math.max(4,Math.round(h*.006)))break;} y0=Math.max(0,y0-3);y1=Math.min(bandH-1,y1+3);
      const cols=new Array<number>(xLimit).fill(0);for(let x=0;x<xLimit;x++){let n=0;for(let y=y0;y<=y1;y++)if(dark(x,y))n++;cols[x]=n;}
      const ct=Math.max(1,Math.round((y1-y0+1)*.035)),active=cols.map(v=>v>=ct);for(let x=2;x<xLimit-2;x++)if(!active[x]&&(active[x-1]||active[x-2])&&(active[x+1]||active[x+2]))active[x]=true;
      let x0=-1;for(let x=0;x<xLimit;x++)if(active[x]){x0=x;break;}if(x0<0||x0>w*.12){fallback(w,h);return;}
      const minGap=Math.max(7,Math.round(w*.010));let gs=-1,x1=-1;for(let x=x0;x<xLimit;x++){if(active[x])gs=-1;else{if(gs<0)gs=x;if(x-gs+1>=minGap){x1=gs-1;break;}}}if(x1<0)x1=Math.min(xLimit-1,x0+Math.round(w*.065));
      const token=x1-x0+1;if(token<=0||token>w*.11){fallback(w,h);return;}
      const pxPad=Math.max(2,Math.round(w*.003)),pyPad=Math.max(2,Math.round(h*.003));const l=Math.max(0,x0-pxPad),r=Math.min(w,x1+pxPad),t=Math.max(0,y0-pyPad),b=Math.min(h,y1+pyPad);
      setBox({left:l/w*100,top:t/h*100,width:Math.max(2.8,(r-l)/w*100),height:Math.max(4.8,(b-t)/h*100)});setReady(true);
    }catch{fallback(img.naturalWidth,img.naturalHeight);}
  };
  return <div className={`sos-problem-image-wrap ${maskOriginalNumber?'number-mask':''}`}>
    <img ref={imgRef} src={src} alt={alt} crossOrigin="anonymous" onLoad={detect} className={ready?'number-mask-ready':'number-mask-pending'}/>
    {maskOriginalNumber&&ready&&box?<div className="sos-number-token-mask" aria-hidden="true" style={{left:`${box.left}%`,top:`${box.top}%`,width:`${box.width}%`,height:`${box.height}%`}}><img src="/sos-mini-logo.png" alt=""/></div>:null}
  </div>;
}
