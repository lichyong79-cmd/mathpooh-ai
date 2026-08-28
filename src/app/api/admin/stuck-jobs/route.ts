import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {getAdminUser} from "@/lib/supabase/auth";

export const dynamic="force-dynamic";

/**
 * SOS306 · 막힌 AI 생성 작업 요약
 *
 * cron이 8회까지 스스로 재시도하지만(SOS295), 그마저 다 실패하면 조용히 멈춘다.
 * 지금은 AI 생성 문제은행 화면을 직접 열어봐야만 알 수 있어서,
 * 예전에 이틀 동안 방치되고 학생 두 명이 계속 대기한 일이 있었다.
 * 관리자 화면 어디에서든 눈에 띄도록 요약만 가볍게 내려준다.
 */
const MAX_ATTEMPTS=8;
const STUCK_MINUTES=40;

export async function GET(){
  if(!await getAdminUser())return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
  try{
    const supabase=createClient();
    const cutoff=new Date(Date.now()-STUCK_MINUTES*60000).toISOString();

    const rows=await supabase.from("sos_ai_generation_jobs")
      .select("id,student_id,status,attempt_count,generation_kind,stage_message,last_error,updated_at")
      .in("status",["QUEUED","FAILED","GENERATING"])
      .order("updated_at",{ascending:true})
      .limit(200);
    if(rows.error)throw rows.error;

    // 막힘 판정: 재시도 한도를 채웠거나, 오래 갱신이 없는 작업.
    // 정상 진행 중인 작업(최근에 갱신됨)은 제외한다.
    const stuck=(rows.data??[]).filter((j:any)=>
      Number(j.attempt_count??0)>=MAX_ATTEMPTS ||
      String(j.updated_at??"")<cutoff
    );

    const studentIds=[...new Set(stuck.map((j:any)=>String(j.student_id)).filter(Boolean))];
    let names:string[]=[];
    if(studentIds.length){
      const students=await supabase.from("students").select("id,name").in("id",studentIds.slice(0,20));
      names=(students.data??[]).map((s:any)=>String(s.name??"")).filter(Boolean);
    }

    return NextResponse.json({
      success:true,
      stuck:stuck.length,
      students:studentIds.length,
      names:names.slice(0,5),
      reason:stuck[0]?.last_error??stuck[0]?.stage_message??"",
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    // 배지는 부가 기능이므로 실패해도 화면을 막지 않는다.
    return NextResponse.json({success:false,stuck:0,students:0,names:[]});
  }
}
