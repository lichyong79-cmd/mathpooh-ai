"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseConfig } from "@/lib/supabase";

type Rect = { x:number; y:number; w:number; h:number };
type Region = Rect & { number:number; page:number; answer:string; type:"choice"|"short"; verified:boolean; source:"auto"|"manual" };
type PdfJs = typeof import("pdfjs-dist");

function emptyRegions(count:number, objectiveCount=21):Region[]{
  return Array.from({length:count},(_,i)=>({number:i+1,page:1,x:0,y:0,w:0,h:0,answer:"",type:i<objectiveCount?"choice":"short",verified:false,source:"auto"}));
}

export default function PdfMapperPage(){
  const [examId,setExamId]=useState("");
  const [examCode,setExamCode]=useState("SOS");
  const [examPdfName,setExamPdfName]=useState("");
  const [pdfDoc,setPdfDoc]=useState<any>(null);
  const [page,setPage]=useState(1);
  const [pageCount,setPageCount]=useState(0);
  const [active,setActive]=useState(1);
  const [regions,setRegions]=useState<Region[]>([]);
  const [draft,setDraft]=useState<Rect|null>(null);
  const [preview,setPreview]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const overlayRef=useRef<HTMLDivElement>(null);
  const startRef=useRef<{x:number;y:number}|null>(null);
  const pdfjsRef=useRef<PdfJs|null>(null);

  const current=regions[active-1];
  const pageRegions=useMemo(()=>regions.filter(r=>r.page===page&&r.w>0),[regions,page]);
  const completed=regions.filter(r=>r.w>0&&r.h>0).length;
  const verified=regions.filter(r=>r.verified).length;

  useEffect(()=>{
    (async()=>{
      const params=new URLSearchParams(location.search);
      const id=params.get("exam")||"";
      const activeNo=Math.max(1,Number(params.get("active")||1));
      const auto=params.get("auto")==="1";
      setExamId(id); setActive(activeNo);
      const config=getSupabaseConfig();
      if(!config||!id){setLoading(false);return;}
      try{
        const h={apikey:config.key,Authorization:`Bearer ${config.key}`};
        const examRes=await fetch(`${config.url}/rest/v1/exams?id=eq.${encodeURIComponent(id)}&select=id,exam_code,test_file_name,test_file_path,question_count,objective_count`,{headers:h,cache:"no-store"});
        if(!examRes.ok) throw new Error(await examRes.text());
        const exam=(await examRes.json())[0];
        if(!exam?.test_file_path) throw new Error("등록된 시험지 PDF가 없습니다.");
        setExamCode(exam.exam_code||"SOS"); setExamPdfName(exam.test_file_name||"시험지.pdf");
        const url=`${config.url}/storage/v1/object/public/exam-files/${exam.test_file_path}`;
        const pdfRes=await fetch(url,{cache:"no-store"});
        if(!pdfRes.ok) throw new Error("등록 시험지를 불러오지 못했습니다.");
        const bytes=new Uint8Array(await pdfRes.arrayBuffer());
        const pdfjs=await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/build/pdf.worker.min.mjs",import.meta.url).toString();
        pdfjsRef.current=pdfjs;
        const doc=await pdfjs.getDocument({data:bytes}).promise;
        setPdfDoc(doc); setPageCount(doc.numPages);

        const regRes=await fetch(`${config.url}/rest/v1/question_regions?exam_id=eq.${encodeURIComponent(id)}&select=*&order=question_no.asc`,{headers:h,cache:"no-store"});
        const saved=regRes.ok?await regRes.json():[];
        if(saved.length){
          setRegions(saved.map((r:any)=>({number:r.question_no,page:r.page_no,x:Number(r.x),y:Number(r.y),w:Number(r.width),h:Number(r.height),answer:r.answer||"",type:r.question_type||"choice",verified:Boolean(r.verified),source:r.source||"manual"})));
        }else{
          const initial=emptyRegions(exam.question_count||30,exam.objective_count||21);
          setRegions(auto?makeAutoDraft(initial,doc.numPages):initial);
        }
      }catch(e){console.error(e);alert(e instanceof Error?e.message:"불러오기 실패");}
      finally{setLoading(false);}
    })();
  },[]);

  function makeAutoDraft(base:Region[], pages:number){
    const perPage=Math.ceil(base.length/pages);
    return base.map((r,i)=>{
      const pageIndex=Math.floor(i/perPage);
      const within=i%perPage;
      const cols=2;
      const rows=Math.ceil(perPage/cols);
      const col=within%cols;
      const row=Math.floor(within/cols);
      return {...r,page:Math.min(pages,pageIndex+1),x:col===0?4:51,y:5+row*(90/rows),w:45,h:(90/rows)-1.5,source:"auto"};
    });
  }

  useEffect(()=>{
    if(!pdfDoc||!canvasRef.current)return;
    let stop=false;
    (async()=>{
      const p=await pdfDoc.getPage(page);
      const base=p.getViewport({scale:1});
      const max=Math.min(1100,window.innerWidth-80);
      const viewport=p.getViewport({scale:Math.min(1.8,max/base.width)});
      const c=canvasRef.current!; const ctx=c.getContext("2d"); if(!ctx)return;
      c.width=Math.floor(viewport.width); c.height=Math.floor(viewport.height);
      c.style.width="100%"; c.style.height="auto";
      await p.render({canvasContext:ctx,viewport}).promise;
      if(!stop) crop(current);
    })();
    return()=>{stop=true};
  },[pdfDoc,page]);

  useEffect(()=>{ if(current?.page&&current.page!==page&&current.w>0)setPage(current.page); else crop(current); },[active,regions]);

  function point(e:PointerEvent<HTMLDivElement>){const r=overlayRef.current!.getBoundingClientRect();return{x:Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),y:Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100))};}
  function down(e:PointerEvent<HTMLDivElement>){startRef.current=point(e);setDraft({...startRef.current,w:0,h:0});e.currentTarget.setPointerCapture(e.pointerId);}
  function move(e:PointerEvent<HTMLDivElement>){if(!startRef.current)return;const p=point(e);setDraft({x:Math.min(startRef.current.x,p.x),y:Math.min(startRef.current.y,p.y),w:Math.abs(p.x-startRef.current.x),h:Math.abs(p.y-startRef.current.y)});}
  function up(){if(!draft||draft.w<2||draft.h<2){startRef.current=null;setDraft(null);return;}setRegions(prev=>prev.map(r=>r.number===active?{...r,...draft,page,verified:true,source:"manual"}:r));startRef.current=null;setDraft(null);}
  function crop(r?:Region){const c=canvasRef.current;if(!c||!r||r.w<=0||r.page!==page){setPreview("");return;}const sx=c.width*r.x/100,sy=c.height*r.y/100,sw=c.width*r.w/100,sh=c.height*r.h/100;const out=document.createElement("canvas");out.width=Math.max(1,sw);out.height=Math.max(1,sh);out.getContext("2d")?.drawImage(c,sx,sy,sw,sh,0,0,sw,sh);setPreview(out.toDataURL());}
  function patch(p:Partial<Region>){setRegions(prev=>prev.map(r=>r.number===active?{...r,...p}:r));}

  async function save(){
    const config=getSupabaseConfig(); if(!config||!examId)return alert("Supabase 연결을 확인해 주세요.");
    setSaving(true);
    try{
      const h={apikey:config.key,Authorization:`Bearer ${config.key}`,"Content-Type":"application/json"};
      await fetch(`${config.url}/rest/v1/question_regions?exam_id=eq.${encodeURIComponent(examId)}`,{method:"DELETE",headers:h});
      const body=regions.map(r=>({exam_id:examId,question_no:r.number,page_no:r.page,x:r.x,y:r.y,width:r.w,height:r.h,question_type:r.type,answer:r.answer,verified:r.verified,source:r.source}));
      const res=await fetch(`${config.url}/rest/v1/question_regions`,{method:"POST",headers:{...h,Prefer:"return=minimal"},body:JSON.stringify(body)});
      if(!res.ok)throw new Error(await res.text());
      alert("문항 영역을 Supabase에 저장했습니다.");
    }catch(e){alert(`저장 실패: ${e instanceof Error?e.message:"알 수 없는 오류"}`)}finally{setSaving(false)}
  }

  return <main className="mapper-shell">
    <header className="mapper-header"><div><span>SOS PDF MAPPER</span><h1>문항 영역 검수</h1><p>자동 초안을 확인하고 틀린 문항만 다시 드래그하세요.</p></div><div className="header-actions"><button onClick={()=>history.back()}>돌아가기</button><button className="primary" onClick={save} disabled={saving}>{saving?"저장 중...":"DB에 저장"}</button></div></header>
    <section className="meta-card"><b>{examCode}</b><span>{examPdfName||"시험지 불러오는 중"}</span><span>영역 {completed}/{regions.length}</span><span>검수 {verified}/{regions.length}</span></section>
    <div className="mapper-grid">
      <aside className="side-card"><div className="side-title"><h2>문항 번호</h2><b>{completed}/{regions.length}</b></div><div className="number-grid">{regions.map(r=><button key={r.number} className={`${active===r.number?"active":""} ${r.w>0?"done":""} ${r.verified?"verified":""}`} onClick={()=>setActive(r.number)}>{r.number}</button>)}</div>{current&&<div className="answer-editor"><h3>{active}번</h3><p>{current.source==="auto"?"자동 초안":"수동 보정"} · {current.verified?"검수 완료":"확인 필요"}</p><button className="verify" onClick={()=>patch({verified:!current.verified})}>{current.verified?"검수 취소":"이 영역 맞음"}</button><button className="clear" onClick={()=>patch({x:0,y:0,w:0,h:0,verified:false,source:"manual"})}>영역 다시 지정</button></div>}</aside>
      <section className="viewer-card"><div className="viewer-toolbar"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>이전</button><b>{pageCount?`${page}/${pageCount} 페이지`:"PDF 로딩"}</b><button disabled={!pageCount||page>=pageCount} onClick={()=>setPage(p=>p+1)}>다음</button><span>{active}번 확인 중</span></div><div className="canvas-wrap">{loading&&<div className="empty">등록 시험지를 불러오는 중입니다.</div>}<canvas ref={canvasRef}/>{pdfDoc&&<div ref={overlayRef} className="overlay" onPointerDown={down} onPointerMove={move} onPointerUp={up}>{pageRegions.map(r=><button key={r.number} className={`region ${r.number===active?"active":""} ${r.verified?"verified":""}`} style={{left:`${r.x}%`,top:`${r.y}%`,width:`${r.w}%`,height:`${r.h}%`}} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setActive(r.number)}}>{r.number}</button>)}{draft&&<div className="region draft" style={{left:`${draft.x}%`,top:`${draft.y}%`,width:`${draft.w}%`,height:`${draft.h}%`}}/>}</div>}</div></section>
      <aside className="preview-card"><h2>{active}번 미리보기</h2><p>번호를 누르면 해당 영역을 바로 확인합니다.</p><div className="preview-area">{preview?<img src={preview} alt="문항 미리보기"/>:<span>영역이 아직 없습니다.</span>}</div></aside>
    </div>
    <style jsx>{`*{box-sizing:border-box}.mapper-shell{min-height:100vh;background:#f4f6f9;padding:24px;font-family:Arial,"Pretendard",sans-serif}.mapper-header{max-width:1700px;margin:auto auto 16px;display:flex;justify-content:space-between;align-items:center;gap:18px}.mapper-header h1{margin:4px 0;font-size:30px}.mapper-header p{margin:0;color:#737b8c}.mapper-header span{font-size:12px;font-weight:900;color:#5268e8}.header-actions{display:flex;gap:8px}.header-actions button{height:44px;padding:0 18px;border:1px solid #d7dce7;border-radius:10px;background:#fff;font-weight:800}.header-actions .primary{background:#5268e8;color:#fff;border-color:#5268e8}.meta-card,.side-card,.viewer-card,.preview-card{background:#fff;border:1px solid #dfe4ee;border-radius:15px}.meta-card{max-width:1700px;margin:0 auto 16px;padding:16px 20px;display:grid;grid-template-columns:1fr 2fr 1fr 1fr;gap:14px}.mapper-grid{max-width:1700px;margin:auto;display:grid;grid-template-columns:250px minmax(0,1fr) 320px;gap:16px;align-items:start}.side-card,.preview-card{padding:16px;position:sticky;top:12px}.side-title{display:flex;justify-content:space-between}.number-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-top:14px}.number-grid button{height:38px;border:1px solid #dce1eb;border-radius:8px;background:#fff;font-weight:900}.number-grid button.done{background:#fff7e9}.number-grid button.verified{background:#eef8f4;border-color:#b9e2d2}.number-grid button.active{background:#5268e8;color:#fff}.answer-editor{border-top:1px solid #e9ecf2;margin-top:16px;padding-top:14px}.answer-editor p{color:#7b8496}.verify,.clear{width:100%;height:40px;border-radius:8px;font-weight:800;margin-top:8px}.verify{border:1px solid #b8dfcf;background:#eef8f4;color:#258664}.clear{border:1px solid #f0c7c7;background:#fff6f6;color:#b44}.viewer-card{overflow:hidden}.viewer-toolbar{height:54px;padding:0 14px;border-bottom:1px solid #e7eaf0;display:flex;align-items:center;gap:10px}.viewer-toolbar span{margin-left:auto;color:#5268e8;font-weight:900}.viewer-toolbar button{padding:7px 12px;border:1px solid #d8dde8;background:#fff;border-radius:8px}.canvas-wrap{position:relative;width:min(100%,1100px);margin:14px auto;background:#fff}.canvas-wrap canvas{display:block;width:100%;height:auto}.overlay{position:absolute;inset:0;cursor:crosshair;touch-action:none}.region{position:absolute;border:2px solid #e0a22f;background:rgba(255,190,65,.12);font-weight:900;text-align:left}.region.active{border-color:#e34d4d;background:rgba(227,77,77,.12)}.region.verified{border-color:#2c9a73;background:rgba(44,154,115,.1)}.region.draft{pointer-events:none;border-style:dashed}.empty{height:500px;display:grid;place-items:center;color:#7c8494}.preview-card h2{margin-top:0}.preview-card p{color:#7b8496}.preview-area{min-height:260px;border:1px dashed #ccd3df;border-radius:10px;display:grid;place-items:center;overflow:auto;background:#fafbfc}.preview-area img{max-width:100%}@media(max-width:1250px){.mapper-grid{grid-template-columns:220px minmax(0,1fr)}.preview-card{grid-column:1/-1;position:static}.meta-card{grid-template-columns:1fr 2fr}}@media(max-width:760px){.mapper-shell{padding:10px}.mapper-header{align-items:flex-start;flex-direction:column}.header-actions{width:100%}.header-actions button{flex:1}.meta-card,.mapper-grid{grid-template-columns:1fr}.side-card,.preview-card{position:static}.number-grid{grid-template-columns:repeat(6,1fr)}.viewer-toolbar span{display:none}}`}</style>
  </main>
}
