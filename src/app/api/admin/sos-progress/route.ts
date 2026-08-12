import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

async function admin(){
  const user=await getSessionUser();
  if(!user||["student","parent"].includes(user.user_metadata?.role))return null;
  return {supabase:createClient()};
}

async function all(build:(from:number,to:number)=>any){
  const rows:any[]=[];
  for(let from=0;;from+=1000){
    const result=await build(from,from+999);
    if(result.error)throw result.error;
    const page=Array.isArray(result.data)?result.data:[];
    rows.push(...page);
    if(page.length<1000)break;
  }
  return rows;
}

export async function GET(){
  const ctx=await admin();
  if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
  try{
    const [students,sessions,meters]=await Promise.all([
      all((f,t)=>ctx.supabase.from("students").select("id,name,school,grade,class_name,status").range(f,t)),
      all((f,t)=>ctx.supabase
        .from("sos_training_sessions")
        .select("id,student_id,phase,status,target_snapshot,round_no,correct_count,total_count,decision,created_at,updated_at,sos_training_items(id,item_order,student_answer,is_correct,answered_at)")
        .order("created_at",{ascending:false}).range(f,t)),
      all((f,t)=>ctx.supabase
        .from("sos_student_subunit_meters")
        .select("student_id,subject,major_unit,subunit,subunit_key,difficulty_meter,sample_count,updated_at")
        .range(f,t)),
    ]);

    const studentMap=new Map(students.map((s:any)=>[String(s.id),s]));
    const meterMap=new Map<string,any>();
    for(const m of meters){
      meterMap.set(`${m.student_id}:${m.subunit_key}`,m);
    }

    const rows=sessions.map((session:any)=>{
      const items=(session.sos_training_items??[]).sort((a:any,b:any)=>Number(a.item_order)-Number(b.item_order));
      const answered=items.filter((i:any)=>String(i.student_answer??"").trim()||i.answered_at).length;
      const correct=items.filter((i:any)=>i.is_correct===true).length;
      const snapshot=session.target_snapshot??{};
      const key=String(snapshot.subunitKey??"");
      const currentMeter=meterMap.get(`${session.student_id}:${key}`)??null;
      const initialMeter=Number(snapshot.studentDifficultyMeter??0)||null;
      const currentValue=currentMeter?Number(currentMeter.difficulty_meter):null;
      return {
        id:session.id,
        student:studentMap.get(String(session.student_id))??null,
        phase:session.phase,
        status:session.status,
        roundNo:Number(session.round_no??1),
        subject:String(snapshot.subject??snapshot.sourceSubject??""),
        majorUnit:String(snapshot.majorUnit??""),
        subunit:String(snapshot.subunit??snapshot.sourceUnit??""),
        subunitKey:key,
        initialMeter,
        currentMeter:currentValue,
        meterDelta:initialMeter!==null&&currentValue!==null?Math.round((currentValue-initialMeter)*100)/100:null,
        total:Number(session.total_count??items.length),
        answered,
        correct:session.correct_count===null||session.correct_count===undefined?correct:Number(session.correct_count),
        decision:session.decision,
        createdAt:session.created_at,
        startedAt:session.status==="IN_PROGRESS"||["COMPLETED","PASSED","RETRAIN"].includes(String(session.status))?session.updated_at:null,
        submittedAt:["COMPLETED","PASSED","RETRAIN"].includes(String(session.status))?session.updated_at:null,
        updatedAt:session.updated_at,
      };
    });

    const active=rows.filter((r:any)=>["ASSIGNED","IN_PROGRESS"].includes(String(r.status))).length;
    const inProgress=rows.filter((r:any)=>r.status==="IN_PROGRESS").length;
    const completed=rows.filter((r:any)=>["COMPLETED","PASSED","RETRAIN"].includes(String(r.status))).length;

    return NextResponse.json({
      success:true,
      rows,
      summary:{total:rows.length,active,inProgress,completed},
      serverTime:new Date().toISOString(),
    },{headers:{"Cache-Control":"no-store,max-age=0"}});
  }catch(error){
    return NextResponse.json({message:error instanceof Error?error.message:"진행현황 조회 실패"},{status:500});
  }
}
