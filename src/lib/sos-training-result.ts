import {
  clampMeter,
  meterLabel,
  nextProblemMeter,
  nextStudentMeter,
} from "@/lib/difficulty-meter";
import { requireSubunit } from "@/lib/subunit-key";

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

  // 정답 필드에 복수 정답을 "||" 또는 "|"로 둔 경우도 허용.
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
    .select("id,session_id,problem_id,is_correct,sos_training_sessions(student_id),problem_bank_questions(id,subject,unit,topic,difficulty,difficulty_meter,difficulty_meter_samples,difficulty_meter_unique_students,problem_dna,answer)")
    .eq("id",itemId)
    .single();

  if(itemResult.error||!itemResult.data)
    throw new Error(itemResult.error?.message||"훈련 문항을 찾을 수 없습니다.");

  const item:any=itemResult.data;
  if(String(item.sos_training_sessions?.student_id??"")!==studentId)
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

  const problem:any=item.problem_bank_questions??{};
  const info=requireSubunit(problem);
  const problemBefore=clampMeter(problem.difficulty_meter,Number(problem.difficulty)||3);
  const studentMeterRow=await loadSubunitMeter(supabase,studentId,info,problemBefore);

  const isCorrect=answerMatches(args.studentAnswer,problem.answer);
  const studentBefore=studentMeterRow.meter;
  const studentAfter=nextStudentMeter(studentBefore,problemBefore,isCorrect);

  const priorStudent=await supabase
    .from("sos_difficulty_events")
    .select("id")
    .eq("problem_id",String(item.problem_id))
    .eq("student_id",studentId)
    .limit(1);

  if(priorStudent.error) throw priorStudent.error;

  const firstStudentSample=(priorStudent.data??[]).length===0;
  const uniqueBefore=Math.max(0,Number(problem.difficulty_meter_unique_students??0));
  const uniqueAfter=uniqueBefore+(firstStudentSample?1:0);

  const problemAfter=firstStudentSample
    ? nextProblemMeter({
        problemMeter:problemBefore,
        studentMeterBefore:studentBefore,
        correct:isCorrect,
        uniqueStudents:uniqueAfter,
      })
    : problemBefore;

  const responseSeconds=Number.isFinite(Number(args.responseSeconds))
    ? Math.max(0,Math.round(Number(args.responseSeconds)))
    : null;
  const now=new Date().toISOString();

  const meterUpdate=await supabase
    .from("sos_student_subunit_meters")
    .update({
      difficulty_meter:studentAfter,
      sample_count:studentMeterRow.samples+1,
      updated_at:now,
    })
    .eq("id",studentMeterRow.id);
  if(meterUpdate.error) throw meterUpdate.error;

  const problemUpdate=await supabase
    .from("problem_bank_questions")
    .update({
      difficulty_meter:problemAfter,
      difficulty_meter_samples:Number(problem.difficulty_meter_samples??0)+1,
      difficulty_meter_unique_students:uniqueAfter,
      difficulty_meter_origin:uniqueAfter>=20?"EMPIRICAL":"DNA",
      ...(firstStudentSample&&uniqueAfter>=20?{difficulty_meter_updated_at:now}:{}),
    })
    .eq("id",String(item.problem_id));
  if(problemUpdate.error) throw problemUpdate.error;

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
      problem_id:String(item.problem_id),
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
    studentMeter:{
      before:studentBefore,
      after:studentAfter,
      label:meterLabel(studentAfter),
    },
    problemMeter:{
      before:problemBefore,
      after:problemAfter,
      label:meterLabel(problemAfter),
      uniqueStudents:uniqueAfter,
      empirical:uniqueAfter>=20,
    },
  };
}
