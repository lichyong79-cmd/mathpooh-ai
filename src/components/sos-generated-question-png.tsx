"use client";

import {useEffect,useMemo,useRef,useState} from "react";

type RenderBlock={type:"text"|"mathml";value:string};

function esc(v:string){
  return v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function safeMathMl(v:string){
  let s=String(v??"").trim();
  if(!s)return "";
  s=s
    .replace(/<script[\s\S]*?<\/script>/gi,"")
    .replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi,"")
    .replace(/\s(?:href|src|xlink:href)\s*=\s*(['"])[\s\S]*?\1/gi,"")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi,"");
  return /^<math[\s>]/i.test(s)?s:"";
}

function simpleTokenMath(token:string):string{
  const t=token.trim();
  if(!t)return "";
  if(/^-?\d+(?:\.\d+)?$/.test(t))return `<mn>${esc(t)}</mn>`;
  if(/^[A-Za-zα-ωΑ-Ω]+$/.test(t))return `<mi>${esc(t)}</mi>`;
  return `<mtext>${esc(t)}</mtext>`;
}

function inlineSimple(expr:string):string{
  let s=expr.trim();
  s=s.replace(/∞/g,"__INF__").replace(/√/g,"__SQRT__");
  // superscripts first
  const out:string[]=[];
  let i=0;
  while(i<s.length){
    const sup=s.slice(i).match(/^([A-Za-z0-9α-ωΑ-Ω])\^\{([^{}]+)\}/)
      ||s.slice(i).match(/^([A-Za-z0-9α-ωΑ-Ω])\^\(([^()]+)\)/)
      ||s.slice(i).match(/^([A-Za-z0-9α-ωΑ-Ω])\^([A-Za-z0-9+\-]+)/);
    if(sup){
      out.push(`<msup>${simpleTokenMath(sup[1])}<mrow>${inlineSimple(sup[2])}</mrow></msup>`);
      i+=sup[0].length;continue;
    }
    const sub=s.slice(i).match(/^([A-Za-z0-9α-ωΑ-Ω])_\{([^{}]+)\}/)
      ||s.slice(i).match(/^([A-Za-z0-9α-ωΑ-Ω])_([A-Za-z0-9+\-]+)/);
    if(sub){
      out.push(`<msub>${simpleTokenMath(sub[1])}<mrow>${inlineSimple(sub[2])}</mrow></msub>`);
      i+=sub[0].length;continue;
    }
    const ch=s[i];
    if(ch==="="||ch==="+"||ch==="-"||ch==="−"||ch==="×"||ch==="*"||ch==="/"||ch==="("||ch===")"||ch==="{"||ch==="}"||ch===","||ch==="<"||ch===">"){
      out.push(`<mo>${esc(ch)}</mo>`);i++;continue;
    }
    if(/\d/.test(ch)){
      let j=i+1;while(j<s.length&&/[\d.]/.test(s[j]))j++;
      out.push(`<mn>${esc(s.slice(i,j))}</mn>`);i=j;continue;
    }
    if(/[A-Za-zα-ωΑ-Ω]/.test(ch)){
      let j=i+1;while(j<s.length&&/[A-Za-zα-ωΑ-Ω]/.test(s[j]))j++;
      const word=s.slice(i,j);
      out.push(`<mi>${esc(word)}</mi>`);i=j;continue;
    }
    if(s.startsWith("__INF__",i)){out.push("<mi>∞</mi>");i+=7;continue;}
    if(s.startsWith("__SQRT__",i)){out.push("<mo>√</mo>");i+=8;continue;}
    out.push(`<mtext>${esc(ch)}</mtext>`);i++;
  }
  return out.join("");
}

function legacyBlocks(question:string):RenderBlock[]{
  const lines=String(question??"").split(/\n+/).map(x=>x.trim()).filter(Boolean);
  if(!lines.length)return [{type:"text",value:"문항 내용을 불러오지 못했습니다."}];
  return lines.map(line=>{
    const hasMath=/[=<>^_{}∞√]|(?:lim|sin|cos|tan|log|ln)\b|[A-Za-z]\(/.test(line);
    const korean=(line.match(/[가-힣]/g)||[]).length;
    if(hasMath&&korean<Math.max(4,line.length*.22)){
      return {
        type:"mathml",
        value:`<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow>${inlineSimple(line)}</mrow></math>`
      } as RenderBlock;
    }
    return {type:"text",value:line} as RenderBlock;
  });
}

function normalize(question:string,raw:any):RenderBlock[]{
  if(Array.isArray(raw)){
    const arr=raw.map((b:any)=>({
      type:String(b?.type)==="mathml"?"mathml":"text",
      value:String(b?.value??"").trim()
    })).filter((b:any)=>b.value) as RenderBlock[];
    if(arr.some(b=>b.type==="mathml"&&safeMathMl(b.value)))return arr;
  }
  return legacyBlocks(question);
}

export default function SosGeneratedQuestionPng({
  question,renderBlocks,alt,kind,topic
}:{
  question:string;
  renderBlocks?:any;
  alt:string;
  kind?:string;
  topic?:string;
}){
  const stageRef=useRef<HTMLDivElement|null>(null);
  const [png,setPng]=useState("");
  const [error,setError]=useState("");
  const blocks=useMemo(()=>normalize(question,renderBlocks),[question,renderBlocks]);

  useEffect(()=>{
    let dead=false;
    setPng("");setError("");
    const run=window.setTimeout(async()=>{
      const node=stageRef.current;
      if(!node)return;
      try{
        if(document.fonts?.ready)await document.fonts.ready;
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

        const width=1040;
        const height=Math.max(420,Math.ceil(node.scrollHeight));
        const clone=node.cloneNode(true) as HTMLElement;
        clone.style.position="static";
        clone.style.left="0";
        clone.style.top="0";
        clone.style.width=`${width}px`;
        clone.style.height=`${height}px`;
        clone.style.visibility="visible";
        clone.setAttribute("xmlns","http://www.w3.org/1999/xhtml");

        // SOS261
        // foreignObject SVG를 다시 Canvas에 그린 뒤 toDataURL() 하면
        // Chrome에서 canvas가 tainted 처리될 수 있다.
        // Canvas 재수출을 완전히 제거하고, 완성된 문제지를 단일 SVG image로 표시한다.
        const serialized=new XMLSerializer().serializeToString(clone);
        const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
          <rect x="0" y="0" width="${width}" height="${height}" fill="white"/>
          <foreignObject x="0" y="0" width="${width}" height="${height}">${serialized}</foreignObject>
        </svg>`;
        const data=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        if(!dead)setPng(data);
      }catch(e){
        if(!dead)setError(e instanceof Error?e.message:"문항 이미지 생성 실패");
      }
    },80);
    return()=>{dead=true;window.clearTimeout(run);};
  },[question,blocks,kind,topic]);

  return <div className="sos-generated-png-wrap">
    {!png&&!error?<div className="sos-generated-png-loading">
      <b>AI 유사문항 이미지 생성 중...</b>
      <span>수식을 조판한 뒤 문제 이미지로 변환하고 있습니다.</span>
    </div>:null}
    {error?<div className="sos-generated-image-missing">
      <b>AI 문항 이미지 생성 실패</b><span>{error}</span>
    </div>:null}
    {png?<img className="sos-generated-png" src={png} alt={alt}/>:null}

    <div ref={stageRef} className="sos-generated-png-stage" aria-hidden="true">
      <div className="sos-generated-png-paper">
        <header>
          <b>MATHPOOH · {String(kind)==="HOMEWORK"?"3제 굳히기":"2차 유사훈련"}</b>
          <span>{topic||"AI 유사문항"}</span>
        </header>
        <main>
          {blocks.map((b,i)=>b.type==="mathml"
            ?<div key={i} className="math-block" dangerouslySetInnerHTML={{__html:safeMathMl(b.value)}}/>
            :<div key={i} className="text-block">{b.value}</div>
          )}
        </main>
        <footer>MATHPOOH SOS</footer>
      </div>
    </div>
  </div>;
}
