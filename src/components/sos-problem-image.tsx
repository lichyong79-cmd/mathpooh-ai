"use client";

export default function SosProblemImage({
  src,
  alt,
  maskOriginalNumber=false,
}:{
  src:string;
  alt:string;
  maskOriginalNumber?:boolean;
}){
  return <div className={`sos-problem-image-wrap ${maskOriginalNumber?"with-sos-mask":""}`}>
    <img src={src} alt={alt}/>
    {maskOriginalNumber?<div className="sos-origin-number-mask" aria-hidden="true">
      <img src="/sos-mini-logo.png" alt=""/>
      <span>MATHPOOH</span>
    </div>:null}
  </div>;
}
