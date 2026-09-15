import {NextResponse} from "next/server";
import {getAdminUser} from "@/lib/supabase/auth";
import {createClient} from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export async function GET(){
 if(!await getAdminUser())return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
 const db=createClient();
 const [bank,ai]=await Promise.all([
  db.from("problem_bank_questions").select("id,title,problem_code,subject,answer,summary,source_file_id,problem_dna,updated_at").eq("status","HOLD").eq("problem_dna->errorReview->>open","true").order("updated_at",{ascending:false}).limit(500),
  db.from("sos_ai_generated_questions").select("id,subject,question_text,display_latex,answer,solution,verification,updated_at").eq("status","DISABLED").eq("verification->errorReview->>open","true").order("updated_at",{ascending:false}).limit(500)
 ]);
 if(bank.error||ai.error)return NextResponse.json({message:bank.error?.message||ai.error?.message},{status:500});
 const items=[...(bank.data??[]).map((p:any)=>({...p,kind:"bank",review:p.problem_dna?.errorReview,problem_dna:undefined})),...(ai.data??[]).map((p:any)=>({...p,kind:"ai",review:p.verification?.errorReview,verification:undefined}))];
 return NextResponse.json({items:items.sort((a,b)=>b.updated_at.localeCompare(a.updated_at))});
}
export async function POST(request:Request){
 const admin=await getAdminUser();if(!admin)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
 try{
 const b=await request.json();const {id,kind,action}=b;
 if(!/^[0-9a-f-]{36}$/i.test(String(id))||!["bank","ai"].includes(kind)||!["report","save","restore"].includes(action))return NextResponse.json({message:"요청값을 확인해 주세요."},{status:400});
 const db=createClient(),table=kind==="bank"?"problem_bank_questions":"sos_ai_generated_questions",field=kind==="bank"?"problem_dna":"verification";
 const found=await db.from(table).select(`id,status,updated_at,${field}`).eq("id",id).single();if(found.error)throw found.error;
 const row:any=found.data,meta=row[field]??{},old=meta.errorReview??{},now=new Date().toISOString();
 const update:any={updated_at:now};
 if(action==="report"){
  const reason=String(b.reason??"").trim();if(!reason)return NextResponse.json({message:"오류 사유를 입력해 주세요."},{status:400});
  update.status=kind==="bank"?"HOLD":"DISABLED";
  update[field]={...meta,errorReview:{...old,open:true,reason:reason.slice(0,2000),reportedAt:now,reportedBy:admin.id,previousStatus:old.open?old.previousStatus:row.status}};
 }else{
  if(!old.open)return NextResponse.json({message:"오류 보관함에 있는 문항만 처리할 수 있습니다."},{status:409});
  if(action==="save"){
   const answer=String(b.answer??"").trim();if(!answer)return NextResponse.json({message:"정답을 입력해 주세요."},{status:400});
   update.answer=answer.slice(0,2000);
   if(kind==="ai"){
    update.question_text=String(b.question??"").trim();update.display_latex=update.question_text;update.render_blocks=[];
    update.solution=String(b.solution??"").trim();
    if(!update.question_text||!update.solution)return NextResponse.json({message:"문제와 해설을 입력해 주세요."},{status:400});
   }else update.summary=String(b.summary??"").slice(0,10000);
   update[field]={...meta,errorReview:{...old,editedAt:now,editedBy:admin.id}};
  }else{
   if(b.reviewed!==true)return NextResponse.json({message:"문제·정답·해설 검수 확인이 필요합니다."},{status:400});
   update.status=old.previousStatus??(kind==="bank"?"ACTIVE":"READY");
   update[field]={...meta,errorReview:{...old,open:false,resolvedAt:now,resolvedBy:admin.id}};
  }
 }
 const saved=await db.from(table).update(update).eq("id",id).eq("updated_at",row.updated_at).select("id").maybeSingle();if(saved.error)throw saved.error;
 if(!saved.data)return NextResponse.json({message:"다른 곳에서 수정됐습니다. 새로고침 후 다시 시도해 주세요."},{status:409});
 return NextResponse.json({success:true});
 }catch(e){return NextResponse.json({message:e instanceof Error?e.message:(e as any)?.message??"처리하지 못했습니다."},{status:500});}
}
