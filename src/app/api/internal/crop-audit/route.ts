import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const TOKEN="sos-crop-audit-20260920-7f3c1a9d";

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
    "너는 한국 수학 객관식 문항 이미지의 선택지 누락 여부만 검사하는 품질검수자다.",
    "원본 시험지 PDF와 현재 학생에게 보여주는 잘린 문항 이미지를 비교한다.",
    `검사대상: ${args.title} / 원본 문항번호 ${args.questionNo} / 저장 정답 ${args.answer}`,
    "이 문항은 데이터상 객관식이다.",
    "현재 잘린 이미지에 객관식 보기/선택지(예: ①②③④⑤ 또는 1~5 선택지)가 원본에 존재하는데 빠졌거나, 문항 하단이 잘려 학생이 선택지를 볼 수 없으면 clipped=true, missing_choices=true로 판정한다.",
    "원본 자체가 선택지 없는 특수 객관식이면 missing_choices=false로 한다.",
    "본문/도형/표의 핵심 일부가 잘린 경우에도 clipped=true로 한다.",
    "애매하면 confidence를 낮춘다. 확실한 잘림만 차단 대상으로 판정한다."
  ].join("\n");
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${args.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({
    model:args.model,
    input:[{role:"user",content:[
      {type:"input_text",text:prompt},
      {type:"input_file",file_url:args.pdfUrl},
      {type:"input_image",image_url:args.imageUrl,detail:"high"}
    ]}],
    text:{format:{type:"json_schema",name:"objective_crop_audit",strict:true,schema}},
    reasoning:{effort:"low"},max_output_tokens:900,store:false
  }),signal:AbortSignal.timeout(110000),cache:"no-store"});
  if(!r.ok)throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0,300)}`);
  return parseAudit(await r.json());
}

export async function GET(req:NextRequest){
  if(req.nextUrl.searchParams.get("token")!==TOKEN)return NextResponse.json({message:"forbidden"},{status:403});
  const offset=Math.max(0,Number(req.nextUrl.searchParams.get("offset")??0)||0);
  const limit=Math.max(1,Math.min(25,Number(req.nextUrl.searchParams.get("limit")??20)||20));
  const db=createClient();
  const apiKey=process.env.OPENAI_API_KEY;
  const model=process.env.OPENAI_MODEL||"gpt-5";
  if(!apiKey)return NextResponse.json({message:"OPENAI_API_KEY missing"},{status:500});

  const q=await db.from("problem_bank_questions")
    .select("id,title,question_no,answer,question_image_path,source_file_id,analysis_question_id,crop_height,problem_dna,status")
    .eq("question_type","multiple_choice")
    .lt("crop_height",8)
    .order("id",{ascending:true})
    .range(offset,offset+limit-1);
  if(q.error)throw q.error;
  const rows=q.data??[];
  const sourceIds=[...new Set(rows.map((x:any)=>x.source_file_id).filter(Boolean))];
  const sf=sourceIds.length?await db.from("source_files").select("id,exam_pdf_path").in("id",sourceIds):{data:[],error:null};
  if(sf.error)throw sf.error;
  const sourceMap=new Map((sf.data??[]).map((x:any)=>[String(x.id),x.exam_pdf_path]));
  const results:any[]=[];

  for(let start=0;start<rows.length;start+=5){
    const chunk=rows.slice(start,start+5);
    const done=await Promise.all(chunk.map(async(row:any)=>{
      try{
        if(!row.question_image_path)return {id:row.id,error:"no image"};
        const pdfPath=sourceMap.get(String(row.source_file_id));
        if(!pdfPath)return {id:row.id,error:"no pdf"};
        const [pdf,image]=await Promise.all([
          db.storage.from("exam-pdf").createSignedUrl(String(pdfPath),900),
          db.storage.from("question-images").createSignedUrl(String(row.question_image_path),900),
        ]);
        if(pdf.error||image.error)return {id:row.id,error:pdf.error?.message||image.error?.message};
        const audit=await auditOne({apiKey,model,pdfUrl:pdf.data.signedUrl,imageUrl:image.data.signedUrl,title:String(row.title??""),answer:String(row.answer??""),questionNo:Number(row.question_no??0)});
        const confirmed=audit.clipped===true && audit.confidence>=0.75;
        const auditMeta={objectiveCropAudit:{...audit,confirmed,checkedAt:new Date().toISOString(),rule:"objective-crop-height-lt8"}};
        if(row.analysis_question_id){
          const aq=await db.from("analysis_questions").select("ai_result").eq("id",row.analysis_question_id).maybeSingle();
          if(!aq.error&&aq.data)await db.from("analysis_questions").update({ai_result:{...(aq.data.ai_result??{}),...auditMeta},updated_at:new Date().toISOString()}).eq("id",row.analysis_question_id);
        }
        if(confirmed){
          const dna=row.problem_dna??{};
          await db.from("problem_bank_questions").update({
            status:"QUARANTINED",
            problem_dna:{...dna,errorReview:{open:true,kind:"CROP_CLIPPED",reason:audit.reason,confidence:audit.confidence,checkedAt:new Date().toISOString()}},
            updated_at:new Date().toISOString()
          }).eq("id",row.id);
        }
        return {id:row.id,title:row.title,cropHeight:row.crop_height,...audit,confirmed,status:confirmed?"QUARANTINED":row.status};
      }catch(e){return {id:row.id,title:row.title,error:e instanceof Error?e.message:String(e)}}
    }));
    results.push(...done);
  }
  return NextResponse.json({success:true,offset,limit,count:rows.length,confirmed:results.filter(x=>x.confirmed).length,results});
}
