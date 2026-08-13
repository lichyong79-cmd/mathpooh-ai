import { clampMeter, meterLabel } from "@/lib/difficulty-meter";
import { problemSubunit } from "@/lib/subunit-key";
import { sosTrainingGoalMeter } from "@/lib/sos-training-policy";

function outputText(payload:any){
  if(typeof payload?.output_text==="string") return payload.output_text.trim();
  const parts:string[]=[];
  for(const item of payload?.output??[]) for(const content of item?.content??[])
    if(typeof content?.text==="string") parts.push(content.text);
  return parts.join("\n").trim();
}

async function openAiJson(prompt:string,schema:any,content?:any[]){
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey) throw new Error("OPENAI_API_KEY가 없습니다.");
  const model=process.env.OPENAI_ANALYSIS_MODEL||process.env.OPENAI_MODEL||"gpt-5-mini";
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      model,
      input:[{role:"user",content:content??[{type:"input_text",text:prompt}]}],
      reasoning:{effort:"medium"},
      text:{format:{type:"json_schema",name:"sos_training_engine",strict:true,schema}},
    }),
  });
  const payload=await response.json();
  if(!response.ok) throw new Error(payload?.error?.message||"AI 연결에 실패했습니다.");
  const text=outputText(payload);
  if(!text) throw new Error("AI 분석 결과가 비어 있습니다.");
  try{return JSON.parse(text);}catch{throw new Error("AI 분석 결과 형식을 읽지 못했습니다.");}
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


async function createSecondDiagnosisFromWeakest(args:{supabase:any;studentId:string;parentDiagnosis:any}){
  const {supabase,studentId,parentDiagnosis}=args;
  const currentKey=String(parentDiagnosis?.target_snapshot?.subunitKey??"");
  const meters=await supabase.from("sos_student_subunit_meters")
    .select("subject,major_unit,subunit,subunit_key,difficulty_meter")
    .eq("student_id",studentId).order("difficulty_meter",{ascending:true});
  if(meters.error)throw meters.error;
  const weakest=(meters.data??[]).find((m:any)=>String(m.subunit_key)!==currentKey)??null;
  if(!weakest)return {created:false,nextStep:"NO_SECOND_DIAGNOSIS_TARGET"};

  const usedResult=await supabase.from("sos_training_sessions").select("sos_training_items(problem_id)").eq("student_id",studentId);
  if(usedResult.error)throw usedResult.error;
  const used=new Set<string>();
  for(const ss of usedResult.data??[])for(const i of ss.sos_training_items??[])if(i.problem_id)used.add(String(i.problem_id));

  const bank=await supabase.from("problem_bank_questions")
    .select("id,subject,unit,topic,difficulty,difficulty_meter,question_type,problem_dna")
    .eq("status","ACTIVE").eq("content_role","TRAINING");
  if(bank.error)throw bank.error;
  const pool=(bank.data??[]).map((p:any)=>({...p,info:problemSubunit(p),meter:clampMeter(p.difficulty_meter,Number(p.difficulty)||3)}))
    .filter((p:any)=>!used.has(String(p.id))&&String(p.info?.key??"")===String(weakest.subunit_key));
  if(pool.length<3)throw new Error(`2차 진단 문항이 부족합니다. ${pool.length}/3문항`);
  const meter=clampMeter(weakest.difficulty_meter,3);
  const targets=[clampMeter(meter-0.55),meter,clampMeter(meter+0.55)];
  const picked:any[]=[];
  const chosen=new Set<string>();
  for(const t of targets){
    const one=pool.filter((p:any)=>!chosen.has(String(p.id))).sort((a:any,b:any)=>Math.abs(a.meter-t)-Math.abs(b.meter-t)||String(a.id).localeCompare(String(b.id)))[0];
    if(one){chosen.add(String(one.id));picked.push(one);}
  }
  if(picked.length<3)throw new Error(`2차 진단 문항이 부족합니다. ${picked.length}/3문항`);
  picked.sort((a:any,b:any)=>a.meter-b.meter||String(a.id).localeCompare(String(b.id)));
  const snapshot={subject:weakest.subject,majorUnit:weakest.major_unit,subunit:weakest.subunit,subunitKey:weakest.subunit_key,studentDifficultyMeter:meter,studentDifficultyLabel:meterLabel(meter),autoSecondDiagnosis:true,previousTarget:parentDiagnosis.target_snapshot??{}};
  const session=await supabase.from("sos_training_sessions").insert({student_id:studentId,phase:"DIAGNOSIS",status:"ASSIGNED",target_snapshot:snapshot,parent_session_id:parentDiagnosis.id,round_no:2,total_count:3,cycle_kind:"SECOND_DIAGNOSIS"}).select().single();
  if(session.error||!session.data)throw new Error(session.error?.message||"2차 진단 생성 실패");
  const items=await supabase.from("sos_training_items").insert(picked.map((p:any,index:number)=>({session_id:session.data.id,problem_id:p.id,item_order:index+1,item_role:`최약 바로미터 2차 진단 · ${weakest.subunit}`,subunit_key:weakest.subunit_key})));
  if(items.error){await supabase.from("sos_training_sessions").delete().eq("id",session.data.id);throw items.error;}
  return {created:true,session:session.data,target:weakest,nextStep:"SECOND_DIAGNOSIS_ASSIGNED"};
}

export async function analyzeDiagnosisAndCreateFirstTraining(args:{supabase:any;studentId:string;diagnosisSessionId:string}){
  const {supabase,studentId,diagnosisSessionId}=args;
  const diagResult=await supabase
    .from("sos_training_sessions")
    .select("id,student_id,phase,status,round_no,target_snapshot,sos_training_items(id,problem_id,item_order,student_answer,is_correct,response_seconds,solution_photo_path,problem_bank_questions(id,subject,unit,topic,difficulty,difficulty_meter,question_type,problem_dna,question_image_path,answer))")
    .eq("id",diagnosisSessionId).eq("student_id",studentId).single();
  if(diagResult.error||!diagResult.data) throw new Error(diagResult.error?.message||"진단 결과를 찾을 수 없습니다.");
  const diagnosis:any=diagResult.data;
  if(diagnosis.phase!=="DIAGNOSIS"||!['COMPLETED','PASSED'].includes(String(diagnosis.status))) throw new Error("완료된 진단만 AI 분석할 수 있습니다.");

  const existing=await supabase.from("sos_training_sessions").select("id").eq("student_id",studentId).eq("phase","TRAINING").eq("parent_session_id",diagnosisSessionId).limit(1);
  if(existing.error)throw existing.error;
  if((existing.data??[]).length)return {created:false,existing:true,sessionId:String(existing.data?.[0]?.id??"")};

  const target=diagnosis.target_snapshot??{};
  const content:any[]=[{type:"input_text",text:`당신은 MATHPOOH SOS 수학 취약점 진단 엔진입니다.\n아래 3개 진단문항의 문항 DNA, 정오답, 풀이시간, 학생 풀이사진을 함께 보고 이 학생에게 실제로 훈련할 만한 취약점이 있는지 판단하세요.\n\n규칙:\n- 단순히 틀렸다는 이유만으로 취약점이라고 하지 말고, 3문항에서 반복되거나 풀이사진/시간으로 확인되는 사고과정의 약점을 찾습니다.\n- 계산실수와 개념/조건해석/접근전략 약점을 구분합니다.\n- 취약점이 있으면 한 번의 10문항 훈련으로 집중할 수 있게 가장 핵심적인 1개 축으로 표현합니다.\n- weaknessDetected=false라면 이유를 명확히 씁니다.\n- 학생에게 보여줄 weaknessTitle은 짧고 이해하기 쉽게, weaknessDetail은 2문장 이내로 씁니다.\n\n타겟 정보: ${JSON.stringify(target)}\n진단 데이터: ${JSON.stringify((diagnosis.sos_training_items??[]).map((item:any)=>({order:item.item_order,answer:item.student_answer,correct:item.is_correct,seconds:item.response_seconds,problem:compactDna(item.problem_bank_questions??{})})))}`}];
  for(const item of diagnosis.sos_training_items??[]){
    const photo=await signed(supabase,"sos-solution-photos",item.solution_photo_path);
    if(photo)content.push({type:"input_image",image_url:photo});
  }
  const weaknessSchema={type:"object",additionalProperties:false,required:["weaknessDetected","weaknessTitle","weaknessDetail","focusConcepts","evidence","confidence"],properties:{
    weaknessDetected:{type:"boolean"},weaknessTitle:{type:"string"},weaknessDetail:{type:"string"},focusConcepts:{type:"array",maxItems:6,items:{type:"string"}},evidence:{type:"array",maxItems:5,items:{type:"string"}},confidence:{type:"integer",minimum:0,maximum:100}
  }};
  const weakness=await openAiJson("",weaknessSchema,content);

  await supabase.from("sos_training_sessions").update({weakness_snapshot:weakness,decision:weakness.weaknessDetected?"WEAKNESS_FOUND":"NO_CLEAR_WEAKNESS",updated_at:new Date().toISOString()}).eq("id",diagnosisSessionId);
  if(!weakness.weaknessDetected){
    if(Number(diagnosis.round_no??1)<2){
      const second=await createSecondDiagnosisFromWeakest({supabase,studentId,parentDiagnosis:diagnosis});
      return {created:false,weakness,...second};
    }
    await supabase.from("sos_training_sessions").update({decision:"NO_WEAKNESS_AFTER_SECOND_DIAGNOSIS",updated_at:new Date().toISOString()}).eq("id",diagnosisSessionId);
    return {created:false,weakness,nextStep:"DIAGNOSIS_COMPLETE_NO_WEAKNESS"};
  }

  const key=String(target.subunitKey??"");
  const meterResult=key?await supabase.from("sos_student_subunit_meters").select("difficulty_meter").eq("student_id",studentId).eq("subunit_key",key).maybeSingle():{data:null,error:null};
  if(meterResult.error)throw meterResult.error;
  const baseline=clampMeter(meterResult.data?.difficulty_meter,Number(target.studentDifficultyMeter)||3);
  const goal=sosTrainingGoalMeter(baseline);

  const usedResult=await supabase.from("sos_training_sessions").select("sos_training_items(problem_id)").eq("student_id",studentId);
  if(usedResult.error)throw usedResult.error;
  const used=new Set<string>();
  for(const s of usedResult.data??[])for(const i of s.sos_training_items??[])if(i.problem_id)used.add(String(i.problem_id));

  const bank=await supabase.from("problem_bank_questions")
    .select("id,title,problem_code,subject,unit,topic,difficulty,difficulty_meter,question_type,problem_dna,question_image_path")
    .eq("status","ACTIVE").eq("content_role","TRAINING");
  if(bank.error)throw bank.error;
  const subject=String(target.subject??target.sourceSubject??"").trim();
  const terms=[String(weakness.weaknessTitle??""),...(weakness.focusConcepts??[]),String(target.subunit??target.sourceUnit??"")].filter(Boolean);
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

  const snapshot={...target,weaknessTitle:weakness.weaknessTitle,weaknessDetail:weakness.weaknessDetail,focusConcepts:weakness.focusConcepts,baselineMeter:baseline,goalMeter:goal,studentDifficultyMeter:baseline,studentDifficultyLabel:meterLabel(baseline),aiTraining:true};
  const sessionResult=await supabase.from("sos_training_sessions").insert({
    student_id:studentId,phase:"TRAINING",status:"ASSIGNED",target_snapshot:snapshot,weakness_snapshot:weakness,parent_session_id:diagnosisSessionId,round_no:1,total_count:10,baseline_meter:baseline,goal_meter:goal,cycle_kind:"BANK_TRAINING"
  }).select().single();
  if(sessionResult.error||!sessionResult.data)throw new Error(sessionResult.error?.message||"1차 훈련 생성 실패");
  const session:any=sessionResult.data;
  const itemResult=await supabase.from("sos_training_items").insert(selectedProblems.map((p:any,index:number)=>({session_id:session.id,problem_id:p.id,item_order:index+1,item_role:`${p.aiRole} · ${p.aiReason}`,subunit_key:key||problemSubunit(p).key})));
  if(itemResult.error){await supabase.from("sos_training_sessions").delete().eq("id",session.id);throw itemResult.error;}
  return {created:true,weakness,session,baselineMeter:baseline,goalMeter:goal};
}

export async function generateSimilarTraining(args:{supabase:any;studentId:string;firstTrainingSessionId:string;count:3|10;kind:"HOMEWORK"|"SECOND_TRAINING"}){
  const {supabase,studentId,firstTrainingSessionId,count,kind}=args;
  const source=await supabase.from("sos_training_sessions")
    .select("id,student_id,target_snapshot,weakness_snapshot,baseline_meter,goal_meter,sos_training_items(id,item_order,is_correct,response_seconds,review_is_correct,review_response_seconds,problem_meter_before,problem_bank_questions(id,subject,unit,topic,difficulty,difficulty_meter,question_type,problem_dna,answer))")
    .eq("id",firstTrainingSessionId).eq("student_id",studentId).single();
  if(source.error||!source.data)throw new Error(source.error?.message||"1차 훈련 결과를 찾을 수 없습니다.");
  const s:any=source.data;
  const weakness=s.weakness_snapshot??{};
  const ranked=(s.sos_training_items??[]).slice().sort((a:any,b:any)=>{
    const ap=(a.is_correct===false?100:0)+(a.review_is_correct===false?60:0)+Math.min(60,Number(a.response_seconds??0)/5);
    const bp=(b.is_correct===false?100:0)+(b.review_is_correct===false?60:0)+Math.min(60,Number(b.response_seconds??0)/5);
    return bp-ap;
  }).slice(0,5);
  const sourceSummary=ranked.map((i:any)=>({order:i.item_order,correct:i.is_correct,seconds:i.response_seconds,reviewCorrect:i.review_is_correct,reviewSeconds:i.review_response_seconds,problem:compactDna(i.problem_bank_questions??{})}));
  const schema={type:"object",additionalProperties:false,required:["problems"],properties:{problems:{type:"array",minItems:count,maxItems:count,items:{type:"object",additionalProperties:false,required:["question","answer","solution","difficulty","meter","topic","reason"],properties:{question:{type:"string"},answer:{type:"string"},solution:{type:"string"},difficulty:{type:"integer",minimum:1,maximum:8},meter:{type:"number",minimum:1,maximum:8},topic:{type:"string"},reason:{type:"string"}}}}}};
  const generated=await openAiJson(`당신은 MATHPOOH SOS 수학 유사·변형문항 생성 엔진입니다.\n취약점: ${weakness.weaknessTitle??s.target_snapshot?.weaknessTitle??""}\n상세: ${weakness.weaknessDetail??s.target_snapshot?.weaknessDetail??""}\n1차 훈련에서 특히 다시 확인할 문항 DNA/결과: ${JSON.stringify(sourceSummary)}\n\n정확히 ${count}개의 새로운 문항을 생성하세요.\n- 숫자만 바꾸는 복제는 금지합니다. 핵심 풀이 DNA는 유지하되 조건, 수치, 표현, 질문 구조를 변형합니다.\n- 외부 그림 없이도 풀 수 있도록 문항을 완결된 한국어 텍스트로 작성합니다.\n- 답이 유일하고 조건이 충분한지 스스로 검증합니다.\n- solution에는 검산 가능한 핵심 풀이를 간결하게 씁니다.\n- ${kind==="HOMEWORK"?"1차 통과자의 완성 확인 숙제이므로 적정~약간 도전 수준":"1차 미달자의 2차 정식훈련이므로 쉬운 확인부터 시작해 점진적으로 올립니다"}.`,schema);
  const list=generated.problems??[];
  if(list.length!==count)throw new Error(`유사문항 생성 수가 맞지 않습니다. ${list.length}/${count}`);
  const target=s.target_snapshot??{};
  const normalized=list.map((p:any,index:number)=>({
    ...p,
    subject:target.subject??target.sourceSubject??"",
    majorUnit:target.majorUnit??target.sourceMajorUnit??"",
    subunit:target.subunit??target.sourceUnit??"",
    subunitKey:target.subunitKey??"",
    meter:clampMeter(p.meter,p.difficulty),
    generated:true,
    generatedIndex:index+1,
  }));
  const session=await supabase.from("sos_training_sessions").insert({
    student_id:studentId,phase:"TRAINING",status:"ASSIGNED",target_snapshot:{...target,generatedSimilar:true,homework:kind==="HOMEWORK"},weakness_snapshot:weakness,parent_session_id:firstTrainingSessionId,round_no:kind==="HOMEWORK"?3:2,total_count:count,baseline_meter:s.baseline_meter,goal_meter:s.goal_meter,cycle_kind:kind
  }).select().single();
  if(session.error||!session.data)throw new Error(session.error?.message||"유사문항 세션 생성 실패");
  const ins=await supabase.from("sos_training_items").insert(normalized.map((p:any,index:number)=>({session_id:session.data.id,problem_id:null,generated_problem:p,item_order:index+1,item_role:kind==="HOMEWORK"?"완성 확인 유사문항":"2차 AI 유사훈련",subunit_key:p.subunitKey})));
  if(ins.error){await supabase.from("sos_training_sessions").delete().eq("id",session.data.id);throw ins.error;}
  return {session:session.data,problems:normalized};
}
