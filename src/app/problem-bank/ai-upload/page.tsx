"use client";

import { ChangeEvent, FormEvent, PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type SourceFile={id:string;created_at:string;title:string;source:string|null;grade:string|null;subject:string|null;original_hwp_name:string|null;exam_pdf_name:string|null;solution_pdf_name:string|null;status:string;error_message:string|null};
type Analysis={id:string;status:string;progress:number;current_step:string}|null;
type Meta={question_type:string;subject:string|null;unit:string|null;topic:string|null;difficulty:string;summary:string|null};
type Question={id:string;analysis_id:string;question_no:number;answer:string|null;status:string;confidence:number|null;page_no:number|null;crop_x:number|null;crop_y:number|null;crop_width:number|null;crop_height:number|null;ai_result:Partial<Meta>;review_result:Partial<Meta>};
type Workspace={source:SourceFile;analysis:Analysis;questions:Question[];examUrl:string|null;solutionUrl:string|null};
type Rect={x:number;y:number;w:number;h:number};
type Drag={mode:"move"|"resize";id:string;startX:number;startY:number;origin:Rect};

const statusLabel:Record<string,string>={uploaded:"업로드 완료",RUNNING:"AI 분석 중",REVIEW:"검수 중",DONE:"등록 완료",FAILED:"실패",completed:"분석 완료"};
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
const metaOf=(q:Question):Meta=>({question_type:String(q.review_result?.question_type||q.ai_result?.question_type||"unknown"),subject:(q.review_result?.subject??q.ai_result?.subject??null) as string|null,unit:(q.review_result?.unit??q.ai_result?.unit??null) as string|null,topic:(q.review_result?.topic??q.ai_result?.topic??null) as string|null,difficulty:String(q.review_result?.difficulty||q.ai_result?.difficulty||"중"),summary:(q.review_result?.summary??q.ai_result?.summary??null) as string|null});

export default function AiWorkspace(){
 const router=useRouter();
 const supabase=useMemo(()=>createClient(),[]); const canvasRef=useRef<HTMLCanvasElement>(null); const overlayRef=useRef<HTMLDivElement>(null); const pdfRef=useRef<any>(null); const dragRef=useRef<Drag|null>(null); const saveTimers=useRef<Record<string,ReturnType<typeof setTimeout>>>({});
 const [items,setItems]=useState<SourceFile[]>([]); const [selectedId,setSelectedId]=useState(""); const [workspace,setWorkspace]=useState<Workspace|null>(null); const [activeId,setActiveId]=useState(""); const [page,setPage]=useState(1); const [pageCount,setPageCount]=useState(0); const [scale,setScale]=useState(1.25);
 const [title,setTitle]=useState(""); const [source,setSource]=useState(""); const [grade,setGrade]=useState("고1"); const [subject,setSubject]=useState("공통수학1"); const [files,setFiles]=useState<{hwp:File|null;exam:File|null;solution:File|null}>({hwp:null,exam:null,solution:null});
 const [busy,setBusy]=useState(""); const [message,setMessage]=useState(""); const [error,setError]=useState(""); const [saveState,setSaveState]=useState("저장됨");
 const questions=workspace?.questions??[]; const active=questions.find(q=>q.id===activeId)||questions[0]; const pageQuestions=questions.filter(q=>Number(q.page_no||1)===page&&Number(q.crop_width||0)>0&&q.status!=="REJECTED");

 const loadList=useCallback(async()=>{const {data,error: listError}=await supabase.from("source_files").select("id,created_at,title,source,grade,subject,original_hwp_name,exam_pdf_name,solution_pdf_name,status,error_message").order("created_at",{ascending:false}); if(listError)setError(listError.message); else setItems((data??[]) as SourceFile[]);},[supabase]);
 useEffect(()=>{void loadList();},[loadList]);

 const loadWorkspace=useCallback(async(id:string)=>{setBusy("load");setError("");try{const r=await fetch(`/api/analysis/source/${id}`,{cache:"no-store"});const p=await r.json();if(!r.ok||!p.success)throw new Error(p.message||"작업장 로딩 실패");setWorkspace(p);setSelectedId(id);setActiveId(p.questions?.[0]?.id||"");setPage(Number(p.questions?.[0]?.page_no||1));
 const rawUrl=typeof p.examUrl==="string"?p.examUrl:(typeof p.examUrl?.signedUrl==="string"?p.examUrl.signedUrl:"");
 if(rawUrl){const pdfjs=await import("pdfjs-dist");pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/build/pdf.worker.min.mjs",import.meta.url).toString();const pdfResponse=await fetch(rawUrl,{cache:"no-store"});if(!pdfResponse.ok)throw new Error(`시험지 PDF 불러오기 실패 (${pdfResponse.status})`);const bytes=new Uint8Array(await pdfResponse.arrayBuffer());if(!bytes.length)throw new Error("시험지 PDF 파일이 비어 있습니다.");if(pdfRef.current?.destroy)await pdfRef.current.destroy();const doc=await pdfjs.getDocument({data:bytes}).promise;pdfRef.current=doc;setPageCount(doc.numPages);}else{if(pdfRef.current?.destroy)await pdfRef.current.destroy();pdfRef.current=null;setPageCount(0);throw new Error("시험지 PDF 주소를 불러오지 못했습니다. 시험지 PDF를 다시 업로드해 주세요.");}}catch(e){setError(e instanceof Error?e.message:"로딩 실패");}finally{setBusy("");}},[]);
 useEffect(()=>{if(selectedId||items.length===0)return;const saved=window.localStorage.getItem("matspu-analysis-source-id");const target=saved&&items.some(item=>item.id===saved)?saved:items[0].id;if(saved)window.localStorage.removeItem("matspu-analysis-source-id");void loadWorkspace(target);},[items,selectedId,loadWorkspace]);

 useEffect(()=>{(async()=>{if(!pdfRef.current||!canvasRef.current)return;const pg=await pdfRef.current.getPage(page);const viewport=pg.getViewport({scale});const canvas=canvasRef.current;const ctx=canvas.getContext("2d");if(!ctx)return;canvas.width=viewport.width;canvas.height=viewport.height;await pg.render({canvas,canvasContext:ctx,viewport}).promise;})().catch(e=>setError(String(e)));},[page,scale,workspace?.examUrl]);

 function choose(kind:"hwp"|"exam"|"solution",e:ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0]||null;if(f&&f.size>50*1024*1024){setError("파일은 각각 50MB 이하여야 합니다.");e.target.value="";return;}setFiles(v=>({...v,[kind]:f}));if(kind==="exam"&&f&&!title)setTitle(f.name.replace(/\.pdf$/i,""));}
 async function upload(e:FormEvent){e.preventDefault();if(!title.trim()||!files.hwp||!files.exam||!files.solution){setError("원본, 시험지 PDF, 해설지 PDF와 시험지명을 모두 입력하세요.");return;}setBusy("upload");setError("");try{const f=new FormData();f.append("title",title.trim());f.append("source",source.trim());f.append("grade",grade);f.append("subject",subject);f.append("hwpFile",files.hwp);f.append("examPdf",files.exam);f.append("solutionPdf",files.solution);const r=await fetch("/api/source-files/upload",{method:"POST",body:f});const p=await r.json();if(!r.ok||!p.success)throw new Error(p.message);setMessage("업로드 완료");setTitle("");setSource("");setFiles({hwp:null,exam:null,solution:null});await loadList();await loadWorkspace(p.data.id);}catch(e){setError(e instanceof Error?e.message:"업로드 실패");}finally{setBusy("");}}
 async function materializeAll(sourceFileId:string){
  setSaveState("문항 이미지 자르는 중...");
  const preparedResponse=await fetch("/api/problem-bank/materialize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceFileId})});
  const prepared=await preparedResponse.json();
  if(!preparedResponse.ok||!prepared.success)throw new Error(prepared.message||"문항 이미지 준비 실패");
  const pdfjs=await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/build/pdf.worker.min.mjs",import.meta.url).toString();
  const pdfResponse=await fetch(prepared.pdfUrl,{cache:"no-store"});
  if(!pdfResponse.ok)throw new Error(`시험지 PDF 불러오기 실패 (${pdfResponse.status})`);
  const bytes=new Uint8Array(await pdfResponse.arrayBuffer());
  const doc=await pdfjs.getDocument({data:bytes}).promise;
  const pageCache=new Map<number,{canvas:HTMLCanvasElement;width:number;height:number}>();
  let completed=0;
  for(const q of prepared.questions as Question[]){
   const pageNo=Number(q.page_no||0),x=Number(q.crop_x||0),y=Number(q.crop_y||0),w=Number(q.crop_width||0),h=Number(q.crop_height||0);
   if(pageNo<1||w<=0||h<=0)continue;
   let cached=pageCache.get(pageNo);
   if(!cached){
    const pg=await doc.getPage(pageNo);const viewport=pg.getViewport({scale:2});const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext("2d");if(!ctx)throw new Error("문항 이미지 캔버스를 만들 수 없습니다.");await pg.render({canvas,canvasContext:ctx,viewport}).promise;cached={canvas,width:canvas.width,height:canvas.height};pageCache.set(pageNo,cached);
   }
   const sx=Math.max(0,Math.floor(cached.width*x/100)),sy=Math.max(0,Math.floor(cached.height*y/100));
   const sw=Math.max(1,Math.min(cached.width-sx,Math.ceil(cached.width*w/100))),sh=Math.max(1,Math.min(cached.height-sy,Math.ceil(cached.height*h/100)));
   const crop=document.createElement("canvas");crop.width=sw;crop.height=sh;const cropCtx=crop.getContext("2d");if(!cropCtx)throw new Error("문항 자르기 캔버스를 만들 수 없습니다.");cropCtx.drawImage(cached.canvas,sx,sy,sw,sh,0,0,sw,sh);
   const blob=await new Promise<Blob>((resolve,reject)=>crop.toBlob(value=>value?resolve(value):reject(new Error("문항 이미지 변환 실패")),"image/webp",.92));
   const form=new FormData();form.append("image",blob,`${q.question_no}.webp`);form.append("analysisId",prepared.analysisId);form.append("sourceFileId",prepared.sourceFileId);form.append("questionId",q.id);form.append("questionNo",String(q.question_no));form.append("pageNo",String(pageNo));form.append("cropX",String(x));form.append("cropY",String(y));form.append("cropWidth",String(w));form.append("cropHeight",String(h));
   const uploadResponse=await fetch("/api/problem-bank/materialize",{method:"POST",body:form});const uploadResult=await uploadResponse.json();if(!uploadResponse.ok||!uploadResult.success)throw new Error(uploadResult.message||`${q.question_no}번 이미지 저장 실패`);
   completed+=1;setSaveState(`문항 이미지 생성 ${completed}/${prepared.questions.length}`);
  }
  doc.cleanup();setSaveState(`문항 이미지 ${completed}개 생성 완료`);return completed;
 }
 type PdfAnchor={questionNo:number;pageNo:number;column:"left"|"right";x:number;y:number};
 function questionColumn(q:Question):"left"|"right"|"full"{const x=Number(q.crop_x||0),w=Number(q.crop_width||0);if(w>70)return "full";return x<48?"left":"right";}
 function stableColumnRect(column:"left"|"right"|"full"){if(column==="left")return{x:4,width:45.2};if(column==="right")return{x:50.8,width:45.2};return{x:4,width:92};}
 function parseQuestionNo(text:string){const normalized=text.trim().replace(/^[\[({]\s*/,"");const match=normalized.match(/^(\d{1,3})\s*[.)]\s*/);if(!match)return null;const n=Number(match[1]);return n>=1&&n<=200?n:null;}
 async function patchCrop(question:Question,patch:Partial<Question>){const r=await fetch(`/api/analysis/questions/${question.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)});const p=await r.json();if(!r.ok||!p.success)throw new Error(p.message||`${question.question_no}번 좌표 저장 실패`);return p.question as Question;}
 function findQuestionBottom(canvas:HTMLCanvasElement,xPct:number,widthPct:number,topPct:number,bottomPct:number){
  const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)return null;
  const inset=Math.max(10,Math.round(canvas.width*.014));
  const x0=clamp(Math.floor(canvas.width*xPct/100)+inset,0,canvas.width-1),x1=clamp(Math.ceil(canvas.width*(xPct+widthPct)/100)-inset,x0+1,canvas.width);
  const y0=clamp(Math.floor(canvas.height*topPct/100),0,canvas.height-1),y1=clamp(Math.ceil(canvas.height*bottomPct/100),y0+1,canvas.height);
  const image=ctx.getImageData(x0,y0,x1-x0,y1-y0),data=image.data,rowWidth=x1-x0;
  const minInk=Math.max(3,Math.floor(rowWidth*.0035));
  const maxLineInk=Math.floor(rowWidth*.72); // 굵은 제목선/구분선은 본문으로 세지 않음
  const active:number[]=[];
  for(let y=0;y<y1-y0;y++){
   let ink=0;const row=y*rowWidth*4;
   for(let x=0;x<rowWidth;x+=1){const i=row+x*4;const lum=data[i]*.299+data[i+1]*.587+data[i+2]*.114;if(data[i+3]>20&&lum<190)ink++;}
   if(ink>=minInk&&ink<maxLineInk)active.push(y);
  }
  if(!active.length)return null;

  // 문항 내부의 줄 간격은 이어 붙이고, 큰 공백 뒤의 꼬리말/다음 영역은 버린다.
  const maxGap=Math.max(22,Math.round(canvas.height*.026));
  let last=active[0];
  for(let i=1;i<active.length;i++){
   if(active[i]-active[i-1]>maxGap)break;
   last=active[i];
  }
  return (y0+last)/canvas.height*100;
 }
 async function refineQuestionCrops(sourceFileId:string){
  setSaveState("PDF 텍스트 좌표 읽는 중...");
  const workspaceResponse=await fetch(`/api/analysis/source/${sourceFileId}`,{cache:"no-store"});const fresh=await workspaceResponse.json();if(!workspaceResponse.ok||!fresh.success)throw new Error(fresh.message||"문항 좌표 불러오기 실패");
  const freshQuestions=(fresh.questions||[]) as Question[];if(!freshQuestions.length)return{updated:0,anchorCount:0};
  const rawUrl=typeof fresh.examUrl==="string"?fresh.examUrl:(typeof fresh.examUrl?.signedUrl==="string"?fresh.examUrl.signedUrl:"");if(!rawUrl)throw new Error("시험지 PDF 주소가 없습니다.");
  const pdfjs=await import("pdfjs-dist");pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/build/pdf.worker.min.mjs",import.meta.url).toString();
  const pdfResponse=await fetch(rawUrl,{cache:"no-store"});if(!pdfResponse.ok)throw new Error(`시험지 PDF 불러오기 실패 (${pdfResponse.status})`);const bytes=new Uint8Array(await pdfResponse.arrayBuffer());const doc=await pdfjs.getDocument({data:bytes}).promise;
  const anchors:PdfAnchor[]=[];const canvases=new Map<number,HTMLCanvasElement>();
  for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
   setSaveState(`PDF OCR 좌표 분석 ${pageNo}/${doc.numPages}`);const pg=await doc.getPage(pageNo);const viewport=pg.getViewport({scale:2});
   const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext("2d");if(!ctx)throw new Error("PDF 분석 캔버스를 만들 수 없습니다.");await pg.render({canvas,canvasContext:ctx,viewport}).promise;canvases.set(pageNo,canvas);
   const text=await pg.getTextContent();
   for(const raw of text.items as any[]){if(typeof raw?.str!=="string")continue;const questionNo=parseQuestionNo(raw.str);if(!questionNo)continue;const tx=Number(raw.transform?.[4]??0),ty=Number(raw.transform?.[5]??0);const [vx,vy]=viewport.convertToViewportPoint(tx,ty);const itemHeight=Math.max(8,Math.abs(Number(raw.height||10))*2);const x=vx/viewport.width*100,y=(vy-itemHeight)/viewport.height*100;
    const column=x<45?"left":x>48?"right":null;if(!column)continue;const inStartBand=column==="left"?(x>=4&&x<=22):(x>=50&&x<=70);if(!inStartBand)continue;anchors.push({questionNo,pageNo,column,x,y:clamp(y,0,99)});
   }
  }
  const starts=new Map<string,number>();const columns=new Map<string,"left"|"right"|"full">();let anchorCount=0;
  for(const q of freshQuestions){
   const currentY=Number(q.crop_y||0),currentColumn=questionColumn(q);
   const candidates=anchors.filter(a=>a.questionNo===Number(q.question_no)&&a.pageNo===Number(q.page_no||1));
   if(candidates.length){
    // 기존 박스의 열이 틀려도 PDF 문항번호 자체의 열을 최종 기준으로 사용한다. (7·8, 19·20 분리)
    candidates.sort((a,b)=>Math.abs(a.y-currentY)-Math.abs(b.y-currentY));
    starts.set(q.id,candidates[0].y);columns.set(q.id,candidates[0].column);anchorCount++;
   }else{
    starts.set(q.id,currentY);columns.set(q.id,currentColumn);
   }
  }
  const sorted=[...freshQuestions].sort((a,b)=>Number(a.page_no||1)-Number(b.page_no||1)||(starts.get(a.id)||0)-(starts.get(b.id)||0));const updated:Question[]=[];
  for(let index=0;index<sorted.length;index++){
   const q=sorted[index],pageNo=Number(q.page_no||1),column=columns.get(q.id)??questionColumn(q);
   // 문항번호 바로 위 0.45%만 남긴다. 제목/문항분류가 붙는 기존 1.1% 여백은 제거한다.
   const start=clamp((starts.get(q.id)??Number(q.crop_y||0))-.45,0,96);
   const rect=stableColumnRect(column);
   const next=sorted.find((candidate,i)=>i>index&&Number(candidate.page_no||1)===pageNo&&(columns.get(candidate.id)??questionColumn(candidate))===column&&(starts.get(candidate.id)??0)>start+1);
   // 같은 열의 다음 문항번호가 가장 강한 하단 경계다. 마지막 문항도 꼬리말 영역(95% 이후)은 탐색하지 않는다.
   const hardBottom=next?clamp((starts.get(next.id)??95)-.35,start+3.2,95):95;
   const canvas=canvases.get(pageNo);const contentBottom=canvas?findQuestionBottom(canvas,rect.x,rect.width,start,hardBottom):null;
   const bottom=clamp(contentBottom==null?hardBottom:contentBottom+.65,start+3.2,hardBottom);
   const patch={crop_x:rect.x,crop_y:start,crop_width:rect.width,crop_height:bottom-start};updated.push(await patchCrop(q,patch));setSaveState(`실제 문항영역 보정 ${updated.length}/${sorted.length}`);
  }
  doc.cleanup();setWorkspace((w)=>w?{...w,questions:updated.sort((a,b)=>a.question_no-b.question_no)}:w);setSaveState(`PDF 좌표 ${anchorCount}개 · 문항영역 ${updated.length}개 보정 완료`);return{updated:updated.length,anchorCount};
 }
 async function analyze(){if(!workspace)return;setBusy("analyze");setError("");setMessage("");try{const sourceFileId=workspace.source.id;const r=await fetch("/api/analysis/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceFileId})});const p=await r.json();if(!r.ok||!p.success)throw new Error(p.message);const refined=await refineQuestionCrops(sourceFileId);const cropped=await materializeAll(sourceFileId);setMessage(`분석 완료 · ${p.questionCount}문항 · PDF 문항번호 ${refined.anchorCount}개 확인 · 실제영역 ${refined.updated}개 보정 · 이미지 ${cropped}개 생성`);await loadWorkspace(sourceFileId);await loadList();}catch(e){setError(e instanceof Error?e.message:"AI 분석 실패");}finally{setBusy("");}}

 function localPatch(id:string,patch:Partial<Question>){setWorkspace(w=>w?{...w,questions:w.questions.map(q=>q.id===id?{...q,...patch}:q)}:w);}
 function scheduleSave(q:Question,patch:Record<string,unknown>){setSaveState("저장 중...");clearTimeout(saveTimers.current[q.id]);saveTimers.current[q.id]=setTimeout(async()=>{try{const r=await fetch(`/api/analysis/questions/${q.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)});const p=await r.json();if(!r.ok||!p.success)throw new Error(p.message);setWorkspace(w=>w?{...w,questions:w.questions.map(x=>x.id===q.id?p.question:x)}:w);setSaveState("자동저장 완료");}catch(e){setSaveState("저장 실패");setError(e instanceof Error?e.message:"저장 실패");}},500);}
 function updateMeta(key:keyof Meta,value:string){if(!active)return;const m={...metaOf(active),[key]:value};localPatch(active.id,{review_result:m});scheduleSave(active,{review_result:m});}
 function updateField(key:"question_no"|"answer"|"page_no",value:string|number){if(!active)return;const patch:any={[key]:key==="answer"?value:Number(value)};localPatch(active.id,patch);scheduleSave(active,patch);}
 function rect(q:Question):Rect{return{x:Number(q.crop_x||0),y:Number(q.crop_y||0),w:Number(q.crop_width||0),h:Number(q.crop_height||0)}}
 function point(e:PointerEvent){const b=overlayRef.current!.getBoundingClientRect();return{x:(e.clientX-b.left)/b.width*100,y:(e.clientY-b.top)/b.height*100};}
 function startDrag(e:PointerEvent,q:Question,mode:"move"|"resize"){e.stopPropagation();(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);const p=point(e);dragRef.current={mode,id:q.id,startX:p.x,startY:p.y,origin:rect(q)};setActiveId(q.id);}
 function move(e:PointerEvent){const d=dragRef.current;if(!d)return;const q=questions.find(x=>x.id===d.id);if(!q)return;const p=point(e),dx=p.x-d.startX,dy=p.y-d.startY;let r={...d.origin};if(d.mode==="move"){r.x=clamp(d.origin.x+dx,0,100-d.origin.w);r.y=clamp(d.origin.y+dy,0,100-d.origin.h);}else{r.w=clamp(d.origin.w+dx,2,100-d.origin.x);r.h=clamp(d.origin.h+dy,2,100-d.origin.y);}localPatch(q.id,{crop_x:r.x,crop_y:r.y,crop_width:r.w,crop_height:r.h});}
 function endDrag(){const d=dragRef.current;if(!d)return;dragRef.current=null;const q=questions.find(x=>x.id===d.id);if(q)scheduleSave(q,{crop_x:q.crop_x,crop_y:q.crop_y,crop_width:q.crop_width,crop_height:q.crop_height});}
 async function addBox(){if(!workspace?.analysis)return;setBusy("add");try{const next=Math.max(0,...questions.map(q=>q.question_no))+1;const r=await fetch("/api/analysis/questions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({analysisId:workspace.analysis.id,questionNo:next,pageNo:page,x:5,y:5,width:42,height:18})});const p=await r.json();if(!r.ok||!p.success)throw new Error(p.message);setWorkspace(w=>w?{...w,questions:[...w.questions,p.question]}:w);setActiveId(p.question.id);}catch(e){setError(e instanceof Error?e.message:"추가 실패");}finally{setBusy("");}}
 async function remove(){if(!active)return;if(!confirm(`${active.question_no}번 문항 박스를 삭제할까요?`))return;const r=await fetch(`/api/analysis/questions/${active.id}`,{method:"DELETE"});const p=await r.json();if(!r.ok||!p.success){setError(p.message||"삭제 실패");return;}setWorkspace(w=>w?{...w,questions:w.questions.filter(q=>q.id!==active.id)}:w);setActiveId(questions.find(q=>q.id!==active.id)?.id||"");}
 async function setApproved(q:Question,approved:boolean){localPatch(q.id,{status:approved?"APPROVED":"REVIEW"});scheduleSave(q,{status:approved?"APPROVED":"REVIEW"});}
 async function approveAll(){for(const q of questions.filter(q=>q.status!=="REJECTED")){localPatch(q.id,{status:"APPROVED"});scheduleSave(q,{status:"APPROVED"});}setMessage("모든 문항을 검수 완료로 표시했습니다.");}
 async function register(){if(!workspace?.analysis)return;setBusy("register");setError("");try{await new Promise(r=>setTimeout(r,700));await materializeAll(workspace.source.id);const r=await fetch("/api/problem-bank/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({analysisId:workspace.analysis.id})});const p=await r.json();if(!r.ok||!p.success)throw new Error(p.message);setMessage(p.message);await loadWorkspace(workspace.source.id);await loadList();}catch(e){setError(e instanceof Error?e.message:"등록 실패");}finally{setBusy("");}}
 const approved=questions.filter(q=>q.status==="APPROVED").length; const needsReview=(q:Question)=>Number(q.confidence??0)<.85||!String(q.answer??"").trim()||!String(metaOf(q).unit??"").trim()||!String(metaOf(q).topic??"").trim()||metaOf(q).question_type==="unknown"; const reviewCount=questions.filter(needsReview).length;

 return <main className="aw"><header><div className="title-row"><button className="back" onClick={()=>{if(window.history.length>1)router.back();else router.push("/");}}>← 뒤로</button><div><small>MATHPOOH SOS</small><h1>AI 분석 작업장</h1><p>업로드 → AI 분석 → 박스·정보 검수 → 승인 문항 등록</p></div></div><div className="top-actions"><span>{saveState}</span><button onClick={()=>router.push("/problem-bank")}>문제은행</button></div></header>
 <section className="upload"><form onSubmit={upload}><input placeholder="시험지명" value={title} onChange={e=>setTitle(e.target.value)}/><input placeholder="출처" value={source} onChange={e=>setSource(e.target.value)}/><select value={grade} onChange={e=>setGrade(e.target.value)}>{["중1","중2","중3","고1","고2","고3"].map(x=><option key={x}>{x}</option>)}</select><select value={subject} onChange={e=>setSubject(e.target.value)}>{["중등수학","공통수학1","공통수학2","대수","미적분Ⅰ","확률과 통계"].map(x=><option key={x}>{x}</option>)}</select><label>원본 HWP/PDF<input type="file" accept=".hwp,.hwpx,.pdf" onChange={e=>choose("hwp",e)}/><b>{files.hwp?.name||"선택"}</b></label><label>시험지 PDF<input type="file" accept=".pdf" onChange={e=>choose("exam",e)}/><b>{files.exam?.name||"선택"}</b></label><label>해설지 PDF<input type="file" accept=".pdf" onChange={e=>choose("solution",e)}/><b>{files.solution?.name||"선택"}</b></label><button disabled={!!busy}>{busy==="upload"?"업로드 중":"세트 업로드"}</button></form></section>
 {(message||error)&&<div className={error?"notice error":"notice"}>{error||message}</div>}
 <section className="picker"><select value={selectedId} onChange={e=>void loadWorkspace(e.target.value)}><option value="">시험지 선택</option>{items.map(i=><option value={i.id} key={i.id}>{i.title} · {statusLabel[i.status]||i.status}</option>)}</select><button onClick={analyze} disabled={!workspace||!!busy}>{busy==="analyze"?"AI 분석 중...":"AI 분석 실행"}</button><span className="review-guide">전체 기본확정 · 틀린 문항만 수정</span><button className="gold" onClick={register} disabled={!approved||!!busy}>{busy==="register"?"등록 중...":`전체 ${approved}문항 문제은행 등록`}</button></section>
 {!workspace?<div className="empty">시험지 세트를 업로드하거나 선택하세요.</div>:<><section className="summary"><b>{workspace.source.title}</b><span>{workspace.source.grade} · {workspace.source.subject}</span><span>{workspace.analysis?.current_step||"AI 분석 전"}</span><span>문항 {questions.length} · 재확인 권장 {reviewCount}</span></section>
 <div className="grid"><aside className="numbers"><div className="side-head"><b>문항</b><button onClick={addBox}>+ 추가</button></div><div className="numgrid">{questions.filter(q=>q.status!=="REJECTED").map(q=><button key={q.id} className={`${q.id===active?.id?"active":""} ${q.status==="APPROVED"?"approved":""} ${needsReview(q)?"warning":""}`} title={needsReview(q)?"AI 재확인 권장":"기본확정"} onClick={()=>{setActiveId(q.id);setPage(Number(q.page_no||1));}}>{q.question_no}</button>)}</div>{active&&<div className="editor"><label>문항번호<input type="number" value={active.question_no} onChange={e=>updateField("question_no",e.target.value)}/></label><label>페이지<input type="number" value={active.page_no||1} onChange={e=>{updateField("page_no",e.target.value);setPage(Number(e.target.value));}}/></label><label>정답<input value={active.answer||""} onChange={e=>updateField("answer",e.target.value)}/></label><label>유형<select value={metaOf(active).question_type} onChange={e=>updateMeta("question_type",e.target.value)}><option value="objective">객관식</option><option value="subjective">주관식</option><option value="unknown">미분류</option></select></label><label>난이도<select value={metaOf(active).difficulty} onChange={e=>updateMeta("difficulty",e.target.value)}>{["하","중","상","최상"].map(x=><option key={x}>{x}</option>)}</select></label><label>단원<input value={metaOf(active).unit||""} onChange={e=>updateMeta("unit",e.target.value)}/></label><label>유형명<input value={metaOf(active).topic||""} onChange={e=>updateMeta("topic",e.target.value)}/></label><div className={needsReview(active)?"review-status warning":"review-status ok"}>{needsReview(active)?`⚠ AI 재확인 권장 · 신뢰도 ${Math.round(Number(active.confidence||0)*100)}%`:`✓ 기본확정 · 신뢰도 ${Math.round(Number(active.confidence||0)*100)}%`}</div><button className="delete" onClick={remove}>문항 삭제</button></div>}</aside>
 <section className="viewer"><div className="toolbar"><button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}>이전</button><b>{page}/{pageCount||"?"}</b><button onClick={()=>setPage(p=>Math.min(pageCount||p+1,p+1))} disabled={!!pageCount&&page>=pageCount}>다음</button><button onClick={()=>setScale(s=>Math.max(.7,s-.15))}>－</button><span>{Math.round(scale*100)}%</span><button onClick={()=>setScale(s=>Math.min(2.2,s+.15))}>＋</button><em>박스 드래그 이동 · 우하단 핸들 크기조절</em></div><div className="canvas"><canvas ref={canvasRef}/><div ref={overlayRef} className="overlay" onPointerMove={move} onPointerUp={endDrag} onPointerCancel={endDrag}>{pageQuestions.map(q=>{const r=rect(q);return <div key={q.id} className={`box ${q.id===active?.id?"active":""} ${q.status==="APPROVED"?"approved":""} ${needsReview(q)?"warning":""}`} style={{left:`${r.x}%`,top:`${r.y}%`,width:`${r.w}%`,height:`${r.h}%`}} onPointerDown={e=>startDrag(e,q,"move")}><span>{q.question_no}</span><i onPointerDown={e=>startDrag(e,q,"resize")}/></div>})}</div></div></section></div></>}
 <style jsx>{`*{box-sizing:border-box}.aw{min-height:100vh;background:#f3f5f8;color:#172033;padding:22px;font-family:Arial,"Pretendard",sans-serif}.aw>header{max-width:1800px;margin:auto;display:flex;justify-content:space-between;align-items:end}.title-row{display:flex;align-items:center;gap:14px}.back{height:40px;padding:0 14px;border:1px solid #cfd6e2;border-radius:9px;background:#fff;font-weight:900}.aw h1{margin:3px 0;font-size:32px}.aw header p{margin:0;color:#6d7688}.aw header small{color:#b88922;font-weight:900}.top-actions{display:flex;align-items:center;gap:10px}.top-actions span{font-size:13px;color:#667085}.aw button,.aw input,.aw select{font:inherit}.aw button{cursor:pointer}.upload,.picker,.summary,.numbers,.viewer,.empty{background:#fff;border:1px solid #dfe4ec;border-radius:15px}.upload{max-width:1800px;margin:18px auto 10px;padding:14px}.upload form{display:grid;grid-template-columns:1.3fr 1fr 110px 150px repeat(3,1.2fr) 140px;gap:9px}.upload input,.upload select,.picker select,.editor input,.editor select{height:42px;border:1px solid #d8dee8;border-radius:9px;padding:0 11px;background:#fff}.upload label{height:42px;border:1px dashed #bdc6d5;border-radius:9px;padding:4px 9px;overflow:hidden;font-size:11px;color:#667085}.upload label input{display:none}.upload label b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#172033}.upload button,.picker button,.top-actions button,.side-head button{border:1px solid #d4dae5;border-radius:9px;background:#fff;font-weight:800}.upload button{background:#172033;color:#fff;border:0}.notice{max-width:1800px;margin:10px auto;padding:11px 15px;border-radius:10px;background:#eaf8ef;color:#177044;font-weight:700}.notice.error{background:#fff0f0;color:#b42318}.picker{max-width:1800px;margin:10px auto;padding:12px;display:flex;gap:9px}.picker select{min-width:340px;flex:1}.picker button{padding:0 17px}.picker .gold{background:#b88922;color:#fff;border-color:#b88922}.review-guide{display:flex;align-items:center;padding:0 12px;border-radius:9px;background:#eef8f3;color:#187153;font-size:13px;font-weight:900;white-space:nowrap}.summary{max-width:1800px;margin:10px auto;padding:14px 18px;display:grid;grid-template-columns:2fr 1fr 2fr 1fr;gap:15px}.grid{max-width:1800px;margin:auto;display:grid;grid-template-columns:300px minmax(0,1fr);gap:12px;align-items:start}.numbers{padding:14px;position:sticky;top:10px;max-height:calc(100vh - 20px);overflow:auto}.side-head{display:flex;justify-content:space-between;align-items:center}.side-head button{padding:7px 10px}.numgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:12px 0}.numgrid button{height:36px;border:1px solid #d9dfE9;background:#fff;border-radius:8px;font-weight:900}.numgrid button.active{background:#334ecf;color:#fff}.numgrid button.approved{box-shadow:inset 0 0 0 2px #27936e}.numgrid button.warning{box-shadow:inset 0 0 0 2px #e29c28;background:#fff8e8}.numgrid button.active.warning{background:#334ecf;color:#fff}.editor{border-top:1px solid #e7eaf0;padding-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px}.editor label{font-size:12px;font-weight:800;color:#596274}.editor label:nth-of-type(n+3){grid-column:1/-1}.editor input,.editor select{width:100%;margin-top:4px}.editor button{grid-column:1/-1;height:40px;border-radius:9px;font-weight:900}.review-status{grid-column:1/-1;min-height:40px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900}.review-status.ok{background:#eaf8f1;border:1px solid #9bd2bd;color:#177653}.review-status.warning{background:#fff7e8;border:1px solid #ebca83;color:#875e00}.approve{background:#eaf8f1;border:1px solid #9bd2bd;color:#177653}.unapprove{background:#fff7e8;border:1px solid #ebca83;color:#875e00}.delete{background:#fff1f1;border:1px solid #efb2b2;color:#b42318}.viewer{overflow:auto}.toolbar{height:54px;border-bottom:1px solid #e4e8ef;display:flex;align-items:center;gap:8px;padding:0 12px;position:sticky;top:0;background:#fff;z-index:4}.toolbar button{height:34px;border:1px solid #d7dde7;background:#fff;border-radius:8px}.toolbar em{margin-left:auto;color:#6a7487;font-size:13px}.canvas{position:relative;width:max-content;margin:14px auto;background:#fff;box-shadow:0 2px 18px rgba(0,0,0,.08)}.canvas canvas{display:block}.overlay{position:absolute;inset:0;touch-action:none}.box{position:absolute;border:2px solid #e29c28;background:rgba(255,190,66,.12);cursor:move;user-select:none}.box.active{border:3px solid #e34d4d;background:rgba(227,77,77,.12);z-index:2}.box.approved{border-color:#27936e;background:rgba(39,147,110,.1)}.box.warning{border-color:#e29c28;background:rgba(255,190,66,.15)}.box.active{border-color:#e34d4d;background:rgba(227,77,77,.12)}.box span{position:absolute;left:-2px;top:-24px;background:#172033;color:#fff;padding:3px 7px;border-radius:5px;font-weight:900}.box i{position:absolute;width:16px;height:16px;right:-8px;bottom:-8px;border:2px solid #fff;background:#334ecf;border-radius:50%;cursor:nwse-resize}.empty{max-width:1800px;margin:12px auto;padding:80px;text-align:center;color:#727b8c}@media(max-width:1200px){.upload form{grid-template-columns:repeat(4,1fr)}.grid{grid-template-columns:260px minmax(0,1fr)}}@media(max-width:760px){.aw{padding:10px}.aw>header,.picker{align-items:stretch;flex-direction:column}.upload form{grid-template-columns:1fr}.picker select{min-width:0}.summary,.grid{grid-template-columns:1fr}.numbers{position:static;max-height:none}.toolbar em{display:none}}`}</style></main>;
}
