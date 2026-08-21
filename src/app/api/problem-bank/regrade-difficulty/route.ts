import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireAdmin } from "@/lib/supabase/auth";
import { normalizeDifficulty } from "@/lib/difficulty-scale";
import {
  DIFFICULTY_JUDGE_VERSION,
  DifficultyVerificationError,
  applyJudgedDifficulty,
  formatDifficultyReferences,
  judgeDifficulty,
} from "@/lib/difficulty-judge";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// v164: 난이도 판정 프롬프트/스키마는 src/lib/difficulty-judge.ts 한 곳에만 둔다.
// 신규 문항 등록(AI 분석)과 난이도 탭 재판정이 같은 기준을 쓰도록 하기 위한 것이다.
export async function POST(request: NextRequest) {
  try {
    const denied = await requireAdmin();  // SOS280: 관리자 전용
    if (denied) return denied;

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const problemId = String((body as any)?.problemId ?? "").trim();
    const dryRun = (body as any)?.dryRun === true;
    const referenceIds: string[] = Array.isArray((body as any)?.referenceIds)
      ? (body as any).referenceIds.map((x: unknown) => String(x ?? "").trim()).filter(Boolean).slice(0, 24)
      : [];
    if (!problemId) return NextResponse.json({ success: false, message: "problemId가 필요합니다." }, { status: 400 });

    const supabase = await createClient();
    const { data: problem, error } = await supabase
      .from("problem_bank_questions")
      .select("id,subject,question_image_path,problem_dna,difficulty,answer")
      .eq("id", problemId)
      .single();
    if (error || !problem) {
      return NextResponse.json({ success: false, message: error?.message || "문항을 찾지 못했습니다." }, { status: 404 });
    }
    if (!problem.question_image_path) {
      return NextResponse.json({ success: false, message: "문항 이미지가 없습니다." }, { status: 400 });
    }

    const downloaded = await supabase.storage.from("question-images").download(problem.question_image_path);
    if (downloaded.error || !downloaded.data) {
      return NextResponse.json({ success: false, message: downloaded.error?.message || "문항 이미지 다운로드 실패" }, { status: 500 });
    }
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    const mime = downloaded.data.type || "image/webp";
    const imageDataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

    let references = "";
    if (referenceIds.length) {
      const { data: refs } = await supabase
        .from("problem_bank_questions")
        .select("id,subject,unit,topic,difficulty,problem_dna")
        .in("id", referenceIds);
      const adminFixed = (refs ?? []).filter(
        (row: any) => row?.problem_dna?.difficulty?.admin_fixed === true && row?.problem_dna?.difficulty?.scale_version === "sos8-v1",
      );
      references = formatDifficultyReferences(adminFixed as any, problem.subject, 3);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ success: false, message: "OPENAI_API_KEY가 없습니다." }, { status: 500 });
    const model = process.env.OPENAI_DIFFICULTY_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";

    let result;
    try {
      result = await judgeDifficulty({
        apiKey,
        model,
        imageUrl: imageDataUrl,
        dna: problem.problem_dna,
        references,
        officialAnswer: problem.answer,
        timeoutMs: 180_000,
      });
    } catch (judgeError) {
      const message = judgeError instanceof Error ? judgeError.message : "AI 난이도 판정 실패";
      if (judgeError instanceof DifficultyVerificationError) {
        return NextResponse.json({
          success: false,
          message,
          failureType: judgeError.failureType,
          failureStage: judgeError.stage,
          failureDetail: judgeError.detail,
        }, { status: judgeError.failureType === "http_429" ? 429 : 500 });
      }
      return NextResponse.json({ success: false, message, failureType: "unknown", failureStage: "unknown", failureDetail: "" }, { status: 500 });
    }

    const current = normalizeDifficulty(problem.difficulty);
    const dna = applyJudgedDifficulty(problem.problem_dna, result, current || null);

    // SOS240: 미판정/검토필요는 기존 difficulty를 절대 덮어쓰지 않는다.
    // dryRun=false여도 검증 메타데이터만 저장하고, 확정 가능한 graded 결과만 실제 난이도를 갱신한다.
    if (!dryRun) {
      const updatePayload: any = { problem_dna: dna, updated_at: new Date().toISOString() };
      if (result.decision === "graded" && result.final_grade && !result.review_required) updatePayload.difficulty = result.final_grade;
      const { error: updateError } = await supabase.from("problem_bank_questions").update(updatePayload).eq("id", problemId);
      if (updateError) return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      problemId,
      difficulty: result.final_grade,
      previousDifficulty: current || null,
      decision: result.decision,
      reviewRequired: result.review_required,
      reviewReason: result.review_reason,
      solutionVerified: result.solution_verified,
      answerConsistency: result.answer_consistency,
      solvedAnswer: result.solve?.solved_answer ?? "",
      solveConfidence: result.solve?.confidence ?? 0,
      reasoningSteps: result.solve?.reasoning_steps ?? 0,
      conditionTransformations: result.solve?.condition_transformations ?? 0,
      calculationLoad: result.solve?.calculation_load ?? 0,
      insightLoad: result.solve?.insight_load ?? 0,
      reason: result.reason,
      confidence: result.confidence,
      csatPointEquivalent: result.csat_point_equivalent,
      csatDifficultyBand: result.csat_difficulty_band,
      dryRun,
      applied: !dryRun && result.decision === "graded" && !!result.final_grade && !result.review_required,
      version: DIFFICULTY_JUDGE_VERSION,
      previewJudgement: dryRun ? result : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "난이도 판정 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
