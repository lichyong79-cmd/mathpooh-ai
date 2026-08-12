import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

async function adminContext() {
  const user = await getSessionUser();
  if (!user || ["student","parent"].includes(user.user_metadata?.role)) return null;
  return { supabase:createClient() };
}

async function fetchAll(build:(from:number,to:number)=>any) {
  const rows:any[]=[];
  for(let from=0;;from+=1000){
    const result=await build(from,from+999);
    if(result.error) throw result.error;
    const page=Array.isArray(result.data)?result.data:[];
    rows.push(...page);
    if(page.length<1000) break;
  }
  return rows;
}

export async function GET() {
  const ctx=await adminContext();
  if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});

  try{
    const [students,meters,problems]=await Promise.all([
      fetchAll((f,t)=>ctx.supabase
        .from("students")
        .select("id,name,school,grade,status")
        .range(f,t)),
      fetchAll((f,t)=>ctx.supabase
        .from("sos_student_subunit_meters")
        .select("student_id,subject,major_unit,subunit,subunit_key,difficulty_meter,sample_count,updated_at")
        .order("updated_at",{ascending:false})
        .range(f,t)),
      fetchAll((f,t)=>ctx.supabase
        .from("problem_bank_questions")
        .select("id,problem_code,title,question_no,subject,unit,topic,difficulty,difficulty_meter,difficulty_meter_samples,difficulty_meter_unique_students,difficulty_meter_origin,status")
        .eq("status","ACTIVE")
        .order("updated_at",{ascending:false})
        .range(f,t)),
    ]);

    const studentMap=new Map(students.map((s:any)=>[String(s.id),s]));
    const studentMeters=meters.map((m:any)=>({
      ...m,
      student:studentMap.get(String(m.student_id))??null,
    }));

    const empiricalProblems=problems.filter((p:any)=>Number(p.difficulty_meter_unique_students??0)>=20).length;
    const waitingProblems=problems.filter((p:any)=>Number(p.difficulty_meter_unique_students??0)<20).length;

    return NextResponse.json({
      success:true,
      studentMeters,
      problems,
      summary:{
        students:students.length,
        studentMeterRows:studentMeters.length,
        problems:problems.length,
        empiricalProblems,
        waitingProblems,
      },
    },{headers:{"Cache-Control":"no-store,max-age=0"}});
  }catch(error){
    return NextResponse.json({
      success:false,
      message:error instanceof Error?error.message:"바로미터 조회 실패",
    },{status:500});
  }
}
