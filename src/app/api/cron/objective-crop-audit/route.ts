import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;

const BATCH_SIZE=8;

type AuditResult={clipped:boolean;missing_choices:boolean;confidence:number;reason:string};

function outputText(payload:any){
  if(typeof payload?.output_text==="string")return payload.output_text;
  return (payload?.output??[]).flatMap((x:any)=>x?.content??[]).map((x:any)=>x?.text??"").join("\n");
}
function parseAudit(payload:any):AuditResult{
  const text=outputText(payload).trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"");
  return JSON.parse(text);
}
async function auditOne(args:{apiKey:string;model:string;pdfUrl:string;imageUrl:string;title:string;answer:string;questionNo:number}){
  const schema={type:"object",additionalProperties:false,required:["clipped","missing_choices","confidence","reason"],properties:{
    clipped:{type:"boolean"},missing_choices:{type:"boolean"},confidence:{type:"number",minimum:0,maximum:1},reason:{type:"string"}
  }};
  const prompt=[
    "너는 한국 수학 객관식 문항 이미지의 최종 품질검수자다.",
    "원본 시험지 PDF와 현재 학생에게 보여주는 잘린 문항 이미지를 비교한다.",
    `검사대상: ${args.title} / 원본 문항번호 ${args.questionNo} / 저장 정답 ${args.answer}`,
    "이 문항은 Problem DNA와 문제은행에서 객관식으로 확정되어 있다.",
    "원본에 있는 선택지(①②③④⑤ 또는 이에 준하는 1~5 보기)가 현재 잘린 이미지에서 하나라도 빠졌거나, 하단 잘림 때문에 학생이 모든 선택지를 읽을 수 없으면 clipped=true, missing_choices=true.",
    "선택지는 모두 보이지만 본문/수식/도형/표의 핵심 일부가 잘렸으면 clipped=true, missing_choices=false.",
    "현재 이미지가 학생이 문제를 완전히 풀 수 있을 정도로 온전하면 clipped=false.",
    "원본과 현재 이미지를 직접 비교해 판단하고, 단순히 crop 높이가 낮다는 이유만으로 clipped=true로 만들지 마라.",
    "확실한 경우 confidence를 높게, 애매하면 낮게 준다."
  ].join("\n");
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${args.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({
    model:args.model,input:[{role:"user",content:[
      {type:"input_text",text:prompt},
      {type:"input_file",file_url:args.pdfUrl},
      {type:"input_image",image_url:args.imageUrl,detail:"high"}
    ]}],
    text:{format:{type:"json_schema",name:"objective_crop_audit",strict:true,schema}},
    reasoning:{effort:"low"},max_output_tokens:800,store:false
  }),signal:AbortSignal.timeout(110000),cache:"no-store"});
  if(!r.ok)throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0,300)}`);
  return parseAudit(await r.json());
}

async function processBatch(){
  const db=createClient();
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey)throw new Error("OPENAI_API_KEY가 없습니다.");
  const model=process.env.OPENAI_MODEL||"gpt-5-mini";

  const picked=await db.from("problem_bank_questions")
    .select("id,title,question_no,answer,question_image_path,source_file_id,analysis_question_id,crop_height,problem_dna,status")
    .eq("status","HOLD")
    .eq("question_type","multiple_choice")
    .lt("crop_height",8)
    .eq("problem_dna->cropAudit->>pending","true")
    .order("updated_at",{ascending:true})
    .limit(BATCH_SIZE);
  if(picked.error)throw picked.error;
  const rows=picked.data??[];
  if(!rows.length)return {processed:0,normal:0,clipped:0,failed:0};

  const sourceIds=[...new Set(rows.map((x:any)=>x.source_file_id).filter(Boolean))];
  const sf=await db.from("source_files").select("id,exam_pdf_path").in("id",sourceIds);
  if(sf.error)throw sf.error;
  const sourceMap=new Map((sf.data??[]).map((x:any)=>[String(x.id),x.exam_pdf_path]));

  let normal=0,clipped=0,failed=0;
  const work=async(row:any)=>{
    try{
      const pdfPath=sourceMap.get(String(row.source_file_id));
      if(!pdfPath||!row.question_image_path)throw new Error("원본 PDF 또는 문항 이미지 없음");
      const [pdf,image]=await Promise.all([
        db.storage.from("exam-pdf").createSignedUrl(String(pdfPath),900),
        db.storage.from("question-images").createSignedUrl(String(row.question_image_path),900),
      ]);
      if(pdf.error||image.error)throw new Error(pdf.error?.message||image.error?.message||"signed url error");
      const audit=await auditOne({apiKey,model,pdfUrl:pdf.data.signedUrl,imageUrl:image.data.signedUrl,title:String(row.title??""),answer:String(row.answer??""),questionNo:Number(row.question_no??0)});
      const confirmed=audit.clipped===true&&audit.confidence>=0.75;
      const ambiguous=audit.clipped===true&&audit.confidence<0.75;
      const now=new Date().toISOString();
      const dna=row.problem_dna??{};
      const nextDna={
        ...dna,
        cropAudit:{pending:ambiguous,confirmed,normal:!audit.clipped,missing_choices:audit.missing_choices,confidence:audit.confidence,reason:audit.reason,checked_at:now,rule:"objective-crop-height-lt8"},
        ...(confirmed?{errorReview:{open:true,kind:"CROP_CLIPPED",reason:audit.reason,confidence:audit.confidence,checkedAt:now}}:{})
      };
      const status=confirmed||ambiguous?"HOLD":"ACTIVE";
      const saved=await db.from("problem_bank_questions").update({status,problem_dna:nextDna,updated_at:now}).eq("id",row.id);
      if(saved.error)throw saved.error;
      if(row.analysis_question_id){
        const aq=await db.from("analysis_questions").select("ai_result").eq("id",row.analysis_question_id).maybeSingle();
        if(!aq.error&&aq.data)await db.from("analysis_questions").update({ai_result:{...(aq.data.ai_result??{}),objective_crop_audit:audit},updated_at:now}).eq("id",row.analysis_question_id);
      }
      if(confirmed)clipped++; else if(!audit.clipped)normal++; else failed++;
    }catch(e){
      failed++;
      const dna=row.problem_dna??{};
      const prev=dna?.cropAudit??{};
      await db.from("problem_bank_questions").update({
        problem_dna:{...dna,cropAudit:{...prev,pending:true,last_error:e instanceof Error?e.message:String(e),last_attempt_at:new Date().toISOString()}},
        updated_at:new Date().toISOString()
      }).eq("id",row.id);
    }
  };
  for(let i=0;i<rows.length;i+=4)await Promise.all(rows.slice(i,i+4).map(work));
  return {processed:rows.length,normal,clipped,failed};
}

async function run(request:Request){
  const expected=String(process.env.CRON_SECRET??"").trim();
  if(expected){
    const auth=request.headers.get("authorization")??"";
    if(auth!==`Bearer ${expected}`)return NextResponse.json({success:false,message:"cron unauthorized"},{status:401});
  }
  const work=async()=>processBatch();
  after(async()=>{await work();});
  return NextResponse.json({success:true,accepted:true,batch:BATCH_SIZE},{status:202});
}

export async function GET(request:Request){
  try{return await run(request);}catch(e){return NextResponse.json({success:false,message:e instanceof Error?e.message:"audit worker error"},{status:500});}
}
export async function POST(request:Request){return GET(request);}
