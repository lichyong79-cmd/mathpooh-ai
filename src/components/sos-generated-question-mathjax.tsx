"use client";

import {useEffect,useMemo,useState} from "react";

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

/**
 * SOS270 · 조판 문자열 정규화
 *
 * AI가 보내오는 displayLatex에는 실제로 아래가 섞여 들어온다.
 *  1) $ ... $ / $$ ... $$  → MathJax 설정에 없어서 raw 텍스트로 노출되던 원인
 *  2) \\( ... \\)          → JSON 이중 이스케이프가 남은 경우
 *  3) 선택지 1~5가 줄바꿈 없이 한 줄에 붙어 오는 경우
 * 서버에서도 같은 규칙으로 저장하지만, 이미 저장된 과거 문항을 위해 화면에서도 한 번 더 정리한다.
 */
export function normalizeDisplayLatex(raw:any){
  let s=String(raw??"");
  if(!s.trim())return "";
  s=s.replace(/\r\n?/g,"\n");

  // 이중 이스케이프( \\( , \\[ )를 표준 구분자로 되돌린다.
  s=s.replace(/\\\\([()[\]])/g,"\\$1");

  // $$ ... $$ -> \[ ... \]
  s=s.replace(/\$\$([\s\S]+?)\$\$/g,(_m,inner)=>"\\["+inner+"\\]");
  // $ ... $ -> \( ... \)   (이스케이프된 \$ 는 건드리지 않는다)
  s=s.replace(/(^|[^\\$])\$([^$\n]+?)\$/g,(_m,head,inner)=>head+"\\("+inner+"\\)");

  // 선택지는 언제나 새 줄에서 시작하게 만든다.
  s=s.replace(/([^\n])[ \t]*(?=[\u2460\u2461\u2462\u2463\u2464])/g,"$1\n");

  // 빈 줄 3개 이상은 2개로 줄인다.
  s=s.replace(/\n{3,}/g,"\n\n");

  return s.trim();
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
      // 정규화를 거치지만, 남아 있는 $$ 표기도 마지막 안전망으로 받아준다.
      inlineMath:[["\\(","\\)"]],
      displayMath:[["\\[","\\]"],["$$","$$"]],
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
  const latex=useMemo(()=>normalizeDisplayLatex(displayLatex),[displayLatex]);
  const blocks=useMemo(()=>legacyBlocks(renderBlocks),[renderBlocks]);

  // ref 대신 state로 DOM을 받는다. ref가 아직 비어 있어서 조판이 통째로
  // 건너뛰어지고 "조판 중..."에서 멈추던 경로를 없앤다.
  const [node,setNode]=useState<HTMLDivElement|null>(null);
  const [ready,setReady]=useState(!latex);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!latex){setReady(true);setError("");return;}
    if(!node)return;

    let dead=false;
    setReady(false);setError("");
    node.textContent=latex;

    // CDN이 느리거나 막혀도 12초 뒤에는 원문이라도 보여준다. 영원히 대기하지 않는다.
    const guard=window.setTimeout(()=>{
      if(dead)return;
      setError("수식 조판이 지연되어 원문을 그대로 표시합니다.");
      setReady(true);
    },12000);

    loadMathJax()
      .then(async(MathJax)=>{
        if(dead)return;
        try{
          if(typeof MathJax.typesetClear==="function")MathJax.typesetClear([node]);
          await MathJax.typesetPromise([node]);
          if(!dead){setError("");setReady(true);}
        }catch(e){
          if(!dead){setError(e instanceof Error?e.message:"수식 조판 실패");setReady(true);}
        }
      })
      .catch(e=>{
        if(!dead){setError(e instanceof Error?e.message:"MathJax 로드 실패");setReady(true);}
      })
      .finally(()=>{window.clearTimeout(guard);});

    return()=>{dead=true;window.clearTimeout(guard);};
  },[latex,node]);

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
        <div ref={setNode} className="sos-ai-latex-body"/>
        {error?<div className="sos-ai-typeset-warning">{error}</div>:null}
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
