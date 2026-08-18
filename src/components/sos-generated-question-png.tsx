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


function stripOuterGroup(v:string){
  let s=v.trim();
  if((s.startsWith("{")&&s.endsWith("}"))||(s.startsWith("(")&&s.endsWith(")"))){
    let depth=0,ok=true;
    for(let i=0;i<s.length;i++){
      if(s[i]==="{"||s[i]==="(")depth++;
      if(s[i]==="}"||s[i]===")")depth--;
      if(depth===0&&i<s.length-1){ok=false;break;}
    }
    if(ok)s=s.slice(1,-1).trim();
  }
  return s;
}

function topLevelSlash(expr:string){
  let par=0,brace=0,bracket=0;
  for(let i=0;i<expr.length;i++){
    const c=expr[i];
    if(c==="(")par++; else if(c===")")par=Math.max(0,par-1);
    else if(c==="{")brace++; else if(c==="}")brace=Math.max(0,brace-1);
    else if(c==="[")bracket++; else if(c==="]")bracket=Math.max(0,bracket-1);
    else if(c==="/"&&par===0&&brace===0&&bracket===0)return i;
  }
  return -1;
}

function structuredExprMathMl(expr:string):string{
  let s=stripOuterGroup(String(expr??"").trim());
  if(!s)return "";

  // 최상위 분수는 slash 문자가 아니라 반드시 mfrac로 변환.
  const slash=topLevelSlash(s);
  if(slash>0&&slash<s.length-1){
    const numerator=s.slice(0,slash).trim();
    const denominator=s.slice(slash+1).trim();
    return `<mfrac><mrow>${structuredExprMathMl(numerator)}</mrow><mrow>${structuredExprMathMl(denominator)}</mrow></mfrac>`;
  }

  // sqrt(...)
  const sqrt=s.match(/^√\s*\(([\s\S]+)\)$/);
  if(sqrt)return `<msqrt><mrow>${structuredExprMathMl(sqrt[1])}</mrow></msqrt>`;

  // function-like f(x)
  const fn=s.match(/^([A-Za-z]+)\(([\s\S]*)\)$/);
  if(fn)return `<mrow><mi>${esc(fn[1])}</mi><mo>(</mo>${structuredExprMathMl(fn[2])}<mo>)</mo></mrow>`;

  // Delegate ordinary tokens/superscripts/subscripts.
  return inlineSimple(s);
}

function conditionMathMl(condition:string){
  const s=condition.trim()
    .replace(/!=/g,"≠").replace(/<=/g,"≤").replace(/>=/g,"≥");
  return structuredExprMathMl(s);
}

function piecewiseBlockFromQuestion(question:string):RenderBlock|null{
  const q=String(question??"")
    .replace(/\r/g," ")
    .replace(/[ \t]+/g," ")
    .replace(/\n+/g," ")
    .trim();

  // f(x) = { first (x≠0) { second (x=0) 같은 기존 생성문항 복구.
  const head=q.match(/([A-Za-z]+)\(([^)]*)\)\s*=\s*\{/);
  if(!head)return null;
  const fnName=head[1],fnArg=head[2];
  const rest=q.slice((head.index??0)+head[0].length);

  const c1=rest.match(/\(\s*([^()]*(?:≠|!=)[^()]*)\s*\)/);
  const c2=rest.match(/\(\s*([^()]*(?:=)[^()]*)\s*\)(?![\s\S]*\(\s*[^()]*(?:=|≠|!=)[^()]*\s*\))/);
  if(!c1||!c2)return null;

  const firstEnd=c1.index??-1;
  if(firstEnd<=0)return null;
  let firstExpr=rest.slice(0,firstEnd).replace(/^[{;,:\s]+|[{;,:\s]+$/g,"").trim();

  const after1=(c1.index??0)+c1[0].length;
  const between=rest.slice(after1,c2.index??rest.length);
  let secondExpr=between.replace(/^[{;,:\s]+|[{;,:\s]+$/g,"").trim();
  if(!secondExpr){
    // 흔한 "{ 0 (x=0)" 형태.
    const m=rest.slice(after1).match(/^[\s{;,]*(.*?)(?=\(\s*[^()]*=\s*[^()]*\))/);
    secondExpr=String(m?.[1]??"").replace(/^[{;,:\s]+|[{;,:\s]+$/g,"").trim();
  }
  if(!firstExpr||!secondExpr)return null;

  const math=`<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
    <mrow>
      <mi>${esc(fnName)}</mi><mo>(</mo>${structuredExprMathMl(fnArg)}<mo>)</mo><mo>=</mo>
      <mo fence="true" stretchy="true">{</mo>
      <mtable columnalign="left left" columnspacing="1.2em" rowspacing="0.45em">
        <mtr><mtd><mrow>${structuredExprMathMl(firstExpr)}</mrow></mtd><mtd><mrow><mo>(</mo>${conditionMathMl(c1[1])}<mo>)</mo></mrow></mtd></mtr>
        <mtr><mtd><mrow>${structuredExprMathMl(secondExpr)}</mrow></mtd><mtd><mrow><mo>(</mo>${conditionMathMl(c2[1])}<mo>)</mo></mrow></mtd></mtr>
      </mtable>
    </mrow>
  </math>`;

  // piecewise 정의식 앞/뒤의 한국어 문장도 살린다.
  const before=q.slice(0,head.index??0).trim();
  const tailStart=(c2.index??0)+c2[0].length;
  const tail=rest.slice(tailStart).replace(/^[,.;:\s]+/,"").trim();
  const blocks:RenderBlock[]=[];
  if(before)blocks.push({type:"text",value:before});
  blocks.push({type:"mathml",value:math});
  if(tail)blocks.push({type:"text",value:tail});
  return blocks.length?blocks:null;
}

function hasBadMathStructure(raw:any,question:string){
  if(!Array.isArray(raw))return true;
  const maths=raw.filter((b:any)=>String(b?.type)==="mathml").map((b:any)=>String(b?.value??""));
  if(!maths.length)return true;
  const joined=maths.join(" ");
  // slash가 수학 연산자로 남으면 실제 분수 조판이 아니므로 재구성.
  if(/<mo[^>]*>\s*\/\s*<\/mo>/i.test(joined)||/<mtext[^>]*>\s*\/\s*<\/mtext>/i.test(joined))return true;
  // 조각함수처럼 보이는데 mtable이 없으면 잘못된 구조.
  const piecewise=/=\s*\{/.test(question)&&/\([^)]*(?:≠|!=)[^)]*\)/.test(question)&&/\([^)]*=[^)]*\)/.test(question);
  if(piecewise&&!/<mtable[\s>]/i.test(joined))return true;
  return false;
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
  const piecewise=piecewiseBlockFromQuestion(question);

  if(Array.isArray(raw)&&!hasBadMathStructure(raw,question)){
    const arr=raw.map((b:any)=>({
      type:String(b?.type)==="mathml"?"mathml":"text",
      value:String(b?.value??"").trim()
    })).filter((b:any)=>b.value) as RenderBlock[];
    if(arr.some(b=>b.type==="mathml"&&safeMathMl(b.value)))return arr;
  }

  // SOS262: 이미 DB에 저장된 잘못된 조각함수/분수 MathML도 즉시 복구.
  if(piecewise)return piecewise;

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
