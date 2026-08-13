import {
  clampMeter,
  meterLabel,
  nextProblemMeter,
  nextStudentMeter,
  nextStudentMeterWithActual,
} from "@/lib/difficulty-meter";
import { requireSubunit } from "@/lib/subunit-key";
import { trainingPerformanceActual } from "@/lib/sos-training-policy";

function normalizeAnswer(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .replace(/,/g, "");
}

export function answerMatches(studentAnswer: unknown, correctAnswer: unknown) {
  const student = normalizeAnswer(studentAnswer);
  const raw = String(correctAnswer ?? "").trim();
  if (!student || !raw) return false;
  const candidates = raw.split(/\s*\|\|?\s*/).map(normalizeAnswer).filter(Boolean);
  return candidates.includes(student);
}

async function loadSubunitMeter(
  supabase:any,
  studentId:string,
  info:{subject:string;major:string;subunit:string;key:string},
  fallback:number,
) {
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

export async function recordTrainingResult(args:{
  supabase:any;
  studentId:string;
  itemId:string;
  studentAnswer:string;
  responseSeconds?:number|null;
}) {
  const {supabase,studentId,itemId}=args;

  const itemResult=await supabase
    .from("sos_training_items")
    .select("id,session_id,problem_id,is_correct,generated_problem,sos_training_sessions(student_id,phase,target_snapshot,cycle_kind),problem_bank_questions(id,subject,unit,topic,difficulty,difficulty_meter,difficulty_meter_samples,difficulty_meter_unique_students,problem_dna,answer)")
    .eq("id",itemId)
    .single();

  if(itemResult.error||!itemResult.data)
    throw new Error(itemResult.error?.message||"훈련 문항을 찾을 수 없습니다.");

  const item:any=itemResult.data;
  const session:any=item.sos_training_sessions??{};
  if(String(session?.student_id??"")!==studentId)
    throw new Error("학생과 진단·훈련 문항이 일치하지 않습니다.");

  const existingEvent=await supabase
    .from("sos_difficulty_events")
    .select("id")
    .eq("training_item_id",itemId)
    .maybeSingle();

  if(existingEvent.error) throw existingEvent.error;
  if(existingEvent.data) {
    return {
      duplicate:true,
      isCorrect:item.is_correct===true,
      studentMeter:null,
      problemMeter:null,
    };
  }

  const bankProblem:any=item.problem_bank_questions??null;
  const generated:any=item.generated_problem??null;
  if(!bankProblem&&!generated) throw new Error("훈련 문항 원본을 찾을 수 없습니다.");

  const target=session?.target_snapshot??{};
  const problem:any=bankProblem??{
    subject:generated?.subject??target?.subject??target?.sourceSubject??"",
    unit:generated?.unit??generated?.subunit??target?.subunit??target?.sourceUnit??"",
    topic:generated?.topic??generated?.weakness??target?.weaknessTitle??"AI 유사문항",
    difficulty:String(generated?.difficulty??generated?.meter??target?.studentDifficultyMeter??3),
    difficulty_meter:generated?.meter??generated?.difficulty??target?.studentDifficultyMeter??3,
    answer:generated?.answer??"",
  };

  const info=bankProblem
    ? requireSubunit(problem)
    : {
        subject:String(generated?.subject??target?.subject??target?.sourceSubject??"미분류"),
        major:String(generated?.majorUnit??target?.majorUnit??target?.sourceMajorUnit??""),
        subunit:String(generated?.subunit??target?.subunit??target?.sourceUnit??"AI 유사훈련"),
        key:String(generated?.subunitKey??target?.subunitKey??item.subunit_key??""),
      };
  if(!info.key) throw new Error("훈련 소단원 키를 찾을 수 없습니다.");

  const problemBefore=clampMeter(problem.difficulty_meter,Number(problem.difficulty)||3);
  const studentMeterRow=await loadSubunitMeter(supabase,studentId,info,problemBefore);
  const isCorrect=answerMatches(args.studentAnswer,problem.answer);
  const responseSeconds=Number.isFinite(Number(args.responseSeconds))
    ? Math.max(0,Math.round(Number(args.responseSeconds)))
    : null;

  const studentBefore=studentMeterRow.meter;
  const phase=String(session?.phase??"");
  const homework=String(session?.cycle_kind??"")==="HOMEWORK";
  const studentAfter=homework
    ? studentBefore
    : phase==="TRAINING"
      ? nextStudentMeterWithActual(
          studentBefore,
          problemBefore,
          trainingPerformanceActual({correct:isCorrect,responseSeconds,problemMeter:problemBefore}),
          0.05,
        )
      : nextStudentMeter(studentBefore,problemBefore,isCorrect);

  let uniqueAfter=0;
  let problemAfter=problemBefore;
  let firstStudentSample=false;

  if(bankProblem&&item.problem_id){
    const priorStudent=await supabase
      .from("sos_difficulty_events")
      .select("id")
      .eq("problem_id",String(item.problem_id))
      .eq("student_id",studentId)
      .limit(1);
    if(priorStudent.error) throw priorStudent.error;

    firstStudentSample=(priorStudent.data??[]).length===0;
    const uniqueBefore=Math.max(0,Number(bankProblem.difficulty_meter_unique_students??0));
    uniqueAfter=uniqueBefore+(firstStudentSample?1:0);
    problemAfter=firstStudentSample
      ? nextProblemMeter({
          problemMeter:problemBefore,
          studentMeterBefore:studentBefore,
          correct:isCorrect,
          uniqueStudents:uniqueAfter,
        })
      : problemBefore;
  }

  const now=new Date().toISOString();
  const meterUpdate=await supabase
    .from("sos_student_subunit_meters")
    .update({
      difficulty_meter:studentAfter,
      sample_count:studentMeterRow.samples+(homework?0:1),
      updated_at:now,
    })
    .eq("id",studentMeterRow.id);
  if(meterUpdate.error) throw meterUpdate.error;

  if(bankProblem&&item.problem_id){
    const problemUpdate=await supabase
      .from("problem_bank_questions")
      .update({
        difficulty_meter:problemAfter,
        difficulty_meter_samples:Number(bankProblem.difficulty_meter_samples??0)+1,
        difficulty_meter_unique_students:uniqueAfter,
        difficulty_meter_origin:uniqueAfter>=20?"EMPIRICAL":"DNA",
        ...(firstStudentSample&&uniqueAfter>=20?{difficulty_meter_updated_at:now}:{}),
      })
      .eq("id",String(item.problem_id));
    if(problemUpdate.error) throw problemUpdate.error;
  }

  const itemUpdate=await supabase
    .from("sos_training_items")
    .update({
      student_answer:String(args.studentAnswer??""),
      is_correct:isCorrect,
      response_seconds:responseSeconds,
      answered_at:now,
      subunit_key:info.key,
      student_meter_before:studentBefore,
      student_meter_after:studentAfter,
      problem_meter_before:problemBefore,
      problem_meter_after:problemAfter,
    })
    .eq("id",itemId);
  if(itemUpdate.error) throw itemUpdate.error;

  const event=await supabase
    .from("sos_difficulty_events")
    .insert({
      student_id:studentId,
      problem_id:item.problem_id?String(item.problem_id):null,
      training_item_id:itemId,
      subject:info.subject,
      major_unit:info.major,
      subunit:info.subunit,
      subunit_key:info.key,
      is_correct:isCorrect,
      response_seconds:responseSeconds,
      student_meter_before:studentBefore,
      student_meter_after:studentAfter,
      problem_meter_before:problemBefore,
      problem_meter_after:problemAfter,
      problem_unique_students:uniqueAfter,
    });
  if(event.error) throw event.error;

  return {
    duplicate:false,
    isCorrect,
    correctAnswer:String(problem.answer??""),
    scope:info,
    studentMeter:{before:studentBefore,after:studentAfter,label:meterLabel(studentAfter)},
    problemMeter:{before:problemBefore,after:problemAfter,label:meterLabel(problemAfter),uniqueStudents:uniqueAfter,empirical:uniqueAfter>=20},
  };
}
