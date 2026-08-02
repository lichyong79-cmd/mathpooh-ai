import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

async function admin() { const user=await getSessionUser(); return !user||["student","parent"].includes(user.user_metadata?.role)?null:{supabase:createClient()}; }
const compact=(v:unknown)=>String(v??"").replace(/\s+/g,"").toLowerCase();
const related=(a:unknown,b:unknown)=>{const x=compact(a),y=compact(b);return !!(x&&y&&(x.includes(y)||y.includes(x)));};
const tableMessage=(m:string)=>m.includes("does not exist")?"먼저 supabase-v2.9-training-engine.sql을 실행해 주세요.":m;
function score(problem:any,target:any){let value=0;const units=Array.isArray(target.units)?target.units:[];const types=Array.isArray(target.types)?target.types:[];if(units.some((x:any)=>related(x.label,problem.unit)||related(x.label,problem.topic)))value+=60;const dna=JSON.stringify(problem.problem_dna??{});if(types.some((x:any)=>related(x.label,problem.topic)||related(x.label,problem.question_type)||related(x.label,dna)))value+=30;return value;}
function take(pool:any[],count:number,used:Set<string>,test:(x:any)=>boolean,role:string){const out:any[]=[];for(const item of pool){if(out.length>=count)break;if(!used.has(item.id)&&test(item)){used.add(item.id);out.push({...item,role});}}return out;}

export async function GET(request:Request){const ctx=await admin();if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});const studentId=new URL(request.url).searchParams.get("studentId");if(!studentId)return NextResponse.json({sessions:[]});const {data,error}=await ctx.supabase.from("sos_training_sessions").select("*,sos_training_items(problem_id,item_order,item_role,is_correct)").eq("student_id",studentId).order("created_at",{ascending:false});return error?NextResponse.json({message:tableMessage(error.message)},{status:400}):NextResponse.json({sessions:data??[]});}

export async function POST(request:Request){
  const ctx=await admin();if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
  const body=await request.json();const studentId=String(body.studentId??"");const action=String(body.action??"");const target=body.target??{};
  if(!studentId)return NextResponse.json({message:"학생을 선택해 주세요."},{status:400});
  const {data:previous}=await ctx.supabase.from("sos_training_sessions").select("id,phase,round_no,sos_training_items(problem_id)").eq("student_id",studentId);
  const used=new Set<string>();if(action==="additional-diagnosis")for(const s of previous??[])if(s.phase==="DIAGNOSIS")for(const i of s.sos_training_items??[])used.add(String(i.problem_id));
  const {data:problems,error}=await ctx.supabase.from("problem_bank_questions").select("id,title,problem_code,unit,topic,difficulty,question_type,problem_dna,training_course").eq("status","ACTIVE").eq("content_role","TRAINING");
  if(error)return NextResponse.json({message:error.message},{status:400});
  const pool=(problems??[]).map((p:any)=>({...p,d:Number(p.difficulty),match:score(p,target)})).filter((p:any)=>p.match>0).sort((a:any,b:any)=>b.match-a.match||a.d-b.d);
  let selected:any[]=[];let phase="DIAGNOSIS";let roundNo=1;let parentSessionId=String(body.parentSessionId??"")||null;
  if(action==="generate-diagnosis"||action==="additional-diagnosis"){
    roundNo=action==="additional-diagnosis"?Math.max(1,...(previous??[]).filter((s:any)=>s.phase==="DIAGNOSIS").map((s:any)=>Number(s.round_no)))+1:1;
    selected=[...take(pool,1,used,(p)=>p.d<=2,"선수개념 확인"),...take(pool,1,used,(p)=>p.d>=2&&p.d<=3,"직접 적용"),...take(pool,1,used,(p)=>p.d>=3,"변형·복합 적용")];
  }else if(action==="generate-training"){
    phase="TRAINING";const correct=Math.max(0,Math.min(3,Number(body.diagnosticCorrect??0)));const max=correct<=1?2:correct===2?3:5;
    selected=[...take(pool,2,used,(p)=>p.d<=Math.min(2,max),"개념 확인"),...take(pool,3,used,(p)=>p.d<=Math.min(3,max),"대표유형"),...take(pool,3,used,(p)=>p.d>=2&&p.d<=max,"변형 적용"),...take(pool,2,used,(p)=>p.d>=Math.max(2,max-1)&&p.d<=max,"실전·검증")];
  }else return NextResponse.json({message:"지원하지 않는 작업입니다."},{status:400});
  const required=phase==="DIAGNOSIS"?3:10;if(selected.length<required)return NextResponse.json({message:`${phase==="DIAGNOSIS"?"진단":"훈련"} 문항 부족: ${selected.length}/${required}문항만 매칭됩니다.`,matched:selected.length,required},{status:409});
  const {data:session,error:sessionError}=await ctx.supabase.from("sos_training_sessions").insert({student_id:studentId,phase,status:"DRAFT",target_snapshot:target,parent_session_id:parentSessionId,round_no:roundNo,total_count:required}).select().single();
  if(sessionError||!session)return NextResponse.json({message:tableMessage(sessionError?.message||"생성 실패")},{status:400});
  const {error:itemError}=await ctx.supabase.from("sos_training_items").insert(selected.slice(0,required).map((p,index)=>({session_id:session.id,problem_id:p.id,item_order:index+1,item_role:p.role})));
  if(itemError){await ctx.supabase.from("sos_training_sessions").delete().eq("id",session.id);return NextResponse.json({message:tableMessage(itemError.message)},{status:400});}
  return NextResponse.json({session,items:selected.slice(0,required)});
}
