function esc(value:string){
  return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");
}

function clean(value:unknown){
  return String(value??"")
    .replace(/\\left|\\right/g,"")
    .replace(/\\times/g,"×").replace(/\\cdot/g,"·")
    .replace(/\\leq?/g,"≤").replace(/\\geq?/g,"≥").replace(/\\neq/g,"≠")
    .replace(/\\pm/g,"±").replace(/\\to/g,"→").replace(/\\infty/g,"∞")
    .replace(/\\sqrt\s*\{([^{}]+)\}/g,"√($1)")
    .replace(/\$+/g,"").replace(/\r/g,"").trim();
}

function htmlMath(value:string){
  let s=esc(clean(value));
  // AI가 남긴 LaTeX식 위첨자/아래첨자를 실제 시각적 첨자로 렌더링한다.
  s=s.replace(/\^\{([^{}]+)\}/g,"<sup>$1</sup>")
     .replace(/_\{([^{}]+)\}/g,"<sub>$1</sub>")
     .replace(/\^([A-Za-z0-9+\-]+)/g,"<sup>$1</sup>")
     .replace(/_([A-Za-z0-9+\-]+)/g,"<sub>$1</sub>");
  // 단순 frac는 시험지에서 읽기 쉬운 분수 슬래시로 변환. 중첩 frac는 원문 보존.
  s=s.replace(/\\(?:d?frac|tfrac)\{([^{}]+)\}\{([^{}]+)\}/g,"<span class=\"frac\"><span>$1</span><span>$2</span></span>");
  s=s.replace(/\\lim/g,"lim ");
  s=s.replace(/\\[A-Za-z]+/g,"");
  s=s.replace(/\{([^{}]+)\}/g,"$1");
  return s;
}

function lines(value:string){
  const raw=value.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const out:string[]=[];
  for(const line of raw){
    if(line.length<=48){out.push(line);continue;}
    const words=line.split(/\s+/);let row="";
    for(const word of words){
      const next=row?`${row} ${word}`:word;
      if(next.length>48&&row){out.push(row);row=word;}else row=next;
    }
    if(row)out.push(row);
  }
  return out.length?out:[value];
}

export function generatedQuestionImageDataUrl(question:unknown,options?:{topic?:unknown;kind?:unknown}){
  const source=clean(question)||"AI 유사문항을 표시할 수 없습니다.";
  const rows=lines(source);
  const kind=String(options?.kind??"")==="HOMEWORK"?"3제 굳히기":"2차 유사훈련";
  const topic=esc(String(options?.topic??"AI 유사문항"));
  const body=rows.map((line,i)=>`<div class="line ${i===0?"first":""}">${htmlMath(line)}</div>`).join("");
  const height=Math.max(360,Math.min(1300,190+rows.length*64));
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">
    <rect width="1200" height="${height}" fill="#fff"/>
    <rect width="1200" height="8" fill="#236d45"/>
    <foreignObject x="0" y="0" width="1200" height="${height}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:1200px;height:${height}px;padding:34px 68px 40px;font-family:Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#101713;background:#fff;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #dce7e0;padding-bottom:18px;margin-bottom:34px;">
          <b style="font-size:22px;color:#236d45;letter-spacing:.03em;">MATHPOOH · ${esc(kind)}</b>
          <span style="font-size:17px;color:#748078;">${topic}</span>
        </div>
        <div class="question">${body}</div>
        <div style="position:absolute;right:68px;bottom:26px;font-size:14px;color:#a0aaa4;">MATHPOOH SOS</div>
        <style>
          .question{font-size:34px;font-weight:600;line-height:1.68;letter-spacing:-.015em;}
          .line{min-height:54px;white-space:normal;overflow-wrap:anywhere;}
          sup{font-size:.68em;vertical-align:super;line-height:0;font-weight:600;}
          sub{font-size:.68em;vertical-align:sub;line-height:0;font-weight:600;}
          .frac{display:inline-flex;vertical-align:middle;flex-direction:column;text-align:center;font-size:.9em;line-height:1.05;margin:0 .12em;}
          .frac>span:first-child{border-bottom:1.7px solid #111;padding:0 .18em .08em;}
          .frac>span:last-child{padding:.08em .18em 0;}
        </style>
      </div>
    </foreignObject>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg,"utf8").toString("base64")}`;
}
