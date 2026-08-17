function esc(value:string){
  return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");
}

function normalize(value:unknown){
  return String(value??"")
    .replace(/\\times/g,"×").replace(/\\cdot/g,"·").replace(/\\leq?/g,"≤").replace(/\\geq?/g,"≥")
    .replace(/\\neq/g,"≠").replace(/\\pm/g,"±").replace(/\\sqrt\s*\{([^{}]+)\}/g,"√($1)")
    .replace(/\\left|\\right/g,"").replace(/\$+/g,"").replace(/\r/g,"")
    .trim();
}

function wrapLine(line:string,max=42){
  const src=line.trim();
  if(!src)return [""];
  const words=src.split(/\s+/);
  const rows:string[]=[];let row="";
  for(const word of words){
    if(word.length>max){
      if(row){rows.push(row);row="";}
      for(let i=0;i<word.length;i+=max)rows.push(word.slice(i,i+max));
      continue;
    }
    const next=row?`${row} ${word}`:word;
    if(next.length>max&&row){rows.push(row);row=word;}else row=next;
  }
  if(row)rows.push(row);
  return rows.length?rows:[src];
}

export function generatedQuestionImageDataUrl(question:unknown,options?:{topic?:unknown;kind?:unknown}){
  const text=normalize(question)||"AI 유사문항을 표시할 수 없습니다.";
  const paragraphs=text.split(/\n+/).flatMap(line=>wrapLine(line,44));
  const lineHeight=52;
  const headerHeight=82;
  const height=Math.max(330,Math.min(1250,headerHeight+80+paragraphs.length*lineHeight));
  const topic=esc(String(options?.topic??"AI 유사문항"));
  const kind=String(options?.kind??"")==="HOMEWORK"?"3제 굳히기":"2차 유사훈련";
  const tspans=paragraphs.map((line,i)=>`<tspan x="72" dy="${i===0?0:lineHeight}">${esc(line||" ")}</tspan>`).join("");
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">
    <rect width="1200" height="${height}" fill="#ffffff"/>
    <rect x="0" y="0" width="1200" height="8" fill="#236d45"/>
    <text x="72" y="52" font-family="Arial, Apple SD Gothic Neo, Noto Sans KR, sans-serif" font-size="22" font-weight="700" fill="#236d45">MATHPOOH · ${esc(kind)}</text>
    <text x="1128" y="52" text-anchor="end" font-family="Arial, Apple SD Gothic Neo, Noto Sans KR, sans-serif" font-size="18" fill="#748078">${topic}</text>
    <line x1="72" y1="76" x2="1128" y2="76" stroke="#dfe7e2" stroke-width="2"/>
    <text x="72" y="142" font-family="Arial, Apple SD Gothic Neo, Noto Sans KR, sans-serif" font-size="36" font-weight="600" fill="#141a16">${tspans}</text>
    <text x="1128" y="${height-34}" text-anchor="end" font-family="Arial, Apple SD Gothic Neo, Noto Sans KR, sans-serif" font-size="15" fill="#a0aaa4">MATHPOOH SOS</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg,"utf8").toString("base64")}`;
}
