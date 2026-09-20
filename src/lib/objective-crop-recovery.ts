type Rect={page_no:number;crop_x:number;crop_y:number;crop_width:number;crop_height:number;confidence:number;reason:string};
type Validation={choices_visible:boolean;body_complete:boolean;foreign_question:boolean;confidence:number;reason:string};

function outputText(payload:any){
  if(typeof payload?.output_text==="string")return payload.output_text;
  return (payload?.output??[]).flatMap((x:any)=>x?.content??[]).map((x:any)=>x?.text??"").join("\n");
}
function parseJson<T>(payload:any):T{
  const raw=outputText(payload).trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"");
  return JSON.parse(raw) as T;
}
async function openAiJson<T>(apiKey:string,model:string,input:any[],schema:any,name:string,max=900):Promise<T>{
  const r=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      model,
      input:[{role:"user",content:input}],
      text:{format:{type:"json_schema",name,strict:true,schema}},
      reasoning:{effort:"low"},
      max_output_tokens:max,
      store:false,
    }),
    signal:AbortSignal.timeout(110000),
    cache:"no-store",
  });
  if(!r.ok)throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0,400)}`);
  return parseJson<T>(await r.json());
}
async function locateObjectiveCrop(args:{apiKey:string;model:string;pdfUrl:string;imageUrl:string;questionNo:number;title:string;pageNo:number;x:number;y:number;width:number;height:number}){
  const schema={type:"object",additionalProperties:false,required:["page_no","crop_x","crop_y","crop_width","crop_height","confidence","reason"],properties:{
    page_no:{type:"integer",minimum:1,maximum:500},
    crop_x:{type:"number",minimum:0,maximum:100},crop_y:{type:"number",minimum:0,maximum:100},
    crop_width:{type:"number",minimum:0.1,maximum:100},crop_height:{type:"number",minimum:0.1,maximum:100},
    confidence:{type:"number",minimum:0,maximum:1},reason:{type:"string"}
  }};
  const prompt=[
    "한국 수학 객관식 문항의 잘린 이미지를 복구한다.",
    `대상: ${args.title} / 문항번호 ${args.questionNo}`,
    `현재 좌표: page=${args.pageNo}, x=${args.x}, y=${args.y}, width=${args.width}, height=${args.height}`,
    "원본 시험지 PDF에서 정확히 이 문항을 다시 찾아 페이지 전체 0~100 기준 절대 좌표를 반환하라.",
    "반드시 문항번호, 본문, 모든 수식/조건/도형/표/그래프와 객관식 선택지 ①②③④⑤ 전체를 포함한다.",
    "①~⑤ 중 하나라도 빠지는 좌표는 절대 반환하지 마라.",
    "다음 문항 번호나 다음 문항 본문은 포함하지 않는다.",
    "선택지 아래에는 약간의 안전 여백을 둔다. 현재 crop보다 아래쪽을 넉넉히 포함해도 된다.",
    "현재 잘린 이미지는 무엇이 누락됐는지 참고용이고, 좌표 판단의 기준은 원본 PDF다."
  ].join("\n");
  return openAiJson<Rect>(args.apiKey,args.model,[
    {type:"input_text",text:prompt},
    {type:"input_file",file_url:args.pdfUrl},
    {type:"input_image",image_url:args.imageUrl,detail:"high"}
  ],schema,"objective_crop_recovery");
}
async function validateRecovered(args:{apiKey:string;model:string;pdfUrl:string;imageUrl:string;questionNo:number;title:string}){
  const schema={type:"object",additionalProperties:false,required:["choices_visible","body_complete","foreign_question","confidence","reason"],properties:{
    choices_visible:{type:"boolean"},body_complete:{type:"boolean"},foreign_question:{type:"boolean"},
    confidence:{type:"number",minimum:0,maximum:1},reason:{type:"string"}
  }};
  const prompt=[
    "학생에게 바로 배포할 객관식 수학 문항 crop 최종검수다.",
    `대상: ${args.title} / 문항번호 ${args.questionNo}`,
    "원본 PDF와 새 crop 이미지를 직접 비교한다.",
    "새 crop 이미지 안에 객관식 선택지 ①②③④⑤가 전부 실제로 보이면 choices_visible=true.",
    "본문/수식/조건/도형/표/그래프가 빠짐없이 보이면 body_complete=true.",
    "다음 문항 또는 다른 문항 내용이 섞이면 foreign_question=true.",
    "선택지가 하나라도 없거나 읽을 수 없으면 choices_visible=false.",
    "추정하지 말고 이미지에 실제로 보이는 것만 판정한다."
  ].join("\n");
  return openAiJson<Validation>(args.apiKey,args.model,[
    {type:"input_text",text:prompt},
    {type:"input_file",file_url:args.pdfUrl},
    {type:"input_image",image_url:args.imageUrl,detail:"high"}
  ],schema,"objective_crop_recovery_validation");
}

function clamp(v:any,min:number,max:number){const n=Number(v);return Math.min(max,Math.max(min,Number.isFinite(n)?n:min));}

async function renderPdfCrop(pdfBytes:Uint8Array,rect:Rect){
  const canvasMod:any=await import("@napi-rs/canvas");
  const g:any=globalThis as any;
  if(!g.DOMMatrix&&canvasMod.DOMMatrix)g.DOMMatrix=canvasMod.DOMMatrix;
  if(!g.ImageData&&canvasMod.ImageData)g.ImageData=canvasMod.ImageData;
  if(!g.Path2D&&canvasMod.Path2D)g.Path2D=canvasMod.Path2D;
  const pdfjs:any=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc=await pdfjs.getDocument({data:pdfBytes,useSystemFonts:true}).promise;
  try{
    const pageNo=Math.max(1,Math.min(doc.numPages,Math.trunc(rect.page_no||1)));
    const page=await doc.getPage(pageNo);
    const base=page.getViewport({scale:1});
    const viewport=page.getViewport({scale:Math.max(1.8,2000/base.width)});
    const canvas=canvasMod.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
    await page.render({canvasContext:ctx,viewport}).promise;
    const x=clamp(rect.crop_x,0,99.5),y=clamp(rect.crop_y,0,99.5);
    const w=clamp(rect.crop_width,1,100-x),h=clamp(rect.crop_height,1,100-y);
    const sx=Math.max(0,Math.floor(canvas.width*x/100));
    const sy=Math.max(0,Math.floor(canvas.height*y/100));
    const ex=Math.min(canvas.width,Math.ceil(canvas.width*(x+w)/100));
    const ey=Math.min(canvas.height,Math.ceil(canvas.height*(y+h)/100));
    const sw=Math.max(1,ex-sx),sh=Math.max(1,ey-sy);
    const out=canvasMod.createCanvas(sw,sh);
    const outCtx=out.getContext("2d");
    outCtx.fillStyle="#fff";outCtx.fillRect(0,0,sw,sh);
    outCtx.drawImage(canvas,sx,sy,sw,sh,0,0,sw,sh);
    const bytes=await out.encode("png");
    return {bytes:Buffer.from(bytes),pageNo,x,y,w,h};
  }finally{
    try{await doc.destroy();}catch{}
  }
}

export async function processObjectiveCropRecoveryBatch(db:any,batchSize=8){
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey)throw new Error("OPENAI_API_KEY가 없습니다.");
  const model=process.env.OPENAI_MODEL||"gpt-5-mini";

  const q=await db.from("problem_bank_questions")
    .select("id,title,question_no,source_file_id,analysis_question_id,exam_pdf_path,question_image_path,page_no,crop_x,crop_y,crop_width,crop_height,problem_dna,status,updated_at")
    .eq("status","HOLD")
    .eq("question_type","multiple_choice")
    .eq("problem_dna->errorReview->>kind","CROP_CLIPPED")
    .order("updated_at",{ascending:true})
    .limit(batchSize*2);
  if(q.error)throw q.error;
  const rows=(q.data??[]).filter((row:any)=>{
    const rec=row.problem_dna?.cropAudit?.recovery;
    if(rec?.status==="PASS")return false;
    if(rec?.status==="RUNNING"&&rec?.started_at){
      const age=Date.now()-Date.parse(String(rec.started_at));
      if(Number.isFinite(age)&&age<20*60*1000)return false;
    }
    return true;
  }).slice(0,batchSize);
  if(!rows.length)return {processed:0,recovered:0,held:0,failed:0};

  let recovered=0,held=0,failed=0;
  const processOne=async(row:any)=>{
    const now=new Date().toISOString();
    const dna=row.problem_dna??{};
    const audit=dna.cropAudit??{};
    await db.from("problem_bank_questions").update({
      problem_dna:{...dna,cropAudit:{...audit,recovery:{status:"RUNNING",started_at:now}}},
      updated_at:now
    }).eq("id",row.id).eq("status","HOLD");

    try{
      if(!row.exam_pdf_path||!row.question_image_path)throw new Error("원본 PDF 또는 crop 이미지 경로 없음");
      const [pdfSigned,imgSigned,pdfDownload]=await Promise.all([
        db.storage.from("exam-pdf").createSignedUrl(String(row.exam_pdf_path),1200),
        db.storage.from("question-images").createSignedUrl(String(row.question_image_path),1200),
        db.storage.from("exam-pdf").download(String(row.exam_pdf_path)),
      ]);
      if(pdfSigned.error||imgSigned.error||pdfDownload.error||!pdfDownload.data)throw new Error(pdfSigned.error?.message||imgSigned.error?.message||pdfDownload.error?.message||"원본 로드 실패");
      const rect=await locateObjectiveCrop({
        apiKey,model,pdfUrl:pdfSigned.data.signedUrl,imageUrl:imgSigned.data.signedUrl,
        questionNo:Number(row.question_no??0),title:String(row.title??""),pageNo:Number(row.page_no??1),
        x:Number(row.crop_x??0),y:Number(row.crop_y??0),width:Number(row.crop_width??1),height:Number(row.crop_height??1)
      });
      if(Number(rect.confidence)<0.7)throw new Error(`재크롭 좌표 신뢰도 낮음: ${rect.confidence}`);
      const rendered=await renderPdfCrop(new Uint8Array(await pdfDownload.data.arrayBuffer()),rect);
      const base=String(row.question_image_path).split("/").slice(0,-1).join("/");
      const filename=`${String(row.question_no??0).padStart(3,"0")}-recovered-v1.png`;
      const path=base?`${base}/${filename}`:`recovered/${row.id}/${filename}`;
      const uploaded=await db.storage.from("question-images").upload(path,rendered.bytes,{contentType:"image/png",upsert:true});
      if(uploaded.error)throw uploaded.error;
      const newSigned=await db.storage.from("question-images").createSignedUrl(path,1200);
      if(newSigned.error)throw newSigned.error;
      const validation=await validateRecovered({apiKey,model,pdfUrl:pdfSigned.data.signedUrl,imageUrl:newSigned.data.signedUrl,questionNo:Number(row.question_no??0),title:String(row.title??"")});
      const pass=validation.choices_visible&&validation.body_complete&&!validation.foreign_question&&Number(validation.confidence)>=0.8;
      const finished=new Date().toISOString();
      if(pass){
        const nextDna={...dna,cropAudit:{...audit,pending:false,confirmed:false,normal:true,recovered:true,missing_choices:false,
          recovery:{status:"PASS",started_at:now,finished_at:finished,confidence:validation.confidence,reason:validation.reason,engine:"objective-recovery-v1"}},
        };
        delete (nextDna as any).errorReview;
        const bank=await db.from("problem_bank_questions").update({
          page_no:rendered.pageNo,crop_x:rendered.x,crop_y:rendered.y,crop_width:rendered.w,crop_height:rendered.h,
          question_image_path:path,status:"ACTIVE",problem_dna:nextDna,updated_at:finished
        }).eq("id",row.id).eq("status","HOLD");
        if(bank.error)throw bank.error;
        if(row.analysis_question_id){
          const aq=await db.from("analysis_questions").select("ai_result,review_result").eq("id",row.analysis_question_id).maybeSingle();
          if(!aq.error&&aq.data){
            await db.from("analysis_questions").update({
              page_no:rendered.pageNo,crop_x:rendered.x,crop_y:rendered.y,crop_width:rendered.w,crop_height:rendered.h,
              question_image_path:path,
              ai_result:{...(aq.data.ai_result??{}),crop_recovery:{rect,validation,finished_at:finished}},
              review_result:{...(aq.data.review_result??{}),crop_engine_version:"objective-recovery-v1",crop_manual:false,crop_recovered:true},
              review_reason:null,updated_at:finished
            }).eq("id",row.analysis_question_id);
          }
        }
        recovered++;
      }else{
        const nextDna={...dna,cropAudit:{...audit,pending:false,confirmed:true,normal:false,
          recovery:{status:"REVIEW",started_at:now,finished_at:finished,candidate_path:path,confidence:validation.confidence,reason:validation.reason,engine:"objective-recovery-v1"}},
          errorReview:{...(dna.errorReview??{}),open:true,kind:"CROP_CLIPPED",reason:`재크롭 후에도 검수 미통과: ${validation.reason}`,checkedAt:finished}
        };
        await db.from("problem_bank_questions").update({problem_dna:nextDna,updated_at:finished}).eq("id",row.id);
        held++;
      }
    }catch(e){
      const finished=new Date().toISOString();
      const message=e instanceof Error?e.message:String(e);
      const fresh=await db.from("problem_bank_questions").select("problem_dna").eq("id",row.id).maybeSingle();
      const current=fresh.data?.problem_dna??dna;
      const ca=current.cropAudit??audit;
      await db.from("problem_bank_questions").update({
        problem_dna:{...current,cropAudit:{...ca,recovery:{status:"FAILED",started_at:ca?.recovery?.started_at??now,finished_at:finished,error:message.slice(0,500),engine:"objective-recovery-v1"}}},
        updated_at:finished
      }).eq("id",row.id);
      failed++;
    }
  };

  for(let i=0;i<rows.length;i+=3)await Promise.all(rows.slice(i,i+3).map(processOne));
  return {processed:rows.length,recovered,held,failed};
}
