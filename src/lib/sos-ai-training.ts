import { clampMeter, meterLabel } from "@/lib/difficulty-meter";
import { problemSubunit } from "@/lib/subunit-key";
import { sosTrainingGoalMeter } from "@/lib/sos-training-policy";
import { cycleFromSnapshot } from "@/lib/sos-cycle";

function outputText(payload:any){
  if(typeof payload?.output_text==="string") return payload.output_text.trim();
  const parts:string[]=[];
  for(const item of payload?.output??[]) for(const content of item?.content??[])
    if(typeof content?.text==="string") parts.push(content.text);
  return parts.join("\n").trim();
}

async function openAiJson(prompt:string,schema:any,content?:any[],options?:{timeoutMs?:number;effort?:"minimal"|"low"|"medium"|"high"}){
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey) throw new Error("OPENAI_API_KEY가 없습니다.");
  const model=process.env.OPENAI_ANALYSIS_MODEL||process.env.OPENAI_MODEL||"gpt-5-mini";
  const controller=new AbortController();
  const timeoutMs=Math.max(10000,Number(options?.timeoutMs??45000));
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  let response:Response;
  try{
    response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
      signal:controller.signal,
      body:JSON.stringify({
        model,
        input:[{role:"user",content:content??[{type:"input_text",text:prompt}]}],
        reasoning:{effort:options?.effort??"medium"},
        text:{format:{type:"json_schema",name:"sos_training_engine",strict:true,schema}},
      }),
    });
  }catch(error){
    if(error instanceof Error&&error.name==="AbortError")throw new Error(`AI 처리 시간이 ${Math.round(timeoutMs/1000)}초를 초과했습니다.`);
    throw error;
  }finally{clearTimeout(timeout);}
  const payload=await response.json();
  if(!response.ok) throw new Error(payload?.error?.message||"AI 연결에 실패했습니다.");
  const text=outputText(payload);
  if(!text) throw new Error("AI 분석 결과가 비어 있습니다.");
  try{return JSON.parse(text);}catch{throw new Error("AI 분석 결과 형식을 읽지 못했습니다.");}
}


export async function generateReviewHint(args:{problem:any;studentAnswer:string;attempt:number;weakness?:any}){
  const {problem,studentAnswer,attempt,weakness}=args;
  const level=Math.max(1,Math.min(2,Number(attempt)||1));
  const fallback=level===1
    ? `${problem?.topic||problem?.title||problem?.unit||"핵심 개념"}에서 어떤 조건을 먼저 식으로 옮겨야 하는지 찾아보세요.`
    : `${problem?.topic||problem?.title||problem?.unit||"핵심 개념"}의 정의·공식을 먼저 적고, 문제의 조건을 하나씩 대입해 보세요.`;
  try{
    const data=await openAiJson(`당신은 한국 고등수학 SOS 오답 코치입니다. 학생에게 정답이나 최종 수치를 절대 말하지 말고, 스스로 다시 풀 수 있는 짧은 힌트 한 개만 주세요.
힌트 단계: ${level}/2 (${level===1?"핵심 개념을 떠올리게 하는 가벼운 힌트":"첫 힌트보다 구체적인 풀이 방향"})
문항 정보: ${JSON.stringify({title:problem?.title,subject:problem?.subject,unit:problem?.unit,topic:problem?.topic,question:problem?.generatedText||problem?.generatedQuestion||"이미지 문항",difficulty:problem?.difficulty})}
학생의 직전 오답: ${studentAnswer}
진단 취약점: ${JSON.stringify(weakness||{})}
반드시 한국어 1~2문장으로만 답하고 정답·선택지 번호·최종 계산값을 노출하지 마세요.`,{
      type:"object",additionalProperties:false,properties:{hint:{type:"string"}},required:["hint"]
    });
    const aiHint=String(data?.hint??"").trim();
    return aiHint||fallback;
  }catch{return fallback;}
}

function compactDna(problem:any){
  const dna=problem?.problem_dna??{};
  const basic=dna?.basic??{};
  const concept=dna?.concept??{};
  const thinking=dna?.thinking??{};
  const abilities=dna?.abilities??{};
  const summary=dna?.summary??{};
  return {
    id:String(problem.id),
    subject:problem.subject??basic.subject??"",
    unit:problem.unit??"",
    topic:problem.topic??"",
    questionType:problem.question_type??basic.question_format??"",
    difficulty:Number(problem.difficulty??0)||null,
    meter:Number(problem.difficulty_meter??0)||null,
    major:basic.major_unit??"",
    middle:basic.middle_unit??"",
    minor:basic.minor_unit??"",
    detailed:basic.detailed_topic??"",
    coreConcepts:concept.core_concepts??concept.key_concepts??concept.primary_concepts??[],
    prerequisite:concept.prerequisite_concepts??[],
    thinking:thinking.thinking_types??thinking.process??[],
    abilities,
    summary:summary.one_line??summary.summary??"",
  };
}

async function signed(supabase:any,bucket:string,path:string|null|undefined){
  if(!path)return "";
  const result=await supabase.storage.from(bucket).createSignedUrl(path,60*20);
  return result.data?.signedUrl??"";
}

function subjectKey(value:any){return String(value??"").normalize("NFKC").replace(/[Ⅰ]/g,"1").replace(/[Ⅱ]/g,"2").replace(/\s+/g,"").toLowerCase();}

function relatedText(problem:any,terms:string[]){
  const hay=JSON.stringify(compactDna(problem)).replace(/\s+/g,"").toLowerCase();
  return terms.reduce((n,t)=>n+(t&&hay.includes(t.replace(/\s+/g,"").toLowerCase())?1:0),0);
}



function normText(value:any){
  return String(value??"").normalize("NFKC").replace(/\s+/g,"").toLowerCase();
}

function targetTerms(target:any){
  return [
    target?.sourceDetailedTopic,target?.sourceMinorUnit,target?.sourceMiddleUnit,target?.sourceMajorUnit,
    target?.sourceUnit,target?.subunit,target?.units?.[0]?.label,target?.types?.[0]?.label
  ].map((x:any)=>String(x??"").trim()).filter(Boolean);
}

function targetProblemScore(problem:any,target:any){
  const info=problemSubunit(problem);
  const terms=targetTerms(target);
  const pSubject=normText(info?.subject||problem?.subject);
  const tSubject=normText(target?.sourceSubject||target?.subject);
  if(tSubject && pSubject && pSubject!==tSubject && !pSubject.includes(tSubject) && !tSubject.includes(pSubject)) return -999;
  let score=0;
  const hay=normText(JSON.stringify(compactDna(problem)));
  for(const term of terms){
    const t=normText(term);
    if(!t)continue;
    if(normText(info?.subunit)===t) score+=110;
    else if(hay.includes(t)) score+=45;
  }
  const sourceDifficulty=Number(target?.sourceDifficulty??0);
  const d=Number(problem?.difficulty??0);
  if(sourceDifficulty&&d)score+=Math.max(0,24-Math.abs(d-sourceDifficulty)*6);
  return score;
}

async function pickThreeForTarget(args:{supabase:any;studentId:string;target:any;used:Set<string>;fallbackMeter?:number}){
  const {supabase,studentId,target,used}=args;
  const bank=await supabase.from("problem_bank_questions")
    .select("id,subject,unit,topic,difficulty,difficulty_meter,question_type,problem_dna")
    .eq("status","ACTIVE").eq("content_role","TRAINING");
  if(bank.error)throw bank.error;

  const ranked=(bank.data??[])
    .filter((p:any)=>!used.has(String(p.id)))
    .map((p:any)=>({...p,info:problemSubunit(p),meter:clampMeter(p.difficulty_meter,Number(p.difficulty)||3),targetScore:targetProblemScore(p,target)}))
    .filter((p:any)=>p.targetScore>0)
    .sort((a:any,b:any)=>b.targetScore-a.targetScore||String(a.id).localeCompare(String(b.id)));

  if(ranked.length<3)return null;

  const bestInfo=ranked[0].info;
  let meter=Number(args.fallbackMeter)||Number(target?.studentDifficultyMeter)||Number(target?.sourceDifficulty)||3;
  if(bestInfo?.key){
    const meterRow=await supabase.from("sos_student_subunit_meters")
      .select("difficulty_meter").eq("student_id",studentId).eq("subunit_key",bestInfo.key).maybeSingle();
    if(!meterRow.error&&meterRow.data?.difficulty_meter!=null)meter=Number(meterRow.data.difficulty_meter);
  }
  meter=clampMeter(meter,3);

  // 가장 잘 맞는 소단원을 우선 고정한 뒤, 현재 학생 수준 기준 쉬움/적정/도전 3문항 구성
  const sameKey=ranked.filter((p:any)=>String(p.info?.key??"")===String(bestInfo?.key??""));
  const pool=(sameKey.length>=3?sameKey:ranked).slice(0,40);
  const targets=[clampMeter(meter-0.55),meter,clampMeter(meter+0.55)];
  const picked:any[]=[];
  const chosen=new Set<string>();
  for(const t of targets){
    const one=pool.filter((p:any)=>!chosen.has(String(p.id)))
      .sort((a:any,b:any)=>Math.abs(a.meter-t)-Math.abs(b.meter-t)||b.targetScore-a.targetScore||String(a.id).localeCompare(String(b.id)))[0];
    if(one){chosen.add(String(one.id));picked.push(one);}
  }
  if(picked.length<3)return null;
  picked.sort((a:any,b:any)=>a.meter-b.meter||String(a.id).localeCompare(String(b.id)));
  return {picked,info:bestInfo,meter};
}

export async function createAutomaticSecondDiagnosis(args:{supabase:any;studentId:string;parentDiagnosis:any}){
  const {supabase,studentId,parentDiagnosis}=args;
  const currentKey=String(parentDiagnosis?.target_snapshot?.subunitKey??"");

  // 이미 2차 진단이 만들어졌다면 중복 생성 금지
  const existing=await supabase.from("sos_training_sessions")
    .select("id,status,target_snapshot").eq("student_id",studentId).eq("phase","DIAGNOSIS")
    .eq("parent_session_id",parentDiagnosis.id).eq("round_no",2).order("created_at",{ascending:true}).limit(1);
  if(existing.error)throw existing.error;
  if((existing.data??[]).length)return {created:true,existing:true,session:existing.data?.[0],nextStep:"SECOND_DIAGNOSIS_ASSIGNED"};

  const usedResult=await supabase.from("sos_training_sessions").select("sos_training_items(problem_id)").eq("student_id",studentId);
  if(usedResult.error)throw usedResult.error;
  const used=new Set<string>();
  for(const ss of usedResult.data??[])for(const i of ss.sos_training_items??[])if(i.problem_id)used.add(String(i.problem_id));

  const snapshot0=parentDiagnosis?.target_snapshot??{};
  const queued=Array.isArray(snapshot0?.autoNextTargets)?snapshot0.autoNextTargets:[];

  // 1순위: 관리자가 최초 SOS를 잡을 때 함께 저장해 둔 '다음 추천 핵심공략' 순서
  for(const nextTarget of queued){
    if(String(nextTarget?.sourceKey??"")===String(snapshot0?.sourceKey??""))continue;
    const chosen=await pickThreeForTarget({supabase,studentId,target:nextTarget,used});
    if(!chosen)continue;
    const {picked,info,meter}=chosen;
    if(String(info?.key??"")===currentKey)continue;

    const snapshot={
      ...snapshot0,...nextTarget,
      subject:info.subject,majorUnit:info.major,subunit:info.subunit,subunitKey:info.key,
      studentDifficultyMeter:meter,studentDifficultyLabel:meterLabel(meter),
      autoSecondDiagnosis:true,autoTargetSource:"NEXT_RECOMMENDED_CORE",
      previousTarget:snapshot0,
      sosNo:Number(snapshot0?.sosNo??1)+1,
    };
    const session=await supabase.from("sos_training_sessions").insert({
      student_id:studentId,phase:"DIAGNOSIS",status:"ASSIGNED",target_snapshot:snapshot,
      parent_session_id:parentDiagnosis.id,round_no:2,total_count:3,cycle_kind:"SECOND_DIAGNOSIS"
    }).select().single();
    if(session.error||!session.data)throw new Error(session.error?.message||"2차 진단 생성 실패");
    const items=await supabase.from("sos_training_items").insert(picked.map((p:any,index:number)=>({
      session_id:session.data.id,problem_id:p.id,item_order:index+1,
      item_role:`자동 추천 핵심공략 2차 진단 · ${info.subunit||p.unit||"연관문항"}`,subunit_key:info.key
    })));
    if(items.error){await supabase.from("sos_training_sessions").delete().eq("id",session.data.id);throw items.error;}
    return {created:true,session:session.data,target:nextTarget,nextStep:"SECOND_DIAGNOSIS_ASSIGNED",autoTargetSource:"NEXT_RECOMMENDED_CORE"};
  }

  // 2순위: 이전 버전에서 생성된 세션처럼 추천목록이 없는 경우, 학생 바로미터 최저의 '다른 소단원'을 자동 선택
  const meters=await supabase.from("sos_student_subunit_meters")
    .select("subject,major_unit,subunit,subunit_key,difficulty_meter")
    .eq("student_id",studentId).order("difficulty_meter",{ascending:true});
  if(meters.error)throw meters.error;

  for(const weakest of meters.data??[]){
    if(String(weakest.subunit_key)===currentKey)continue;
    const fallbackTarget={
      sourceSubject:weakest.subject,sourceMajorUnit:weakest.major_unit,sourceUnit:weakest.subunit,
      subunit:weakest.subunit,studentDifficultyMeter:weakest.difficulty_meter
    };
    const chosen=await pickThreeForTarget({supabase,studentId,target:fallbackTarget,used,fallbackMeter:Number(weakest.difficulty_meter)});
    if(!chosen)continue;
    const {picked,info,meter}=chosen;
    const snapshot={
      ...snapshot0,...fallbackTarget,
      subject:info.subject,majorUnit:info.major,subunit:info.subunit,subunitKey:info.key,
      studentDifficultyMeter:meter,studentDifficultyLabel:meterLabel(meter),
      autoSecondDiagnosis:true,autoTargetSource:"LOWEST_OTHER_BAROMETER",
      previousTarget:snapshot0,sosNo:Number(snapshot0?.sosNo??1)+1,
    };
    const session=await supabase.from("sos_training_sessions").insert({
      student_id:studentId,phase:"DIAGNOSIS",status:"ASSIGNED",target_snapshot:snapshot,
      parent_session_id:parentDiagnosis.id,round_no:2,total_count:3,cycle_kind:"SECOND_DIAGNOSIS"
    }).select().single();
    if(session.error||!session.data)throw new Error(session.error?.message||"2차 진단 생성 실패");
    const items=await supabase.from("sos_training_items").insert(picked.map((p:any,index:number)=>({
      session_id:session.data.id,problem_id:p.id,item_order:index+1,
      item_role:`최저 바로미터 자동 2차 진단 · ${info.subunit||p.unit||"연관문항"}`,subunit_key:info.key
    })));
    if(items.error){await supabase.from("sos_training_sessions").delete().eq("id",session.data.id);throw items.error;}
    return {created:true,session:session.data,target:weakest,nextStep:"SECOND_DIAGNOSIS_ASSIGNED",autoTargetSource:"LOWEST_OTHER_BAROMETER"};
  }

  return {created:false,nextStep:"NO_SECOND_DIAGNOSIS_TARGET"};
}

function expectedDiagnosisSeconds(difficulty:any){const d=Math.max(1,Math.min(8,Number(difficulty)||3));return [0,45,60,85,110,140,175,220,280][d]??85;}
function diagnosisTimeSignal(item:any){const p=item?.problem_bank_questions??{},seconds=Math.max(0,Number(item?.response_seconds)||0),expected=expectedDiagnosisSeconds(p?.difficulty),limit=Math.round(expected*1.35),severeLimit=Math.round(expected*1.8);return {seconds,expected,limit,severeLimit,slow:seconds>limit,severe:seconds>severeLimit};}
async function diagnosisHistoryForCycle(supabase:any,studentId:string,current:any){const currentCycle=cycleFromSnapshot(current?.target_snapshot??{});const r=await supabase.from("sos_training_sessions").select("id,phase,status,round_no,target_snapshot,created_at,sos_training_items(id,problem_id,item_order,is_correct,response_seconds,problem_bank_questions(id,subject,unit,topic,difficulty,difficulty_meter,question_type,problem_dna,question_image_path,answer))").eq("student_id",studentId).eq("phase","DIAGNOSIS").order("created_at",{ascending:true});if(r.error)throw r.error;return (r.data??[]).filter((x:any)=>{if(!["COMPLETED","PASSED"].includes(String(x.status)))return false;const c=cycleFromSnapshot(x?.target_snapshot??{});return currentCycle?.id?String(c?.id??"")===String(currentCycle.id):String(x.id)===String(current.id)||Number(x.round_no??0)<=Number(current.round_no??0);});}
function collectDiagnosisWeakSignals(history:any[]){const rows:any[]=[];for(const session of history)for(const item of session?.sos_training_items??[]){const t=diagnosisTimeSignal(item),wrong=item?.is_correct===false;if(!wrong&&!t.slow)continue;const problem=item?.problem_bank_questions??{};rows.push({round:Number(session.round_no??1),order:Number(item.item_order??0),wrong,slow:t.slow,severe:t.severe,seconds:t.seconds,expectedSeconds:t.expected,limitSeconds:t.limit,problem,priority:(wrong?300:0)+(t.severe?180:t.slow?100:0)+Math.min(60,t.seconds/10)});}return rows.sort((a,b)=>b.priority-a.priority);}

export async function analyzeDiagnosisAndCreateFirstTraining(args:{supabase:any;studentId:string;diagnosisSessionId:string}){
  const {supabase,studentId,diagnosisSessionId}=args;
  const diagResult=await supabase
    .from("sos_training_sessions")
    .select("id,student_id,phase,status,round_no,decision,updated_at,target_snapshot,sos_training_items(id,problem_id,item_order,student_answer,is_correct,response_seconds,solution_photo_path,problem_bank_questions(id,subject,unit,topic,difficulty,difficulty_meter,question_type,problem_dna,question_image_path,answer))")
    .eq("id",diagnosisSessionId).eq("student_id",studentId).single();
  if(diagResult.error||!diagResult.data) throw new Error(diagResult.error?.message||"진단 결과를 찾을 수 없습니다.");
  const diagnosis:any=diagResult.data;
  if(diagnosis.phase!=="DIAGNOSIS"||!['COMPLETED','PASSED'].includes(String(diagnosis.status))) throw new Error("완료된 진단만 AI 분석할 수 있습니다.");
  const diagnosisHistory=await diagnosisHistoryForCycle(supabase,studentId,diagnosis);
  const weakSignals=collectDiagnosisWeakSignals(diagnosisHistory);
  const strongestSignal=weakSignals[0]??null;

  const existing=await supabase.from("sos_training_sessions").select("id,status,created_at,sos_training_items(id,student_answer,answered_at,revealed_at)").eq("student_id",studentId).eq("phase","TRAINING").eq("parent_session_id",diagnosisSessionId).eq("round_no",1).eq("cycle_kind","BANK_TRAINING").order("created_at",{ascending:true});
  if(existing.error)throw existing.error;
  if((existing.data??[]).length){
    const canonical=(existing.data??[]).find((x:any)=>String(x.status)!=="ASSIGNED"||(x.sos_training_items??[]).some((i:any)=>String(i.student_answer??"").trim()||i.answered_at||i.revealed_at))??existing.data?.[0];
    return {created:false,existing:true,sessionId:String(canonical?.id??"")};
  }

  // SOS237: 동일 진단 완료 요청이 중복 도착해도 1차 훈련 AI 생성은 한 요청만 수행한다.
  // 현재 decision 값을 compare-and-set 조건으로 사용해 레이스를 차단한다. 5분 이상 멈춘 잠금은 복구 요청이 회수할 수 있다.
  const currentDecision=String(diagnosis.decision??"");
  const lockAge=Date.now()-new Date(diagnosis.updated_at??0).getTime();
  if(currentDecision==="AI_TRAINING_CREATING"&&Number.isFinite(lockAge)&&lockAge<5*60*1000)
    return {created:false,creating:true,nextStep:"AI_TRAINING_CREATING"};
  let lockQuery=supabase.from("sos_training_sessions")
    .update({decision:"AI_TRAINING_CREATING",updated_at:new Date().toISOString()})
    .eq("id",diagnosisSessionId).eq("student_id",studentId);
  lockQuery=currentDecision?lockQuery.eq("decision",currentDecision):lockQuery.is("decision",null);
  const lock=await lockQuery.select("id");
  if(lock.error)throw lock.error;
  if(!(lock.data??[]).length){
    const after=await supabase.from("sos_training_sessions").select("id").eq("student_id",studentId).eq("phase","TRAINING").eq("parent_session_id",diagnosisSessionId).eq("round_no",1).eq("cycle_kind","BANK_TRAINING").order("created_at",{ascending:true}).limit(1);
    if(after.error)throw after.error;
    if((after.data??[]).length)return {created:false,existing:true,sessionId:String(after.data?.[0]?.id??"")};
    return {created:false,creating:true,nextStep:"AI_TRAINING_CREATING"};
  }

  const target=diagnosis.target_snapshot??{};
  const content:any[]=[{type:"input_text",text:`당신은 MATHPOOH SOS 수학 취약점 진단 엔진입니다.\n아래 3개 진단문항의 문항 DNA, 정오답, 풀이시간, 학생 풀이사진을 함께 보고 이 학생에게 실제로 훈련할 만한 취약점이 있는지 판단하세요.\n\n규칙:\n- 정오답뿐 아니라 난이도별 풀이시간을 반드시 함께 봅니다.\n- weakSignals에는 1·2차 진단 전체에서 오답 또는 기준시간 1.35배 초과 문항이 들어 있습니다.\n- 계산실수와 개념/조건해석/접근전략/시간숙련 부족을 구분합니다.\n- 취약점이 있으면 한 번의 10문항 훈련으로 집중할 수 있게 가장 핵심적인 1개 축으로 표현합니다.\n- weaknessDetected=false라면 이유를 명확히 씁니다.\n- 학생에게 보여줄 weaknessTitle은 짧고 이해하기 쉽게, weaknessDetail은 2문장 이내로 씁니다.\n\n타겟 정보: ${JSON.stringify(target)}\n누적 weakSignals: ${JSON.stringify(weakSignals.map((x:any)=>({round:x.round,order:x.order,wrong:x.wrong,slow:x.slow,severe:x.severe,seconds:x.seconds,expectedSeconds:x.expectedSeconds,limitSeconds:x.limitSeconds,problem:compactDna(x.problem)})))}\n현재 진단 데이터: ${JSON.stringify((diagnosis.sos_training_items??[]).map((item:any)=>({order:item.item_order,answer:item.student_answer,correct:item.is_correct,seconds:item.response_seconds,problem:compactDna(item.problem_bank_questions??{})})))}`}];
  for(const item of diagnosis.sos_training_items??[]){
    const photo=await signed(supabase,"sos-solution-photos",item.solution_photo_path);
    if(photo)content.push({type:"input_image",image_url:photo});
  }
  const weaknessSchema={type:"object",additionalProperties:false,required:["weaknessDetected","weaknessTitle","weaknessDetail","focusConcepts","evidence","confidence"],properties:{
    weaknessDetected:{type:"boolean"},weaknessTitle:{type:"string"},weaknessDetail:{type:"string"},focusConcepts:{type:"array",maxItems:6,items:{type:"string"}},evidence:{type:"array",maxItems:5,items:{type:"string"}},confidence:{type:"integer",minimum:0,maximum:100}
  }};
  const weakness=await openAiJson("",weaknessSchema,content);

  await supabase.from("sos_training_sessions").update({weakness_snapshot:weakness,decision:weakness.weaknessDetected?"AI_TRAINING_CREATING":"NO_CLEAR_WEAKNESS",updated_at:new Date().toISOString()}).eq("id",diagnosisSessionId);
  let fallbackSignal:any=null;
  if(!weakness.weaknessDetected){
    if(Number(diagnosis.round_no??1)<2){const second=await createAutomaticSecondDiagnosis({supabase,studentId,parentDiagnosis:diagnosis});return {...second,created:false,weakness,weakSignalCount:weakSignals.length};}
    if(strongestSignal){
      fallbackSignal=strongestSignal;const p=fallbackSignal.problem??{},info=problemSubunit(p);weakness.weaknessDetected=true;
      weakness.weaknessTitle=fallbackSignal.wrong?`${info?.subunit||p.topic||p.unit||"진단 오답"} 보완`:`${info?.subunit||p.topic||p.unit||"풀이속도"} 시간 보완`;
      weakness.weaknessDetail=fallbackSignal.wrong?`진단 오답이 확인되어 해당 문항 DNA를 중심으로 보완합니다.${fallbackSignal.slow?" 풀이시간도 기준을 초과했습니다.":""}`:`정답이지만 시간취약 기준 ${fallbackSignal.limitSeconds}초를 초과해 ${fallbackSignal.seconds}초가 걸렸습니다. 같은 유형을 더 빠르고 안정적으로 풀도록 훈련합니다.`;
      weakness.focusConcepts=[...(Array.isArray(p?.problem_dna?.concept?.core_concepts)?p.problem_dna.concept.core_concepts:[]),info?.subunit,p.topic,p.unit].filter(Boolean).slice(0,6);
      weakness.evidence=[fallbackSignal.wrong?`진단 ${fallbackSignal.round}차 ${fallbackSignal.order}번 오답`:`진단 ${fallbackSignal.round}차 ${fallbackSignal.order}번 시간초과`,`풀이시간 ${fallbackSignal.seconds}초 / 시간취약 기준 ${fallbackSignal.limitSeconds}초`];
      weakness.confidence=Math.max(Number(weakness.confidence)||0,fallbackSignal.wrong?90:82);
      await supabase.from("sos_training_sessions").update({weakness_snapshot:weakness,decision:"AI_TRAINING_CREATING",updated_at:new Date().toISOString()}).eq("id",diagnosisSessionId);
    }else{await supabase.from("sos_training_sessions").update({decision:"NO_WEAKNESS_AFTER_SECOND_DIAGNOSIS",updated_at:new Date().toISOString()}).eq("id",diagnosisSessionId);return {created:false,weakness,nextStep:"DIAGNOSIS_COMPLETE_NO_WEAKNESS",weakSignalCount:0};}
  }
  const signalTarget=fallbackSignal?.problem?problemSubunit(fallbackSignal.problem):null;
  const effectiveTarget=fallbackSignal?{...target,subject:signalTarget?.subject||fallbackSignal.problem?.subject||target.subject,sourceSubject:signalTarget?.subject||fallbackSignal.problem?.subject||target.sourceSubject,subunit:signalTarget?.subunit||fallbackSignal.problem?.topic||fallbackSignal.problem?.unit||target.subunit,sourceUnit:signalTarget?.subunit||fallbackSignal.problem?.unit||target.sourceUnit,subunitKey:signalTarget?.key||target.subunitKey,sourceDifficulty:Number(fallbackSignal.problem?.difficulty)||target.sourceDifficulty,diagnosisFallbackSignal:{wrong:fallbackSignal.wrong,slow:fallbackSignal.slow,severe:fallbackSignal.severe,seconds:fallbackSignal.seconds,limitSeconds:fallbackSignal.limitSeconds,sourceProblemId:String(fallbackSignal.problem?.id??"")}}:target;

  const key=String(effectiveTarget.subunitKey??"");
  const meterResult=key?await supabase.from("sos_student_subunit_meters").select("difficulty_meter").eq("student_id",studentId).eq("subunit_key",key).maybeSingle():{data:null,error:null};
  if(meterResult.error)throw meterResult.error;
  const baseline=clampMeter(meterResult.data?.difficulty_meter,Number(effectiveTarget.studentDifficultyMeter)||3);
  const goal=sosTrainingGoalMeter(baseline);

  const usedResult=await supabase.from("sos_training_sessions").select("sos_training_items(problem_id)").eq("student_id",studentId);
  if(usedResult.error)throw usedResult.error;
  const used=new Set<string>();
  for(const s of usedResult.data??[])for(const i of s.sos_training_items??[])if(i.problem_id)used.add(String(i.problem_id));

  const bank=await supabase.from("problem_bank_questions")
    .select("id,title,problem_code,subject,unit,topic,difficulty,difficulty_meter,question_type,problem_dna,question_image_path")
    .eq("status","ACTIVE").eq("content_role","TRAINING");
  if(bank.error)throw bank.error;
  const subject=String(effectiveTarget.subject??effectiveTarget.sourceSubject??"").trim();
  const terms=[String(weakness.weaknessTitle??""),...(weakness.focusConcepts??[]),String(effectiveTarget.subunit??effectiveTarget.sourceUnit??"")].filter(Boolean);
  const pool=(bank.data??[])
    .filter((p:any)=>!used.has(String(p.id)))
    .filter((p:any)=>!subject||subjectKey(p.subject)===subjectKey(subject))
    .map((p:any)=>({...p,rel:relatedText(p,terms),meter:clampMeter(p.difficulty_meter,Number(p.difficulty)||3)}))
    .sort((a:any,b:any)=>b.rel-a.rel||Math.abs(a.meter-(baseline-0.25))-Math.abs(b.meter-(baseline-0.25)))
    .slice(0,30);
  if(pool.length<10)throw new Error(`훈련 후보가 부족합니다. ${pool.length}/10문항`);

  const recommendationSchema={type:"object",additionalProperties:false,required:["recommendations"],properties:{recommendations:{type:"array",minItems:10,maxItems:10,items:{type:"object",additionalProperties:false,required:["id","role","reason"],properties:{id:{type:"string"},role:{type:"string"},reason:{type:"string"}}}}}};
  const rec=await openAiJson(`당신은 MATHPOOH SOS 1차 훈련문항 선정 엔진입니다.\n취약점: ${weakness.weaknessTitle}\n상세: ${weakness.weaknessDetail}\n핵심개념: ${(weakness.focusConcepts??[]).join(", ")}\n학생 바로미터: ${baseline.toFixed(2)} / 목표: ${goal.toFixed(2)}\n후보: ${JSON.stringify(pool.map(compactDna))}\n\n정확히 10문항을 고르세요.\n- 단순 단원명보다 취약 사고과정/DNA를 최우선으로 봅니다.\n- 전체적으로 학생 현재 수준보다 조금 쉽게 시작합니다.\n- 권장 구성: 기초 안정화 3, 핵심 보완 4, 포함 적용 2, 완성 확인 1.\n- 뒤로 갈수록 조금 어려워지게 하되 무리한 고난도는 피합니다.\n- 같은 형태만 반복하지 말고 취약점을 직접 연습하는 문항과 취약점을 포함하는 문항을 섞습니다.\n- 제공된 후보 id만 사용합니다.`,recommendationSchema);
  const allowed=new Map<string,any>(pool.map((p:any)=>[String(p.id),p] as [string,any]));
  const seen=new Set<string>();
  const selected=(rec.recommendations??[]).filter((r:any)=>allowed.has(String(r.id))&&!seen.has(String(r.id))&&(seen.add(String(r.id))||true)).slice(0,10);
  if(selected.length!==10)throw new Error(`AI가 유효한 훈련문항을 ${selected.length}/10개만 선택했습니다.`);
  const selectedProblems=selected.map((r:any)=>({...allowed.get(String(r.id)),aiRole:String(r.role),aiReason:String(r.reason)}));
  selectedProblems.sort((a:any,b:any)=>a.meter-b.meter||String(a.id).localeCompare(String(b.id)));

  const snapshot={...effectiveTarget,weaknessTitle:weakness.weaknessTitle,weaknessDetail:weakness.weaknessDetail,focusConcepts:weakness.focusConcepts,baselineMeter:baseline,goalMeter:goal,studentDifficultyMeter:baseline,studentDifficultyLabel:meterLabel(baseline),aiTraining:true};
  const duplicateCheck=await supabase.from("sos_training_sessions").select("id").eq("student_id",studentId).eq("phase","TRAINING").eq("parent_session_id",diagnosisSessionId).eq("round_no",1).eq("cycle_kind","BANK_TRAINING").order("created_at",{ascending:true}).limit(1);
  if(duplicateCheck.error)throw duplicateCheck.error;
  if((duplicateCheck.data??[]).length){
    await supabase.from("sos_training_sessions").update({decision:"FIRST_TRAINING_ASSIGNED",updated_at:new Date().toISOString()}).eq("id",diagnosisSessionId).eq("decision","AI_TRAINING_CREATING");
    return {created:false,existing:true,sessionId:String(duplicateCheck.data?.[0]?.id??"")};
  }
  const sessionResult=await supabase.from("sos_training_sessions").insert({
    student_id:studentId,phase:"TRAINING",status:"ASSIGNED",target_snapshot:snapshot,weakness_snapshot:weakness,parent_session_id:diagnosisSessionId,round_no:1,total_count:10,baseline_meter:baseline,goal_meter:goal,cycle_kind:"BANK_TRAINING"
  }).select().single();
  if(sessionResult.error||!sessionResult.data){await supabase.from("sos_training_sessions").update({decision:"AI_WEAKNESS_ANALYSIS",updated_at:new Date().toISOString()}).eq("id",diagnosisSessionId).eq("decision","AI_TRAINING_CREATING");throw new Error(sessionResult.error?.message||"1차 훈련 생성 실패");}
  const session:any=sessionResult.data;
  const itemResult=await supabase.from("sos_training_items").insert(selectedProblems.map((p:any,index:number)=>({session_id:session.id,problem_id:p.id,item_order:index+1,item_role:`${p.aiRole} · ${p.aiReason}`,subunit_key:key||problemSubunit(p).key})));
  if(itemResult.error){await supabase.from("sos_training_sessions").delete().eq("id",session.id);await supabase.from("sos_training_sessions").update({decision:"AI_WEAKNESS_ANALYSIS",updated_at:new Date().toISOString()}).eq("id",diagnosisSessionId).eq("decision","AI_TRAINING_CREATING");throw itemResult.error;}
  await supabase.from("sos_training_sessions").update({decision:"FIRST_TRAINING_ASSIGNED",updated_at:new Date().toISOString()}).eq("id",diagnosisSessionId).eq("decision","AI_TRAINING_CREATING");
  return {created:true,weakness,session,baselineMeter:baseline,goalMeter:goal};
}

export async function generateSimilarTraining(args:{supabase:any;studentId:string;firstTrainingSessionId:string;count:3|10;kind:"HOMEWORK"|"SECOND_TRAINING"}){
  const {supabase,studentId,firstTrainingSessionId,count,kind}=args;
  const source=await supabase.from("sos_training_sessions")
    .select("id,student_id,status,decision,updated_at,target_snapshot,weakness_snapshot,baseline_meter,goal_meter,sos_training_items(id,item_order,is_correct,response_seconds,review_is_correct,review_response_seconds,problem_meter_before,problem_bank_questions(id,subject,unit,topic,difficulty,difficulty_meter,question_type,problem_dna,question_image_path,answer))")
    .eq("id",firstTrainingSessionId).eq("student_id",studentId).single();
  if(source.error||!source.data)throw new Error(source.error?.message||"1차 훈련 결과를 찾을 수 없습니다.");
  const s:any=source.data;

  // SOS237: 이미 생성된 2차/3제는 그대로 재사용한다. 최종 insert 직전에도 한 번 더 확인한다.
  const existing=await supabase.from("sos_training_sessions").select("id,status,created_at").eq("student_id",studentId).eq("phase","TRAINING").eq("parent_session_id",firstTrainingSessionId).eq("cycle_kind",kind).eq("round_no",kind==="HOMEWORK"?3:2).order("created_at",{ascending:true}).limit(1);
  if(existing.error)throw existing.error;
  if((existing.data??[]).length)return {session:existing.data?.[0],problems:[],existing:true};

  const weakness=s.weakness_snapshot??{};
  const ranked=(s.sos_training_items??[]).slice().sort((a:any,b:any)=>{
    const ap=(a.is_correct===false?100:0)+(a.review_is_correct===false?60:0)+Math.min(60,Number(a.response_seconds??0)/5);
    const bp=(b.is_correct===false?100:0)+(b.review_is_correct===false?60:0)+Math.min(60,Number(b.response_seconds??0)/5);
    return bp-ap;
  }).slice(0,5);
  if(!ranked.length)throw new Error("AI 유사문항의 원문이 되는 1차 훈련 문항을 찾을 수 없습니다.");

  const sourceSlots=Array.from({length:count},(_,index)=>{
    const item=ranked[index%ranked.length];
    const problem:any=item?.problem_bank_questions??{};
    return {
      slot:index+1,
      trainingOrder:Number(item?.item_order??0)||null,
      problemId:problem?.id??null,
      sourceAnswer:String(problem?.answer??""),
      dna:compactDna(problem),
      imagePath:String(problem?.question_image_path??""),
    };
  });
  const sourceImages=await Promise.all(sourceSlots.map(async slot=>slot.imagePath?await signed(supabase,"question-images",slot.imagePath):""));
  const sourceSummary=sourceSlots.map((slot,index)=>({slot:slot.slot,trainingOrder:slot.trainingOrder,problemId:slot.problemId,sourceAnswer:slot.sourceAnswer,dna:slot.dna,hasOriginalImage:Boolean(sourceImages[index])}));

  if(kind==="HOMEWORK"){
    const schema3={type:"object",additionalProperties:false,required:["problems"],properties:{problems:{type:"array",minItems:3,maxItems:3,items:{type:"object",additionalProperties:false,required:["sourceSlot","question","answer","solution","difficulty","meter","topic","reason","computedAnswer","verified"],properties:{sourceSlot:{type:"integer",minimum:1,maximum:3},question:{type:"string"},answer:{type:"string"},solution:{type:"string"},difficulty:{type:"integer",minimum:1,maximum:8},meter:{type:"number",minimum:1,maximum:8},topic:{type:"string"},reason:{type:"string"},computedAnswer:{type:"string"},verified:{type:"boolean"}}}}}};
    const prompt3=`MATHPOOH SOS 3제 굳히기입니다. 원문 슬롯: ${JSON.stringify(sourceSummary)}. 정확히 3문항을 sourceSlot 1,2,3 순서로 만드세요. 원문의 핵심개념·풀이순서·질문유형을 유지하고 수치만 제한 변형하세요. 자유창작/새 개념 금지. 각 문항을 출제 후 처음부터 다시 풀어 computedAnswer를 적고 answer와 같고 유일한 정수(-999~999)일 때만 verified=true. question에 LaTeX 명령 금지.`;
    const c3:any[]=[{type:"input_text",text:prompt3}];
    sourceSlots.forEach((slot,index)=>{c3.push({type:"input_text",text:`[sourceSlot ${slot.slot}] 원문`});if(sourceImages[index])c3.push({type:"input_image",image_url:sourceImages[index]});else c3.push({type:"input_text",text:JSON.stringify(slot.dna)});});
    const g=await openAiJson(prompt3,schema3,c3,{timeoutMs:38000,effort:"low"});
    const list3=Array.isArray(g?.problems)?g.problems:[];
    const errs=list3.map((p:any,i:number)=>{const a=String(p?.answer??"").trim(),c=String(p?.computedAnswer??"").trim();if(Number(p?.sourceSlot)!==i+1)return `${i+1}번 슬롯 오류`;if(p?.verified!==true)return `${i+1}번 검증 실패`;if(!/^-?\d+$/.test(a)||a!==c)return `${i+1}번 정답 불일치`;const n=Number(a);if(!Number.isSafeInteger(n)||n<-999||n>999)return `${i+1}번 정답 범위`;if(!String(p?.question??"").trim()||!String(p?.solution??"").trim())return `${i+1}번 본문/풀이 없음`;return "";}).filter(Boolean);
    if(list3.length!==3||errs.length)throw new Error(`3제 굳히기 생성 검증 실패: ${list3.length!==3?`문항수 ${list3.length}/3`:errs.join(", ")}`);
    const target=s.target_snapshot??{};
    const normalized=list3.map((p:any,index:number)=>{const ss=sourceSlots[index],si=ranked[index%ranked.length]??null,sp=si?.problem_bank_questions??{};return {...p,subject:target.subject??target.sourceSubject??"",majorUnit:target.majorUnit??target.sourceMajorUnit??"",subunit:target.subunit??target.sourceUnit??"",subunitKey:target.subunitKey??"",meter:clampMeter(p.meter,p.difficulty),generated:true,generatedIndex:index+1,sourceTrainingOrder:Number(ss?.trainingOrder??si?.item_order??0)||null,sourceProblemId:ss?.problemId??sp?.id??null,sourceTopic:String(sp?.topic??""),coreType:String(p.topic??weakness?.focusConcepts?.[0]??weakness?.weaknessTitle??"핵심 취약유형"),generationKind:"HOMEWORK",generationPolicy:"SOURCE_LIMITED_TRANSFORM_FAST_VERIFY_V2",barometerExcluded:true,verification:{method:"ONE_CALL_RESOLVE_CHECK",valid:true,computedAnswer:String(p.computedAnswer)}};});
    const dup=await supabase.from("sos_training_sessions").select("id,status,created_at").eq("student_id",studentId).eq("phase","TRAINING").eq("parent_session_id",firstTrainingSessionId).eq("cycle_kind","HOMEWORK").eq("round_no",3).order("created_at",{ascending:true}).limit(1);if(dup.error)throw dup.error;if((dup.data??[]).length)return {session:dup.data?.[0],problems:[],existing:true};
    const session=await supabase.from("sos_training_sessions").insert({student_id:studentId,phase:"TRAINING",status:"ASSIGNED",target_snapshot:{...target,generatedSimilar:true,homework:true,barometerExcluded:true,generationPolicy:"SOURCE_LIMITED_TRANSFORM_FAST_VERIFY_V2"},weakness_snapshot:weakness,parent_session_id:firstTrainingSessionId,round_no:3,total_count:3,baseline_meter:s.baseline_meter,goal_meter:s.goal_meter,cycle_kind:"HOMEWORK"}).select().single();if(session.error||!session.data)throw new Error(session.error?.message||"3제 굳히기 세션 생성 실패");
    const ins=await supabase.from("sos_training_items").insert(normalized.map((p:any,index:number)=>({session_id:session.data.id,problem_id:null,generated_problem:p,item_order:index+1,item_role:"AI 유사문항 3제 굳히기 · 바로미터 미반영",subunit_key:p.subunitKey})));if(ins.error){await supabase.from("sos_training_sessions").delete().eq("id",session.data.id);throw ins.error;}return {session:session.data,problems:normalized,fastHomework:true};
  }

  const schema={type:"object",additionalProperties:false,required:["problems"],properties:{problems:{type:"array",minItems:count,maxItems:count,items:{type:"object",additionalProperties:false,required:["sourceSlot","question","answer","solution","difficulty","meter","topic","reason"],properties:{sourceSlot:{type:"integer",minimum:1,maximum:count},question:{type:"string"},answer:{type:"string"},solution:{type:"string"},difficulty:{type:"integer",minimum:1,maximum:8},meter:{type:"number",minimum:1,maximum:8},topic:{type:"string"},reason:{type:"string"}}}}}};
  let list:any[]=[];
  let invalidReason="";
  for(let generationAttempt=1;generationAttempt<=3;generationAttempt++){
    const prompt=`당신은 MATHPOOH SOS 수학 제한변형 출제 엔진입니다.
취약점: ${weakness.weaknessTitle??s.target_snapshot?.weaknessTitle??""}
상세: ${weakness.weaknessDetail??s.target_snapshot?.weaknessDetail??""}
원문 슬롯 정보: ${JSON.stringify(sourceSummary)}

정확히 ${count}개의 문항을 sourceSlot 1~${count} 순서대로 하나씩 생성하세요.
각 문항은 반드시 같은 sourceSlot의 '원문 문제 이미지'를 직접 기반으로 한 제한변형이어야 합니다.

[허용되는 변형]
- 원문의 핵심 개념, 풀이 순서, 사고 구조, 질문 유형은 그대로 유지합니다.
- 숫자/계수/점의 위치/조건의 수치처럼 계산 결과에 영향을 주는 일부 값만 바꿉니다.
- 필요할 때만 같은 의미의 짧은 표현 변경 또는 조건 순서 변경을 허용합니다.

[금지되는 변형]
- 원문에 없던 새 개념, 새 정리, 새 풀이기법, 새 상황을 추가하지 않습니다.
- 서술형↔객관식처럼 문제 형식을 크게 바꾸지 않습니다. 단, 화면 입력을 위해 최종 답은 정수 하나가 되도록 원문의 수치만 안전하게 조정할 수 있습니다.
- 핵심 조건을 삭제하거나 난이도를 의도적으로 크게 올리지 않습니다.
- 원문을 베껴 숫자 하나만 기계적으로 바꾸는 수준도 피하되, 자유창작은 절대 하지 않습니다.

[정답 안정성]
- 모든 최종 정답은 -999~999 범위의 정수 하나여야 하며 answer에는 정수 문자열만 씁니다.
- 생성한 문제를 직접 처음부터 풀어 조건 충분성, 모순 여부, 유일해, solution과 answer 일치를 자체 검산합니다.
- question에는 LaTeX 명령을 쓰지 말고 학생 화면에서 바로 읽히는 일반 텍스트/유니코드 수식을 씁니다.
- reason에는 원문의 무엇을 유지하고 어떤 수치/조건만 바꿨는지 짧게 적습니다.
- 1차 미달자의 2차 정식훈련이므로 원문 풀이 구조는 유지하고 수치 복잡도만 같거나 조금 낮게 시작해 점진적으로 회복시킵니다.
${invalidReason?`이전 생성은 검증에서 탈락했습니다: ${invalidReason}. 같은 오류를 반복하지 마세요.`:""}`;
    const content:any[]=[{type:"input_text",text:prompt}];
    sourceSlots.forEach((slot,index)=>{
      content.push({type:"input_text",text:`[sourceSlot ${slot.slot}] 1차 훈련 ${slot.trainingOrder??"?"}번 원문. 이 이미지의 핵심 구조를 유지해 제한변형하세요.`});
      if(sourceImages[index])content.push({type:"input_image",image_url:sourceImages[index]});
      else content.push({type:"input_text",text:`원문 이미지가 없어 DNA를 보조 원문으로 사용합니다: ${JSON.stringify(slot.dna)}`});
    });
    const generated=await openAiJson(prompt,schema,content);
    const candidate=Array.isArray(generated?.problems)?generated.problems:[];
    const slotSet=new Set(candidate.map((p:any)=>Number(p?.sourceSlot)));
    const invalid=candidate.map((problem:any,index:number)=>{
      const expected=index+1;
      if(Number(problem?.sourceSlot)!==expected)return `${expected}번 sourceSlot 순서 오류`;
      const answer=String(problem?.answer??"").trim();
      if(!/^-?\d+$/.test(answer))return `${index+1}번 정답이 정수가 아님(${answer||"빈값"})`;
      const value=Number(answer);
      if(!Number.isSafeInteger(value)||value < -999||value > 999)return `${index+1}번 정답 범위 오류(${answer})`;
      const question=String(problem?.question??"").trim();
      const solution=String(problem?.solution??"").trim();
      if(!question||!solution)return `${index+1}번 문제/풀이가 비어 있음`;
      if(/\\(?:frac|dfrac|tfrac|lim|sqrt|begin|end|left|right)\b/.test(question))return `${index+1}번 본문에 LaTeX 명령이 남아 있음`;
      if(question.length<18)return `${index+1}번 문제 본문이 너무 짧음`;
      return "";
    }).filter(Boolean);
    if(candidate.length===count&&slotSet.size===count&&!invalid.length){
      try{
        const verifySchema={type:"object",additionalProperties:false,required:["checks"],properties:{checks:{type:"array",minItems:count,maxItems:count,items:{type:"object",additionalProperties:false,required:["index","valid","sourceFaithful","computedAnswer","reason"],properties:{index:{type:"integer",minimum:1,maximum:count},valid:{type:"boolean"},sourceFaithful:{type:"boolean"},computedAnswer:{type:"string"},reason:{type:"string"}}}}}};
        const verifyPrompt=`당신은 MATHPOOH SOS 생성문항 독립 검수자입니다. 출제자의 solution/answer를 믿지 말고 아래 ${count}개 생성문항을 각각 처음부터 새로 풀어 검증하세요. 동시에 같은 sourceSlot의 원문 이미지와 비교하여 '제한변형'인지 판정하세요.

검수 기준:
1) 생성문항은 주어진 조건만으로 풀이 가능하고 조건에 모순이 없어야 합니다.
2) 정답은 유일해야 합니다.
3) 검수자가 독립적으로 재풀이한 실제 결과가 -999~999 정수 하나여야 합니다.
4) computedAnswer와 제공 answer가 정확히 같아야 합니다.
5) 원문의 핵심 개념·풀이 흐름·질문 유형을 유지하고 수치/계수/동등한 조건 정도만 바꾼 제한변형이어야 sourceFaithful=true입니다.
6) 원문에 없던 개념/정리/풀이법을 추가했거나 자유창작에 가까우면 sourceFaithful=false입니다.
하나라도 어기면 valid=false로 하세요.

생성문항: ${JSON.stringify(candidate.map((p:any,i:number)=>({index:i+1,sourceSlot:p.sourceSlot,question:p.question,claimedAnswer:p.answer,claimedSolution:p.solution,topic:p.topic,changeReason:p.reason})))}`;
        const verifyContent:any[]=[{type:"input_text",text:verifyPrompt}];
        sourceSlots.forEach((slot,index)=>{
          verifyContent.push({type:"input_text",text:`[검수용 sourceSlot ${slot.slot}] 원문`});
          if(sourceImages[index])verifyContent.push({type:"input_image",image_url:sourceImages[index]});
          else verifyContent.push({type:"input_text",text:`원문 이미지 없음 · DNA: ${JSON.stringify(slot.dna)}`});
        });
        const verified=await openAiJson(verifyPrompt,verifySchema,verifyContent);
        const checks=Array.isArray(verified?.checks)?verified.checks:[];
        const verifyErrors=checks.map((c:any)=>{
          const idx=Number(c?.index)||0;
          const original=idx>=1&&idx<=candidate.length?candidate[idx-1]:null;
          const claimed=String(original?.answer??"").trim();
          const computed=String(c?.computedAnswer??"").trim();
          if(c?.valid!==true)return `${idx||"?"}번 재풀이 검수 실패(${String(c?.reason??"원인 미상")})`;
          if(c?.sourceFaithful!==true)return `${idx||"?"}번 원문 제한변형 위반(${String(c?.reason??"원문과 구조 불일치")})`;
          if(!/^-?\d+$/.test(computed)||computed!==claimed)return `${idx||"?"}번 재계산값 불일치(${claimed}≠${computed||"빈값"})`;
          return "";
        }).filter(Boolean);
        if(checks.length===count&&!verifyErrors.length){
          list=candidate.map((p:any,index:number)=>({...p,verification:{method:"INDEPENDENT_AI_RESOLVE_AND_SOURCE_COMPARE",valid:true,sourceFaithful:true,reason:String(checks[index]?.reason??"")}}));
          break;
        }
        invalidReason=checks.length!==count?`검수 응답 수 ${checks.length}/${count}`:verifyErrors.join(", ");
      }catch(error){
        invalidReason=`AI 독립 재풀이 검수 실패: ${error instanceof Error?error.message:"검수 오류"}`;
      }
    }else invalidReason=candidate.length!==count?`문항 수 ${candidate.length}/${count}`:invalid.join(", ");
  }
  if(list.length!==count)throw new Error(`AI 유사문항 검증 실패: ${invalidReason||"원문 제한변형/독립 재풀이 조건 미충족"}`);

  const target=s.target_snapshot??{};
  const normalized=list.map((p:any,index:number)=>{
    const sourceSlot=sourceSlots[index];
    const sourceItem=ranked[index%ranked.length]??null;
    const sourceProblem=sourceItem?.problem_bank_questions??{};
    return {
      ...p,
      subject:target.subject??target.sourceSubject??"",
      majorUnit:target.majorUnit??target.sourceMajorUnit??"",
      subunit:target.subunit??target.sourceUnit??"",
      subunitKey:target.subunitKey??"",
      meter:clampMeter(p.meter,p.difficulty),
      generated:true,
      generatedIndex:index+1,
      sourceTrainingOrder:Number(sourceSlot?.trainingOrder??sourceItem?.item_order??0)||null,
      sourceProblemId:sourceSlot?.problemId??sourceProblem?.id??null,
      sourceTopic:String(sourceProblem?.topic??""),
      coreType:String(p.topic??weakness?.focusConcepts?.[0]??weakness?.weaknessTitle??"핵심 취약유형"),
      generationKind:kind,
      generationPolicy:"SOURCE_LIMITED_TRANSFORM_V1",
      barometerExcluded:false,
    };
  });
  const duplicateCheck=await supabase.from("sos_training_sessions").select("id,status,created_at").eq("student_id",studentId).eq("phase","TRAINING").eq("parent_session_id",firstTrainingSessionId).eq("cycle_kind",kind).eq("round_no",2).order("created_at",{ascending:true}).limit(1);
  if(duplicateCheck.error)throw duplicateCheck.error;
  if((duplicateCheck.data??[]).length)return {session:duplicateCheck.data?.[0],problems:[],existing:true};
  const session=await supabase.from("sos_training_sessions").insert({
    student_id:studentId,phase:"TRAINING",status:"ASSIGNED",target_snapshot:{...target,generatedSimilar:true,homework:false,barometerExcluded:false,generationPolicy:"SOURCE_LIMITED_TRANSFORM_V1"},weakness_snapshot:weakness,parent_session_id:firstTrainingSessionId,round_no:2,total_count:count,baseline_meter:s.baseline_meter,goal_meter:s.goal_meter,cycle_kind:kind
  }).select().single();
  if(session.error||!session.data)throw new Error(session.error?.message||"유사문항 세션 생성 실패");
  const ins=await supabase.from("sos_training_items").insert(normalized.map((p:any,index:number)=>({session_id:session.data.id,problem_id:null,generated_problem:p,item_order:index+1,item_role:"2차 AI 유사훈련",subunit_key:p.subunitKey})));
  if(ins.error){await supabase.from("sos_training_sessions").delete().eq("id",session.data.id);throw ins.error;}
  return {session:session.data,problems:normalized};
}
