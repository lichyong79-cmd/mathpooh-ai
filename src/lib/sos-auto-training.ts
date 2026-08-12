import { clampMeter, distanceFromTarget, meterLabel, trainingTargets } from "@/lib/difficulty-meter";
import { problemSubunit } from "@/lib/subunit-key";

const compact=(v:unknown)=>String(v??"").replace(/\s+/g,"").toLowerCase();
const related=(a:unknown,b:unknown)=>{
  const x=compact(a),y=compact(b);
  return !!(x&&y&&(x.includes(y)||y.includes(x)));
};

function matchScore(problem:any,target:any){
  let value=0;
  const types=Array.isArray(target?.types)?target.types:[];
  const dna=JSON.stringify(problem?.problem_dna??{});
  if(types.some((x:any)=>
    related(x?.label,problem?.topic) ||
    related(x?.label,problem?.question_type) ||
    related(x?.label,dna)
  )) value+=30;

  const sourceType=String(target?.sourceType??target?.sourceTopic??"");
  if(sourceType && (
    related(sourceType,problem?.topic) ||
    related(sourceType,problem?.question_type) ||
    related(sourceType,dna)
  )) value+=40;

  return value;
}

function choose(pool:any[],targets:Array<{meter:number;role:string}>,used:Set<string>){
  const selected:any[]=[];
  for(const target of targets){
    const candidate=pool
      .filter((p)=>!used.has(String(p.id)))
      .map((p)=>({
        ...p,
        meterDistance:distanceFromTarget(Number(p.meter),target.meter),
      }))
      .sort((a,b)=>
        // 훈련의 1순위는 학생 미터에 맞는 난이도다.
        // 유형 유사도는 같은 거리에서만 보조 기준으로 사용한다.
        a.meterDistance-b.meterDistance ||
        Number(b.match)-Number(a.match) ||
        String(a.id).localeCompare(String(b.id))
      )[0];
    if(!candidate)continue;
    used.add(String(candidate.id));
    selected.push({...candidate,role:target.role,targetMeter:target.meter});
  }
  return selected;
}

export async function autoCreateTrainingFromDiagnosis(args:{
  supabase:any;
  studentId:string;
  diagnosisSessionId:string;
}){
  const {supabase,studentId,diagnosisSessionId}=args;

  const diagnosisResult=await supabase
    .from("sos_training_sessions")
    .select("id,student_id,phase,status,target_snapshot,correct_count,sos_training_items(problem_id)")
    .eq("id",diagnosisSessionId)
    .eq("student_id",studentId)
    .single();
  if(diagnosisResult.error||!diagnosisResult.data)
    throw new Error(diagnosisResult.error?.message||"완료된 진단을 찾을 수 없습니다.");

  const diagnosis:any=diagnosisResult.data;
  if(diagnosis.phase!=="DIAGNOSIS"||!["COMPLETED","PASSED"].includes(String(diagnosis.status)))
    throw new Error("진단 완료 후에만 훈련을 자동 생성할 수 있습니다.");

  // 같은 진단에서 이미 자동/수동 훈련이 생겼으면 중복 생성하지 않는다.
  const existing=await supabase
    .from("sos_training_sessions")
    .select("id,status")
    .eq("student_id",studentId)
    .eq("phase","TRAINING")
    .eq("parent_session_id",diagnosisSessionId)
    .limit(1);
  if(existing.error)throw existing.error;
  if((existing.data??[]).length){
    return {created:false,existing:true,session:(existing.data??[])[0]};
  }

  const target=diagnosis.target_snapshot??{};
  const targetKey=String(target.subunitKey??"");
  const targetUnit=String(target.subunit??target.sourceUnit??"").trim();
  const targetSubject=String(target.subject??target.sourceSubject??"").trim();

  if(!targetKey&&!targetUnit)throw new Error("진단 소단원 정보가 없어 훈련을 자동 생성할 수 없습니다.");

  const meterResult=targetKey
    ? await supabase
        .from("sos_student_subunit_meters")
        .select("difficulty_meter")
        .eq("student_id",studentId)
        .eq("subunit_key",targetKey)
        .maybeSingle()
    : {data:null,error:null};

  if(meterResult.error)throw meterResult.error;
  const studentMeter=clampMeter(
    meterResult.data?.difficulty_meter,
    Number(target.studentDifficultyMeter)||Number(target.sourceDifficulty)||3,
  );

  const [problemsResult,previousResult]=await Promise.all([
    supabase
      .from("problem_bank_questions")
      .select("id,title,problem_code,subject,unit,topic,difficulty,difficulty_meter,question_type,problem_dna,training_course")
      .eq("status","ACTIVE")
      .eq("content_role","TRAINING"),
    supabase
      .from("sos_training_sessions")
      .select("id,sos_training_items(problem_id)")
      .eq("student_id",studentId),
  ]);
  if(problemsResult.error)throw problemsResult.error;
  if(previousResult.error)throw previousResult.error;

  const used=new Set<string>();
  for(const s of previousResult.data??[]){
    for(const i of s.sos_training_items??[])used.add(String(i.problem_id));
  }

  const pool=(problemsResult.data??[])
    .map((p:any)=>{
      const info=problemSubunit(p);
      return {
        ...p,
        info,
        meter:clampMeter(p.difficulty_meter,Number(p.difficulty)||3),
        match:matchScore(p,target),
      };
    })
    .filter((p:any)=>{
      if(!p.info?.subunit)return false;
      if(targetSubject && !related(targetSubject,p.info.subject))return false;
      if(targetKey && p.info.key===targetKey)return true;
      return !targetKey && targetUnit && related(targetUnit,p.info.subunit);
    });

  const selected=choose(pool,trainingTargets(studentMeter),used);
  if(selected.length<10)
    throw new Error(`같은 소단원 훈련 문항이 부족합니다. ${selected.length}/10문항`);

  const now=new Date().toISOString();
  const snapshot={
    ...target,
    autoGenerated:true,
    autoGeneratedFromDiagnosis:diagnosisSessionId,
    diagnosisCorrect:Number(diagnosis.correct_count??0),
    studentDifficultyMeter:studentMeter,
    studentDifficultyLabel:meterLabel(studentMeter),
    meterSystem:"sos8-subunit-dynamic-v1",
  };

  const sessionResult=await supabase
    .from("sos_training_sessions")
    .insert({
      student_id:studentId,
      phase:"TRAINING",
      status:"ASSIGNED",
      target_snapshot:snapshot,
      parent_session_id:diagnosisSessionId,
      round_no:1,
      total_count:10,
      created_at:now,
      updated_at:now,
    })
    .select()
    .single();
  if(sessionResult.error||!sessionResult.data)
    throw new Error(sessionResult.error?.message||"훈련 자동 생성 실패");

  const session:any=sessionResult.data;
  const itemsResult=await supabase
    .from("sos_training_items")
    .insert(selected.map((p:any,index:number)=>({
      session_id:session.id,
      problem_id:p.id,
      item_order:index+1,
      item_role:`${p.role} · ${p.info.subunit} · 목표 ${p.targetMeter.toFixed(2)} / 문항 ${p.meter.toFixed(2)}`,
      subunit_key:p.info.key,
    })));
  if(itemsResult.error){
    await supabase.from("sos_training_sessions").delete().eq("id",session.id);
    throw itemsResult.error;
  }

  return {
    created:true,
    existing:false,
    session,
    studentMeter,
    selected:selected.map((p:any)=>({
      id:p.id,
      role:p.role,
      meter:p.meter,
      targetMeter:p.targetMeter,
    })),
  };
}
