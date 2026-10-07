import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isArchivedPracticeExam } from "@/lib/archived-practice-exams";

export const dynamic="force-dynamic";
const uuid=(v:unknown):v is string=>typeof v==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function POST(request:Request) {
  const admin=await getAdminUser();
  if(!admin)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
  const origin=request.headers.get("origin");
  if(origin && origin!==new URL(request.url).origin)return NextResponse.json({message:"잘못된 요청 출처입니다."},{status:403});
  let b:any;
  try {b=await request.json();}catch{return NextResponse.json({message:"변경할 시험지를 확인해 주세요."},{status:400});}
  if(!uuid(b?.membershipId)||!uuid(b?.examId)||!uuid(b?.expectedExamId))return NextResponse.json({message:"학생 배정과 시험지를 다시 확인해 주세요."},{status:400});
  const s=createClient();
  try {
    const selected=await s.from("exams").select("id,title,exam_date").eq("id",b.examId).maybeSingle();
    if(selected.error)throw selected.error;
    if(!selected.data || isArchivedPracticeExam(selected.data))return NextResponse.json({message:"정식 등록된 시험지를 선택해 주세요."},{status:400});
    const result=await s.rpc("sos_admin_override_paper",{
      p_membership_id:b.membershipId,p_exam_id:b.examId,p_expected_exam_id:b.expectedExamId,
      p_admin_id:admin.id,p_reason:String(b.reason??"관리자 직접 지정").slice(0,200),
    });
    if(result.error)throw result.error;
    return NextResponse.json({success:true,...result.data},{headers:{"Cache-Control":"no-store"}});
  }catch(e){
    const message=typeof e==="object"&&e&&"message" in e?String(e.message):"시험지를 변경하지 못했습니다.";
    return NextResponse.json({message},{status:409});
  }
}
