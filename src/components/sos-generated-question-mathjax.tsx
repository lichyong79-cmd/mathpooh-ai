"use client";

import {useEffect,useMemo,useRef,useState} from "react";

declare global {
  interface Window {
    MathJax?: any;
    __MATHPOOH_MATHJAX_PROMISE__?: Promise<any>;
  }
}

type RenderBlock={type:"text"|"mathml";value:string};

function sanitizeMathMl(value:string){
  let s=String(value??"").trim();
  if(!s)return "";
  s=s
    .replace(/<script[\s\S]*?<\/script>/gi,"")
    .replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi,"")
    .replace(/\s(?:href|src|xlink:href)\s*=\s*(['"])[\s\S]*?\1/gi,"")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi,"");
  return /^<math[\s>]/i.test(s)?s:"";
}

function legacyBlocks(raw:any):RenderBlock[]{
  if(!Array.isArray(raw))return [];
  return raw
    .map((b:any):RenderBlock=>({
      type:String(b?.type)==="mathml" ? "mathml" : "text",
      value:String(b?.value??"").trim()
    }))
    .filter((b:RenderBlock)=>Boolean(b.value));
}

function loadMathJax(){
  if(typeof window==="undefined")return Promise.reject(new Error("브라우저 전용"));
  if(window.MathJax?.typesetPromise)return Promise.resolve(window.MathJax);
  if(window.__MATHPOOH_MATHJAX_PROMISE__)return window.__MATHPOOH_MATHJAX_PROMISE__;

  window.MathJax={
    tex:{
      inlineMath:[["\\(","\\)"]],
      displayMath:[["\\[","\\]"]],
      processEscapes:true,
      packages:{"[+]":["ams"]}
    },
    svg:{fontCache:"global"},
    options:{skipHtmlTags:["script","noscript","style","textarea","pre","code"]}
  };

  window.__MATHPOOH_MATHJAX_PROMISE__=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-mathpooh-mathjax="1"]') as HTMLScriptElement|null;
    if(existing){
      existing.addEventListener("load",()=>resolve(window.MathJax),{once:true});
      existing.addEventListener("error",()=>reject(new Error("MathJax 로드 실패")),{once:true});
      return;
    }
    const script=document.createElement("script");
    script.src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
    script.async=true;
    script.dataset.mathpoohMathjax="1";
    script.onload=()=>resolve(window.MathJax);
    script.onerror=()=>reject(new Error("MathJax 로드 실패"));
    document.head.appendChild(script);
  });
  return window.__MATHPOOH_MATHJAX_PROMISE__;
}

export default function SosGeneratedQuestionMathJax({
  displayLatex,question,renderBlocks,alt,kind,topic
}:{
  displayLatex?:string;
  question:string;
  renderBlocks?:any;
  alt:string;
  kind?:string;
  topic?:string;
}){
  const latex=String(displayLatex??"").trim();
  const blocks=useMemo(()=>legacyBlocks(renderBlocks),[renderBlocks]);
  const holder=useRef<HTMLDivElement|null>(null);
  const [ready,setReady]=useState(!latex);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!latex){setReady(true);setError("");return;}
    let dead=false;
    setReady(false);setError("");
    const node=holder.current;
    if(!node)return;

    node.textContent=latex;

    loadMathJax()
      .then(async(MathJax)=>{
        if(dead||!node)return;
        try{
          if(typeof MathJax.typesetClear==="function")MathJax.typesetClear([node]);
          await MathJax.typesetPromise([node]);
          if(!dead)setReady(true);
        }catch(e){
          if(!dead){setError(e instanceof Error?e.message:"수식 조판 실패");setReady(true);}
        }
      })
      .catch(e=>{
        if(!dead){setError(e instanceof Error?e.message:"MathJax 로드 실패");setReady(true);}
      });

    return()=>{dead=true;};
  },[latex]);

  const hasLegacyMath=blocks.some(b=>b.type==="mathml"&&sanitizeMathMl(b.value));

  return <section className="sos-ai-paper" aria-label={alt}>
    <header className="sos-ai-paper-head">
      <b>MATHPOOH</b>
      <span>{String(kind)==="HOMEWORK"?"AI 유사문항 · 3제 굳히기":"AI 유사문항 · 2차 훈련"}</span>
    </header>

    {topic?<div className="sos-ai-paper-topic">{topic}</div>:null}

    {latex?
      <div className={`sos-ai-latex ${ready?"ready":"loading"}`}>
        {!ready?<div className="sos-ai-typeset-wait">수학 문제 조판 중...</div>:null}
        <div ref={holder} className="sos-ai-latex-body"/>
        {error?<div className="sos-ai-typeset-warning">수식 조판 연결을 확인해 주세요. {error}</div>:null}
      </div>
    :hasLegacyMath?
      <div className="sos-ai-legacy-math">
        {blocks.map((b,i)=>b.type==="mathml"
          ?<div key={i} className="sos-ai-legacy-formula" dangerouslySetInnerHTML={{__html:sanitizeMathMl(b.value)}}/>
          :<p key={i}>{b.value}</p>
        )}
      </div>
    :
      <div className="sos-ai-legacy-text">
        {String(question??"").split(/\n+/).filter(Boolean).map((line,i)=><p key={i}>{line}</p>)}
      </div>
    }

    <footer>MATHPOOH SOS</footer>
  </section>;
}
