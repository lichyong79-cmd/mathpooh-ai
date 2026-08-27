import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {getSessionUser} from "@/lib/supabase/auth";
import {calculateExamScore} from "@/lib/exam-score";

export const dynamic="force-dynamic";
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");

export async function GET(){
  const user=await getSessionUser();
  if(!user)return NextResponse.json({message:"로그인이 필요합니다."},{status:401});
  if(String(user.user_metadata?.role)!=="parent")return NextResponse.json({message:"학부모 계정으로 로그인해 주세요."},{status:403});
  const phone=digits(user.user_metadata?.parent_phone??String(user.email??"").split("@")[0]);
  if(phone.length<10)return NextResponse.json({message:"학부모 전화번호가 계정에 연결되지 않았습니다."},{status:404});
  const supabase=createClient();
  const childrenResult=await supabase.from("students").select("id,name,school,grade,status,parent_phone").eq("parent_phone",phone).order("name");
  if(childrenResult.error)return NextResponse.json({message:childrenResult.error.message},{status:400});
  const children=childrenResult.data??[];
  const ids=children.map((x:any)=>x.id);
  if(!ids.length)return NextResponse.json({parentPhone:phone,children:[],reports:[]});

  const [attemptResult,sessionResult,jobResult]=await Promise.all([
    supabase.from("exam_attempts").select("id,exam_id,student_id,status,score,correct_count,answers,wrong_numbers,unanswered_numbers,submitted_at,created_at,mathpooh_comment").in("student_id",ids).eq("status","submitted").order("submitted_at",{ascending:false}),
    supabase.from("sos_training_sessions").select("id,student_id,parent_session_id,phase,status,target_snapshot,weakness_snapshot,cycle_kind,round_no,correct_count,total_count,baseline_meter,goal_meter,training_meter,review_meter,decision,created_at,updated_at").in("student_id",ids).order("created_at",{ascending:false}),
    supabase.from("sos_ai_generation_jobs").select("student_id,status,generation_kind,requested_count,stage_message,requested_at,updated_at").in("student_id",ids).order("requested_at",{ascending:false})
  ]);
  if(attemptResult.error||sessionResult.error)return NextResponse.json({message:attemptResult.error?.message||sessionResult.error?.message},{status:400});
  const attempts=attemptResult.data??[];
  const examIds=[...new Set(attempts.map((x:any)=>x.exam_id))];
  const examsResult=examIds.length?await supabase.from("exams").select("id,title,exam_code,exam_date,subject,total_score,question_count,question_points,answer_keys").in("id",examIds):{data:[],error:null};
  const analysisResult=examIds.length?await supabase.from("exam_question_analysis").select("exam_id,question_no,major_unit,middle_unit,minor_unit,detailed_topic,difficulty").in("exam_id",examIds):{data:[],error:null};
  const examMap=new Map((examsResult.data??[]).map((x:any)=>[String(x.id),x]));
  const analysisMap=new Map<string,any[]>();
  for(const row of analysisResult.data??[]){const key=String(row.exam_id);analysisMap.set(key,[...(analysisMap.get(key)??[]),row]);}
  const label=(row:any)=>String(row.minor_unit||row.middle_unit||row.major_unit||row.detailed_topic||"미분류");
  const examRows=attempts.map((attempt:any)=>{
    const exam:any=examMap.get(String(attempt.exam_id))??{};
    const graded=calculateExamScore(attempt.answers??{},exam.answer_keys,Number(exam.question_count??0),Number(exam.total_score??100),exam.question_points);
    const units=new Map<string,{total:number;correct:number}>();
    const difficulties=new Map<string,{total:number;correct:number}>();
    for(const meta of analysisMap.get(String(attempt.exam_id))??[]){
      const no=Number(meta.question_no);const answer=String((attempt.answers??{})[no]??(attempt.answers??{})[String(no)]??"").trim();const key=String((exam.answer_keys??[])[no-1]??"").trim();const correct=Boolean(key)&&answer===key;
      const u=label(meta);const uv=units.get(u)??{total:0,correct:0};uv.total++;if(correct)uv.correct++;units.set(u,uv);
      const d=String(meta.difficulty||"미분류");const dv=difficulties.get(d)??{total:0,correct:0};dv.total++;if(correct)dv.correct++;difficulties.set(d,dv);
    }
    const bars=(m:Map<string,{total:number;correct:number}>)=>[...m].map(([name,v])=>({name,total:v.total,correct:v.correct,rate:Math.round(v.correct/Math.max(1,v.total)*100)})).sort((a,b)=>b.total-a.total);
    return {id:attempt.id,studentId:attempt.student_id,title:exam.title??"시험",examCode:exam.exam_code??"",examDate:exam.exam_date??attempt.submitted_at,subject:exam.subject??"",score:graded.score,totalScore:Number(exam.total_score??100),correct:graded.correct,total:Number(exam.question_count??0),wrong:graded.wrong,unanswered:graded.unanswered,submittedAt:attempt.submitted_at,comment:String(attempt.mathpooh_comment??""),units:bars(units),difficulties:bars(difficulties)};
  });
  const reports=children.map((child:any)=>({
    student:{id:child.id,name:child.name,school:child.school,grade:child.grade,status:child.status},
    exams:examRows.filter((x:any)=>String(x.studentId)===String(child.id)).slice(0,12),
    sos:(sessionResult.data??[]).filter((x:any)=>String(x.student_id)===String(child.id)).slice(0,40),
    generationJobs:(jobResult.data??[]).filter((x:any)=>String(x.student_id)===String(child.id)).slice(0,5)
  }));
  return NextResponse.json({parentPhone:phone,children,reports},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request:Request){
  const user=await getSessionUser();
  if(!user||String(user.user_metadata?.role)!=="parent")return NextResponse.json({message:"학부모 로그인이 필요합니다."},{status:403});
  const body=await request.json();const password=String(body.password??"");
  if(password.length<6)return NextResponse.json({message:"새 비밀번호는 6자리 이상이어야 합니다."},{status:400});
  const updated=await createClient().auth.admin.updateUserById(user.id,{password});
  return updated.error?NextResponse.json({message:updated.error.message},{status:400}):NextResponse.json({success:true});
}
