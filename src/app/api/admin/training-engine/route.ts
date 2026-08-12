import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import {
  clampMeter,
  diagnosisTargets,
  distanceFromTarget,
  meterLabel,
  nextProblemMeter,
  nextStudentMeter,
  trainingTargets,
} from "@/lib/difficulty-meter";
import { problemSubunit } from "@/lib/subunit-key";
import { recordTrainingResult } from "@/lib/sos-training-result";

async function admin() {
  const user = await getSessionUser();
  return !user || ["student","parent"].includes(user.user_metadata?.role)
    ? null
    : { supabase: createClient() };
}

const compact=(v:unknown)=>String(v??"").replace(/\s+/g,"").toLowerCase();
const related=(a:unknown,b:unknown)=>{
  const x=compact(a),y=compact(b);
  return !!(x&&y&&(x.includes(y)||y.includes(x)));
};
const tableMessage=(m:string)=>m.includes("does not exist")
  ? "먼저 supabase-v3.1-subunit-difficulty-link.sql을 실행해 주세요."
  : m;

function score(problem:any,target:any){
  let value=0;
  const units=Array.isArray(target.units)?target.units:[];
  const types=Array.isArray(target.types)?target.types:[];
  const info=problemSubunit(problem);

  if(units.some((x:any)=>
    related(x.label,info.subunit) ||
    related(x.label,problem.unit) ||
    related(x.label,problem.topic)
  )) value+=70;

  const dna=JSON.stringify(problem.problem_dna??{});
  if(types.some((x:any)=>
    related(x.label,problem.topic) ||
    related(x.label,problem.question_type) ||
    related(x.label,dna)
  )) value+=30;

  return value;
}

function selectByMeter(pool:any[], targets:Array<{meter:number;role:string}>, used:Set<string>) {
  const selected:any[]=[];

  for(const target of targets){
    const candidate=pool
      .filter((p)=>!used.has(String(p.id)))
      .map((p)=>({
        ...p,
        meterDistance:distanceFromTarget(Number(p.meter),target.meter),
      }))
      .sort((a,b)=>
        a.meterDistance-b.meterDistance ||
        Number(b.match)-Number(a.match) ||
        String(a.id).localeCompare(String(b.id))
      )[0];

    if(!candidate) continue;
    used.add(String(candidate.id));
    selected.push({...candidate, role:target.role, targetMeter:target.meter});
  }

  return selected;
}

async function loadSubunitMeter(supabase:any, studentId:string, info:{subject:string;major:string;subunit:string;key:string}, fallback:number) {
  const result=await supabase
    .from("sos_student_subunit_meters")
    .select("id,difficulty_meter,sample_count")
    .eq("student_id",studentId)
    .eq("subunit_key",info.key)
    .maybeSingle();

  if(result.error) throw result.error;

  if(result.data) {
    return {
      id:String(result.data.id),
      meter:clampMeter(result.data.difficulty_meter,fallback),
      samples:Number(result.data.sample_count??0),
    };
  }

  const inserted=await supabase
    .from("sos_student_subunit_meters")
    .insert({
      student_id:studentId,
      subject:info.subject,
      major_unit:info.major,
      subunit:info.subunit,
      subunit_key:info.key,
      difficulty_meter:clampMeter(fallback,3),
      sample_count:0,
    })
    .select("id,difficulty_meter,sample_count")
    .single();

  if(inserted.error) throw inserted.error;

  return {
    id:String(inserted.data.id),
    meter:clampMeter(inserted.data.difficulty_meter,fallback),
    samples:Number(inserted.data.sample_count??0),
  };
}

export async function GET(request:Request){
  const ctx=await admin();
  if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});

  const studentId=new URL(request.url).searchParams.get("studentId");
  if(!studentId)return NextResponse.json({sessions:[],subunitMeters:[]});

  const [sessionResult,meterResult]=await Promise.all([
    ctx.supabase
      .from("sos_training_sessions")
      .select("*,sos_training_items(id,problem_id,item_order,item_role,is_correct,response_seconds,subunit_key,student_meter_before,student_meter_after,problem_meter_before,problem_meter_after)")
      .eq("student_id",studentId)
      .order("created_at",{ascending:false}),
    ctx.supabase
      .from("sos_student_subunit_meters")
      .select("subject,major_unit,subunit,subunit_key,difficulty_meter,sample_count,updated_at")
      .eq("student_id",studentId)
      .order("subject")
      .order("major_unit")
      .order("subunit"),
  ]);

  const error=sessionResult.error||meterResult.error;
  return error
    ? NextResponse.json({message:tableMessage(error.message)},{status:400})
    : NextResponse.json({
        sessions:sessionResult.data??[],
        subunitMeters:meterResult.data??[],
      });
}

export async function POST(request:Request){
  const ctx=await admin();
  if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});

  const body=await request.json();
  const studentId=String(body.studentId??"");
  const action=String(body.action??"");
  const target=body.target??{};

  if(!studentId)return NextResponse.json({message:"학생을 선택해 주세요."},{status:400});

  if(action==="cancel-session"){
    const sessionId=String(body.sessionId??"");
    if(!sessionId)return NextResponse.json({message:"취소할 진단·훈련 ID가 없습니다."},{status:400});

    const sessionResult=await ctx.supabase
      .from("sos_training_sessions")
      .select("id,status,phase")
      .eq("id",sessionId)
      .eq("student_id",studentId)
      .maybeSingle();

    if(sessionResult.error)return NextResponse.json({message:sessionResult.error.message},{status:400});
    if(!sessionResult.data)return NextResponse.json({message:"진단·훈련을 찾을 수 없습니다."},{status:404});

    const currentStatus=String(sessionResult.data.status??"");
    if(!["DRAFT","ASSIGNED"].includes(currentStatus))
      return NextResponse.json({message:"학생이 이미 시작한 진단·훈련은 취소할 수 없습니다."},{status:409});

    const itemDelete=await ctx.supabase.from("sos_training_items").delete().eq("session_id",sessionId);
    if(itemDelete.error)return NextResponse.json({message:itemDelete.error.message},{status:400});

    const sessionDelete=await ctx.supabase.from("sos_training_sessions").delete().eq("id",sessionId);
    if(sessionDelete.error)return NextResponse.json({message:sessionDelete.error.message},{status:400});

    return NextResponse.json({success:true,cancelled:sessionId});
  }

  // 관리자 수동 채점/검증용. 학생 화면 제출도 동일한 공통 엔진을 사용한다.
  if(action==="record-result"){
    const itemId=String(body.itemId??"");
    if(!itemId)return NextResponse.json({message:"훈련 문항 ID가 없습니다."},{status:400});
    try{
      const result=await recordTrainingResult({
        supabase:ctx.supabase,
        studentId,
        itemId,
        studentAnswer:String(body.studentAnswer??""),
        responseSeconds:Number(body.responseSeconds??0)||null,
      });
      return NextResponse.json({success:true,...result});
    }catch(error){
      return NextResponse.json({message:error instanceof Error?error.message:"난이도 미터 반영 실패"},{status:400});
    }
  }

  const {data:previous}=await ctx.supabase
    .from("sos_training_sessions")
    .select("id,phase,round_no,sos_training_items(problem_id)")
    .eq("student_id",studentId);

  const used=new Set<string>();
  if(action==="additional-diagnosis"){
    for(const s of previous??[])if(s.phase==="DIAGNOSIS")
      for(const i of s.sos_training_items??[])used.add(String(i.problem_id));
  }

  const {data:problems,error}=await ctx.supabase
    .from("problem_bank_questions")
    .select("id,title,problem_code,subject,unit,topic,difficulty,difficulty_meter,difficulty_meter_unique_students,difficulty_meter_origin,question_type,problem_dna,training_course")
    .eq("status","ACTIVE")
    .eq("content_role","TRAINING");

  if(error)return NextResponse.json({message:error.message},{status:400});

  const targetUnit=String(
    target?.subunit ||
    target?.sourceUnit ||
    target?.units?.[0]?.label ||
    ""
  ).trim();
  const targetSubject=String(
    target?.subject ||
    target?.sourceSubject ||
    ""
  ).trim();

  // 같은 과목 + 같은 소단원 안에서만 진단/훈련 문항을 찾는다.
  const sameSubunitPool=(problems??[])
    .map((p:any)=>{
      const info=problemSubunit(p);
      return {
        ...p,
        subunitInfo:info,
        meter:clampMeter(p.difficulty_meter,Number(p.difficulty)||3),
        match:score(p,target),
      };
    })
    .filter((p:any)=>{
      if(!p.subunitInfo?.subunit) return false;
      if(targetSubject && !related(targetSubject,p.subunitInfo.subject)) return false;
      // SOS_NO1의 소단원이 명시되어 있으면 유형 점수(match)와 무관하게
      // 같은 소단원 전체를 후보로 둔다. 유형은 동률 보조 기준일 뿐이다.
      if(targetUnit) return related(targetUnit,p.subunitInfo.subunit);
      return p.match>0;
    });

  if(!sameSubunitPool.length)
    return NextResponse.json({
      message:`같은 소단원에서 진단/훈련 문항을 찾지 못했습니다. 대상 소단원: ${targetUnit||"미지정"}`,
    },{status:409});

  const referenceProblem=sameSubunitPool
    .sort((a:any,b:any)=>Number(b.match)-Number(a.match))[0];

  const info=referenceProblem.subunitInfo;
  let meterRow;
  try {
    meterRow=await loadSubunitMeter(
      ctx.supabase,
      studentId,
      info,
      Number(target.sourceDifficulty)||Number(referenceProblem.difficulty)||3
    );
  } catch(error) {
    return NextResponse.json({message:error instanceof Error?error.message:"학생 소단원 미터 조회 실패"},{status:400});
  }

  const studentMeter=meterRow.meter;
  let selected:any[]=[];
  let phase="DIAGNOSIS";
  let roundNo=1;
  const parentSessionId=String(body.parentSessionId??"")||null;

  if(action==="generate-diagnosis"||action==="additional-diagnosis"){
    roundNo=action==="additional-diagnosis"
      ? Math.max(1,...(previous??[]).filter((s:any)=>s.phase==="DIAGNOSIS").map((s:any)=>Number(s.round_no)))+1
      : 1;
    selected=selectByMeter(sameSubunitPool,diagnosisTargets(studentMeter),used);
  }else if(action==="generate-training"){
    if(parentSessionId){
      const parent=await ctx.supabase
        .from("sos_training_sessions")
        .select("id,phase,status,correct_count")
        .eq("id",parentSessionId)
        .eq("student_id",studentId)
        .maybeSingle();
      if(parent.error)return NextResponse.json({message:parent.error.message},{status:400});
      if(!parent.data||parent.data.phase!=="DIAGNOSIS"||!["COMPLETED","PASSED"].includes(String(parent.data.status)))
        return NextResponse.json({message:"학생이 진단을 제출한 뒤 훈련을 생성해 주세요."},{status:409});
    }
    phase="TRAINING";
    selected=selectByMeter(sameSubunitPool,trainingTargets(studentMeter),used);
  }else{
    return NextResponse.json({message:"지원하지 않는 작업입니다."},{status:400});
  }

  const required=phase==="DIAGNOSIS"?3:10;
  if(selected.length<required)
    return NextResponse.json({
      message:`같은 소단원 문항 부족: ${selected.length}/${required}문항만 매칭됩니다. (${info.subunit})`,
      matched:selected.length,
      required,
      subunit:info.subunit,
      studentMeter,
    },{status:409});

  const snapshot={
    ...target,
    subject:info.subject,
    majorUnit:info.major,
    subunit:info.subunit,
    subunitKey:info.key,
    studentDifficultyMeter:studentMeter,
    studentDifficultyLabel:meterLabel(studentMeter),
    meterSystem:"sos8-subunit-dynamic-v1",
  };

  const {data:session,error:sessionError}=await ctx.supabase
    .from("sos_training_sessions")
    .insert({
      student_id:studentId,
      phase,
      status:"ASSIGNED",
      target_snapshot:snapshot,
      parent_session_id:parentSessionId,
      round_no:roundNo,
      total_count:required,
    })
    .select()
    .single();

  if(sessionError||!session)
    return NextResponse.json({message:tableMessage(sessionError?.message||"생성 실패")},{status:400});

  const {error:itemError}=await ctx.supabase
    .from("sos_training_items")
    .insert(selected.slice(0,required).map((p,index)=>({
      session_id:session.id,
      problem_id:p.id,
      item_order:index+1,
      item_role:`${p.role} · ${info.subunit} · 목표 ${p.targetMeter.toFixed(2)} / 문항 ${p.meter.toFixed(2)}`,
      subunit_key:info.key,
    })));

  if(itemError){
    await ctx.supabase.from("sos_training_sessions").delete().eq("id",session.id);
    return NextResponse.json({message:tableMessage(itemError.message)},{status:400});
  }

  return NextResponse.json({
    session,
    scope:info,
    studentMeter,
    studentDifficultyLabel:meterLabel(studentMeter),
    items:selected.slice(0,required),
  });
}
