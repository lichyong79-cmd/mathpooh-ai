import { bookingExam, BOOKING_CLOCK_COLUMNS } from "@/lib/exam-flow";
import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { calculateExamScore } from "@/lib/exam-score";
import { dedupeExamAttempts } from "@/lib/exam-attempt";

async function adminContext() {
  const user = await getSessionUser();
  if (!user)
    return {
      error: NextResponse.json(
        { message: "로그인이 필요합니다." },
        { status: 401 },
      ),
    };
  if (
    user.user_metadata?.role === "student" ||
    user.user_metadata?.role === "parent"
  )
    return {
      error: NextResponse.json(
        { message: "관리자 권한이 필요합니다." },
        { status: 403 },
      ),
    };
  return { supabase: createServerSupabase() };
}

async function loadQuestionMetadata(
  supabase: ReturnType<typeof createServerSupabase>,
  examId: string,
) {
  const { data } = await supabase
    .from("exam_question_analysis")
    .select(
      "question_no,major_unit,middle_unit,minor_unit,detailed_topic,question_type,problem_types,difficulty",
    )
    .eq("exam_id", examId)
    .order("question_no");
  return data ?? [];
}

export async function GET(request: Request) {
  const ctx = await adminContext();
  if (ctx.error) return ctx.error;
  const examId = new URL(request.url).searchParams.get("examId");
  const cycleId = new URL(request.url).searchParams.get("cycleId")??"";
  const resultsOnly=new URL(request.url).searchParams.get("mode")==="results"||!cycleId;
  if (!examId)
    return NextResponse.json(
      { message: "시험을 선택해 주세요." },
      { status: 400 },
    );
  const { data: sourceExam, error: examError } = await ctx.supabase
    .from("exams")
    .select(
      "id,title,exam_date,time_limit,student_open,open_at,close_at,paused_at,paused_remaining_seconds,answer_keys,question_count,total_score,question_points,solution_open",
    )
    .eq("id", examId)
    .maybeSingle();
  if (examError || !sourceExam)
    return NextResponse.json(
      { message: examError?.message || "시험을 찾지 못했습니다." },
      { status: 404 },
    );
  let exam:any=sourceExam;
  let registrationQuery=ctx.supabase.from("exam_registrations")
    .select(`student_id,status,requested_at,assigned_at,cycle_student_id,scheduled_at,booking_status,${BOOKING_CLOCK_COLUMNS}${cycleId?",learning_cycle_students!inner(cycle_id)":""}`)
    .eq("exam_id",examId).eq("status","assigned");
  if(cycleId)registrationQuery=registrationQuery.eq("learning_cycle_students.cycle_id",cycleId);
  const {data:registrations,error:registrationError}=await registrationQuery;
  if(registrationError)return NextResponse.json({message:registrationError.message},{status:400});
  let assignedRegistrations:any[]=registrations??[];
  // Historical results come from submitted attempts, regardless of current
  // assignments, withdrawal or movement to the next paper.
  const resultAttemptIds:string[]=[];
  if(resultsOnly){
    let cycleStart="",cycleEnd="";
    let members:any[]=[];
    if(cycleId){
      const [cycle,membership]=await Promise.all([
        ctx.supabase.from("learning_cycles").select("start_date,end_date").eq("id",cycleId).single(),
        ctx.supabase.from("learning_cycle_students").select("student_id,formal_sequence,scope_code").eq("cycle_id",cycleId),
      ]);
      if(cycle.error||membership.error)return NextResponse.json({message:cycle.error?.message||membership.error?.message},{status:400});
      cycleStart=new Date(`${cycle.data.start_date}T00:00:00+09:00`).toISOString();
      cycleEnd=new Date(Date.parse(`${cycle.data.end_date}T00:00:00+09:00`)+86400000).toISOString();
      members=membership.data??[];
    }
    const submittedIds=new Set<string>();
    for(let from=0;;from+=1000){
      let query=ctx.supabase.from("exam_attempts").select("id,student_id,formal_sequence,scope_code,started_at").eq("exam_id",examId).eq("status","submitted");
      if(cycleId)query=query.gte("started_at",cycleStart).lt("started_at",cycleEnd);
      const submitted=await query.order("id").range(from,from+999);
      if(submitted.error)return NextResponse.json({message:submitted.error.message},{status:400});
      for(const attempt of submitted.data??[])if(!cycleId||members.some(m=>m.student_id===attempt.student_id&&(attempt.formal_sequence==null||m.formal_sequence===attempt.formal_sequence)&&(attempt.scope_code==null||m.scope_code===attempt.scope_code))){submittedIds.add(String(attempt.student_id));resultAttemptIds.push(String(attempt.id));}
      if((submitted.data??[]).length<1000)break;
    }
    const registrationMap=new Map(assignedRegistrations.map(r=>[String(r.student_id),r]));
    assignedRegistrations=[...submittedIds].map(student_id=>registrationMap.get(student_id)??{student_id,status:"submitted",source:"attempt"});
  }
  if(cycleId&&assignedRegistrations.length){
    const current=assignedRegistrations.find(r=>r.booking_status==="IN_PROGRESS")??assignedRegistrations[0];
    exam={...bookingExam(exam,current),booking_status:current.booking_status};
    if(!["IN_PROGRESS","COMPLETED"].includes(current.booking_status))exam={...exam,close_at:null,paused_at:null,paused_remaining_seconds:null};
  }
  const studentIds = assignedRegistrations.map((item) => item.student_id);
  const questionMetadata = await loadQuestionMetadata(ctx.supabase, exam.id);
  if (!studentIds.length)
    return NextResponse.json({
      exam: { ...exam, question_metadata: questionMetadata },
      rows: [],
      activity_logs: [],
    });
  const [
    { data: students, error: studentError },
    { data: attempts, error: attemptError },
  ] = await Promise.all([
    ctx.supabase
      .from("students")
      .select("id,name,school,grade,phone")
      .in("id", studentIds),
    ctx.supabase
      .from("exam_attempts")
      .select(
        "id,student_id,status,answers,started_at,last_saved_at,submitted_at,graded_at,created_at,score,correct_count,wrong_numbers,unanswered_numbers,score_source,solution_override,mathpooh_comment",
      )
      .eq("exam_id", examId)
      .in(resultsOnly?"id":"student_id", resultsOnly?resultAttemptIds:studentIds),
  ]);
  const { data: activityLogs } = await ctx.supabase
    .from("exam_activity_logs")
    .select("id,student_id,event_type,detail,occurred_at")
    .eq("exam_id", examId)
    .in("student_id",studentIds)
    .order("occurred_at", { ascending: false })
    .limit(300);
  if (studentError || attemptError)
    return NextResponse.json(
      { message: studentError?.message || attemptError?.message },
      { status: 400 },
    );
  const canonicalAttempts = dedupeExamAttempts(
    attempts ?? [],
    (attempt) => String(attempt.student_id),
  );
  if(cycleId&&!resultsOnly) {
    await Promise.all(
      canonicalAttempts
        .filter((attempt) => {
          const clock=bookingExam(exam,assignedRegistrations.find(r=>r.student_id===attempt.student_id));
          return attempt.status==="in_progress"&&!clock.paused_at&&clock.close_at&&Date.parse(clock.close_at)+5000<=Date.now();
        })
        .map(async (attempt) => {
          const deadline=bookingExam(exam,assignedRegistrations.find(r=>r.student_id===attempt.student_id)).close_at;
          const answers = attempt.answers ?? {};
          const graded = calculateExamScore(
            answers,
            exam.answer_keys,
            Number(exam.question_count),
            Number(exam.total_score ?? 100),
            exam.question_points,
          );
          const { score, correct, wrong, unanswered } = graded;
          const finalized = await ctx.supabase
            .from("exam_attempts")
            .update({
              status: "submitted",
              submitted_at: deadline,
              last_saved_at: deadline,
              score,
              correct_count: correct,
              wrong_numbers: wrong,
              unanswered_numbers: unanswered,
              graded_at: deadline,
            })
            .eq("id", attempt.id)
            .eq("status", "in_progress").eq("last_saved_at", attempt.last_saved_at).select("id").maybeSingle();
          if (finalized.error || !finalized.data) return;
          attempt.status = "submitted";
          attempt.submitted_at = deadline;
          attempt.score = score;
          attempt.correct_count = correct;
        }),
    );
  }
  // 결과 조회는 DB에 확정 저장된 점수/정오답을 그대로 반환한다.
  // 재채점은 제출, 관리자 결과 저장, 명시적 재분석에서만 수행한다.

  const studentMap = new Map(
    (students ?? []).map((student) => [student.id, student]),
  );
  const attemptMap = new Map(
    canonicalAttempts.map((attempt) => [String(attempt.student_id), attempt]),
  );
  const rows = assignedRegistrations
    .map((registration) => ({
      registration,
      student: studentMap.get(registration.student_id),
      attempt: attemptMap.get(registration.student_id) ?? null,
    }))
    .filter((row) => row.student);
  return NextResponse.json({
    exam: { ...exam, question_metadata: questionMetadata },
    rows,
    activity_logs: activityLogs ?? [],
  });
}

export async function PATCH(request: Request) {
  const ctx = await adminContext();
  if (ctx.error) return ctx.error;
  const body = await request.json();
  const examId = String(body.examId ?? "");
  if (!examId)
    return NextResponse.json(
      { message: "시험을 선택해 주세요." },
      { status: 400 },
    );
  const { data: currentExam, error: currentError } = await ctx.supabase
    .from("exams")
    .select("time_limit,answer_keys,question_count,total_score,question_points,open_at,close_at,paused_at,paused_remaining_seconds,solution_open")
    .eq("id", examId)
    .maybeSingle();
  if (currentError || !currentExam)
    return NextResponse.json(
      { message: currentError?.message || "시험을 찾지 못했습니다." },
      { status: 404 },
    );
  const action = String(body.action ?? "schedule");
  if(["schedule","start","pause","resume"].includes(action))return NextResponse.json({message:"회차별 시험 진행에서 타이머 생성·시작·일시정지·재개를 해주세요."},{status:409});
  const cycleId=String(body.cycleId??"");
  let scopedStudentIds:string[]=[];
  if(action==="force-end"){
    if(!cycleId)return NextResponse.json({message:"종료할 운영 회차를 선택해 주세요."},{status:400});
    const assigned=await ctx.supabase.from("exam_registrations").select("student_id,learning_cycle_students!inner(cycle_id)").eq("exam_id",examId).eq("status","assigned").eq("learning_cycle_students.cycle_id",cycleId);
    if(assigned.error)return NextResponse.json({message:assigned.error.message},{status:400});
    scopedStudentIds=(assigned.data??[]).map(r=>String(r.student_id));
    if(!scopedStudentIds.length)return NextResponse.json({message:"이 회차에 배정된 학생이 없습니다."},{status:409});
  }

  const gradeAnswers = (answers: Record<string, unknown>) =>
    calculateExamScore(
      answers,
      currentExam.answer_keys,
      Number(currentExam.question_count),
      Number(currentExam.total_score ?? 100),
      currentExam.question_points,
    );

  if (action === "force-end") {
    const endedAt = new Date().toISOString();
    const { data: runningAttempts, error: attemptsError } = await ctx.supabase
      .from("exam_attempts")
      .select("id,student_id,status,answers,started_at,last_saved_at,created_at")
      .eq("exam_id", examId)
      .in("student_id",scopedStudentIds)
      .eq("status", "in_progress");
    if (attemptsError) return NextResponse.json({ message: attemptsError.message }, { status: 400 });
    const finalAttempts = dedupeExamAttempts(
      runningAttempts ?? [],
      (attempt) => String(attempt.student_id),
    );
    const finalizedRows = await Promise.all(finalAttempts.map(async (attempt) => {
      const graded = gradeAnswers(attempt.answers ?? {});
      return await ctx.supabase.from("exam_attempts").update({
        status: "submitted", submitted_at: endedAt, last_saved_at: endedAt,
        score: graded.score, correct_count: graded.correct, wrong_numbers: graded.wrong,
        unanswered_numbers: graded.unanswered, graded_at: endedAt,
      }).eq("id", attempt.id).eq("status", "in_progress").eq("last_saved_at", attempt.last_saved_at).select("id").maybeSingle();
    }));
    if (finalizedRows.some(r=>r.error || !r.data)) return NextResponse.json({message:"일부 답안이 저장 중입니다. 최신 저장 후 강제종료를 다시 눌러 주세요."},{status:409});
    const {error}=await ctx.supabase.from("exam_registrations").update({clock_close_at:endedAt,clock_paused_at:null,clock_remaining_seconds:null}).eq("exam_id",examId).in("student_id",scopedStudentIds).eq("status","assigned");
    return error?NextResponse.json({message:error.message},{status:400}):NextResponse.json({exam:{...currentExam,close_at:endedAt,paused_at:null,paused_remaining_seconds:null},submittedCount:finalAttempts.length});
  }


  if (action === "solution-global") {
    const { data, error } = await ctx.supabase
      .from("exams")
      .update({ solution_open: Boolean(body.open) })
      .eq("id", examId)
      .select("id,solution_open")
      .single();
    return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ exam: data });
  }

  if (action === "solution-student") {
    const attemptId = String(body.attemptId ?? "");
    const override = body.override === null ? null : Boolean(body.override);
    const { data, error } = await ctx.supabase
      .from("exam_attempts")
      .update({ solution_override: override })
      .eq("id", attemptId)
      .eq("exam_id", examId)
      .select("id,solution_override")
      .single();
    return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ attempt: data });
  }

  if (action === "update-comment") {
    const attemptId = String(body.attemptId ?? "");
    const { data, error } = await ctx.supabase
      .from("exam_attempts")
      .update({ mathpooh_comment: String(body.mathpoohComment ?? "") })
      .eq("id", attemptId)
      .eq("exam_id", examId)
      .select("id,mathpooh_comment")
      .single();
    return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ attempt: data });
  }

  if (action === "update-result") {
    const attemptId = String(body.attemptId ?? "");
    const answers =
      typeof body.answers === "object" && body.answers ? body.answers : {};
    if (!attemptId)
      return NextResponse.json(
        { message: "수정할 제출 결과가 없습니다." },
        { status: 400 },
      );

    // 관리자가 수정하는 것은 학생 답안/정오답뿐이다.
    // 최종 점수는 현재 답안과 정답표로 항상 다시 계산한다.
    const graded = gradeAnswers(answers as Record<string, unknown>);
    const gradedAt = new Date().toISOString();
    const { data, error } = await ctx.supabase
      .from("exam_attempts")
      .update({
        answers,
        score: graded.score,
        correct_count: graded.correct,
        wrong_numbers: graded.wrong,
        unanswered_numbers: graded.unanswered,
        graded_at: gradedAt,
        score_source: "auto",
        mathpooh_comment: String(body.mathpoohComment ?? ""),
      })
      .eq("id", attemptId)
      .eq("exam_id", examId)
      .select(
        "id,student_id,status,answers,started_at,last_saved_at,submitted_at,score,correct_count,wrong_numbers,unanswered_numbers,graded_at,score_source,solution_override,mathpooh_comment",
      )
      .single();
    if (error)
      return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ attempt: data });
  }

  return NextResponse.json({message:"지원하지 않는 작업입니다."},{status:400});
}
