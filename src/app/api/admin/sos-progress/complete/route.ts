import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {getAdminUser} from "@/lib/supabase/auth";

export async function POST(request:Request){
  const user=await getAdminUser();
  if(!user)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
  try{
    const body=await request.json();
    const sessionId=String(body.sessionId??"");
    if(!sessionId)return NextResponse.json({message:"완료할 단계를 확인해 주세요."},{status:400});
    const supabase=createClient();
    const found=await supabase.from("sos_training_sessions")
      .select("id,student_id,phase,status,total_count,correct_count,sos_training_items(id,student_answer,answered_at,is_correct)")
      .eq("id",sessionId).maybeSingle();
    if(found.error||!found.data)return NextResponse.json({message:found.error?.message||"단계를 찾지 못했습니다."},{status:404});
    const session:any=found.data;
    if(["COMPLETED","PASSED"].includes(String(session.status)))return NextResponse.json({success:true,alreadyCompleted:true});
    if(!["IN_PROGRESS","RETRAIN"].includes(String(session.status)))return NextResponse.json({message:"진행 중이거나 오답 중인 단계만 완료할 수 있습니다."},{status:409});
    const items:any[]=session.sos_training_items??[];
    const total=Number(session.total_count??items.length);
    const answered=items.filter(i=>i.answered_at||String(i.student_answer??"").trim()).length;
    if(!total||answered<total)return NextResponse.json({message:`전체 문항 응답 후 완료할 수 있습니다. (${answered}/${total})`},{status:409});
    const correct=items.filter(i=>i.is_correct===true).length;
    const now=new Date().toISOString();
    const updated=await supabase.from("sos_training_sessions").update({
      status:"COMPLETED",correct_count:correct,decision:"ADMIN_STAGE_COMPLETED",updated_at:now
    }).eq("id",sessionId).in("status",["IN_PROGRESS","RETRAIN"]).select("id").maybeSingle();
    if(updated.error)return NextResponse.json({message:updated.error.message},{status:400});
    if(!updated.data)return NextResponse.json({message:"다른 작업에서 단계 상태가 변경되었습니다. 새로고침해 주세요."},{status:409});
    await supabase.from("sos_training_activity_logs").insert({
      session_id:sessionId,item_id:null,student_id:session.student_id,event_type:"ADMIN_STAGE_COMPLETED",
      detail:{adminEmail:String(user.email??""),previousStatus:String(session.status),answered,total,correct,forced:true},occurred_at:now
    });
    return NextResponse.json({success:true,sessionId,status:"COMPLETED",answered,total,correct});
  }catch(error){
    return NextResponse.json({message:error instanceof Error?error.message:"단계 완료 처리 실패"},{status:500});
  }
}
