import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeDifficulty } from "@/lib/difficulty-scale";
import { applyJudgedDifficulty, difficultyReferenceText, judgeDifficulty } from "@/lib/difficulty-judge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * SOS278 · 난이도 재판정 워커
 *
 * 브라우저 탭을 켜둔 채 4723문항을 돌리는 건 불가능하다(문항당 약 12.5초 = 약 16시간).
 * 큐(sos_difficulty_regrade_jobs)에 넣어두고 외부 스케줄러가 10분마다 이 경로를 부르면
 * 한 번에 몇 문항씩 조용히 처리한다. 브라우저를 닫아도 계속 진행된다.
 *
 * SOS271과 같은 방식으로 선점 직후 202를 돌려주고 실제 작업은 after()로 이어간다.
 * 외부 스케줄러의 30초 타임아웃에 걸리지 않는다.
 */

// 문항당 약 12.5초. 300초 한도 안에서 여유를 두고 8문항으로 잡는다.
const BATCH_SIZE = 8;
// RUNNING으로 이 시간 이상 멈춰 있으면 죽은 작업으로 보고 회수한다.
const STALE_MINUTES = 20;
const MAX_ATTEMPTS = 3;

async function processOne(supabase: any, job: any) {
  const questionId = String(job.question_id);
  try {
    const { data: problem, error } = await supabase
      .from("problem_bank_questions")
      .select("id,subject,question_image_path,problem_dna,difficulty,answer")
      .eq("id", questionId)
      .single();
    if (error || !problem) throw new Error(error?.message || "문항을 찾지 못했습니다.");
    if (problem.problem_dna?.difficulty?.admin_fixed === true) {
      await supabase.from("sos_difficulty_regrade_jobs").update({
        status: "SKIPPED", last_error: "관리자 확정 문항",
        finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      return;
    }
    if (!problem.question_image_path) throw new Error("문항 이미지가 없습니다.");

    const downloaded = await supabase.storage.from("question-images").download(problem.question_image_path);
    if (downloaded.error || !downloaded.data) throw new Error(downloaded.error?.message || "문항 이미지 다운로드 실패");
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    const mime = downloaded.data.type || "image/webp";
    const imageUrl = `data:${mime};base64,${bytes.toString("base64")}`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY가 없습니다.");
    const model = process.env.OPENAI_DIFFICULTY_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";

    const references = await difficultyReferenceText(supabase, problem.subject);
    const result = await judgeDifficulty({
      apiKey, model, imageUrl,
      dna: problem.problem_dna,
      references,
      officialAnswer: problem.answer,
      timeoutMs: 120_000,
    });

    const before = normalizeDifficulty(problem.difficulty);
    const dna = applyJudgedDifficulty(problem.problem_dna, result, before || null);

    // 화면 재판정과 완전히 같은 기준으로 저장한다.
    // 미판정·검토필요는 기존 난이도를 유지하고 검증 메타데이터만 남긴다.
    const payload: any = { problem_dna: dna, updated_at: new Date().toISOString() };
    const applied = result.decision === "graded" && !!result.final_grade && !result.review_required;
    if (applied) payload.difficulty = result.final_grade;
    const saved = await supabase.from("problem_bank_questions").update(payload).eq("id", questionId);
    if (saved.error) throw saved.error;

    await supabase.from("sos_difficulty_regrade_jobs").update({
      status: "DONE",
      before_difficulty: before || null,
      after_difficulty: applied ? String(result.final_grade) : (before || null),
      decision: result.decision,
      review_required: result.review_required,
      confidence: Number(result.confidence) || 0,
      last_error: null,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : "난이도 재판정 실패";
    const attempts = Number(job.attempt_count ?? 0);
    await supabase.from("sos_difficulty_regrade_jobs").update({
      // 재시도 여지가 남아 있으면 다시 큐로 돌려보낸다.
      status: attempts >= MAX_ATTEMPTS ? "FAILED" : "QUEUED",
      last_error: message.slice(0, 800),
      finished_at: attempts >= MAX_ATTEMPTS ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
  }
}

async function run(request: Request) {
  const expected = String(process.env.CRON_SECRET ?? "").trim();
  if (!expected) return NextResponse.json({ success: false, message: "CRON_SECRET 환경변수가 설정되지 않았습니다." }, { status: 503 });
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) return NextResponse.json({ success: false, message: "cron unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const sync = url.searchParams.get("sync") === "1";
  const size = Math.max(1, Math.min(20, Number(url.searchParams.get("size") || BATCH_SIZE)));

  const supabase = createClient();
  const cols = "id,question_id,status,attempt_count,priority";
  const staleCutoff = new Date(Date.now() - STALE_MINUTES * 60000).toISOString();

  // 죽은 채 RUNNING으로 남은 작업을 먼저 큐로 되돌린다.
  await supabase.from("sos_difficulty_regrade_jobs")
    .update({ status: "QUEUED", updated_at: new Date().toISOString() })
    .eq("status", "RUNNING").lt("started_at", staleCutoff);

  const picked = await supabase.from("sos_difficulty_regrade_jobs").select(cols)
    .eq("status", "QUEUED").lt("attempt_count", MAX_ATTEMPTS)
    .order("priority", { ascending: true }).order("queued_at", { ascending: true })
    .limit(size);
  if (picked.error) throw picked.error;

  const jobs: any[] = picked.data ?? [];
  if (!jobs.length) {
    const remain = await supabase.from("sos_difficulty_regrade_jobs")
      .select("id", { count: "exact", head: true }).eq("status", "QUEUED");
    return NextResponse.json({ success: true, processed: 0, queued: remain.count ?? 0, message: "대기 중인 작업이 없습니다." });
  }

  // 선점. 다른 실행이 먼저 가져간 건은 조용히 빠진다.
  const claimed: any[] = [];
  for (const job of jobs) {
    const r = await supabase.from("sos_difficulty_regrade_jobs").update({
      status: "RUNNING",
      started_at: new Date().toISOString(),
      attempt_count: Number(job.attempt_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id).eq("status", "QUEUED").select("id,question_id,attempt_count").maybeSingle();
    if (!r.error && r.data) claimed.push({ ...job, ...r.data });
  }
  if (!claimed.length) return NextResponse.json({ success: true, processed: 0, raced: true });

  const work = async () => {
    const client = createClient();
    // 동시 4건. 화면 재판정과 같은 수준으로 맞춘다.
    for (let i = 0; i < claimed.length; i += 4) {
      await Promise.all(claimed.slice(i, i + 4).map(job => processOne(client, job)));
    }
  };

  if (sync) {
    await work();
    return NextResponse.json({ success: true, processed: claimed.length, sync: true });
  }

  after(work);
  return NextResponse.json({
    success: true, accepted: claimed.length, processed: claimed.length,
    message: "난이도 재판정을 시작했습니다. 진행 상황은 난이도 관리 화면에서 확인하세요.",
  }, { status: 202 });
}

export async function GET(request: Request) {
  try { return await run(request); }
  catch (e) { return NextResponse.json({ success: false, message: e instanceof Error ? e.message : "worker error" }, { status: 500 }); }
}
export async function POST(request: Request) { return GET(request); }
