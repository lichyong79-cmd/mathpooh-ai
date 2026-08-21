import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registerQuestions } from "@/lib/problem-bank";
import { requireUser, requireAdmin } from "@/lib/supabase/auth";
import { PROBLEM_DNA_VERSION, validateProblemDNA } from "@/lib/problem-dna";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function registrationMissing(item: any) {
  const result = { ...(item.ai_result ?? {}), ...(item.review_result ?? {}) } as Record<string, any>;
  const dna = result.problem_dna;
  if (dna?.schema_version === PROBLEM_DNA_VERSION) {
    const validation = validateProblemDNA(dna);
    const required: Array<[string, unknown]> = [
      ["정답", item.answer], ["과목", dna.basic?.subject], ["학년", dna.basic?.grade],
      ["교육과정", dna.basic?.curriculum], ["대단원", dna.basic?.major_unit],
      ["중단원", dna.basic?.middle_unit], ["소단원", dna.basic?.minor_unit],
      ["세부주제", dna.basic?.detailed_topic], ["문항형식", dna.basic?.question_format],
      ["난이도", dna.difficulty?.final_grade], ["문항요약", dna.summary?.one_line],
    ];
    const missing = required.filter(([, value]) => !String(value ?? "").trim() || value === "unknown").map(([label]) => label);
    if (!validation.valid) missing.push("Problem DNA 검증");
    if (!Array.isArray(dna.basic?.problem_types) || !dna.basic.problem_types.length) missing.push("문항유형");
    if (!Array.isArray(dna.concept?.core_concepts) || !dna.concept.core_concepts.length) missing.push("핵심개념");
    if (!Array.isArray(dna.thinking?.process) || !dna.thinking.process.length) missing.push("사고과정");
    if (!Array.isArray(dna.solution?.representative_solution) || !dna.solution.representative_solution.length) missing.push("대표풀이");
    if (!Array.isArray(dna.abilities) || !dna.abilities.length) missing.push("요구능력");
    if (!Array.isArray(dna.educational_value?.training_objectives) || !dna.educational_value.training_objectives.length) missing.push("훈련목적");
    const officialSolutionImagePath = String(result.official_solution_image_path ?? "").trim();
    // 실제 문항별 해설 이미지가 있으면 "해설 없음"으로 차단하지 않는다.
    // 정답 교차검증은 AI 재분석으로 갱신할 수 있으므로 이미지 존재 자체와 분리한다.
    if (!officialSolutionImagePath && !dna.official_solution?.matched_question) missing.push("공식 해설 문항확인");
    if (officialSolutionImagePath && dna.official_solution?.answer_matches === false) missing.push("공식 정답 교차검증");
    return [...new Set(missing)];
  }

  const required: Array<[string, unknown]> = [
    ["정답", item.answer], ["과목", result.subject], ["단원", result.unit],
    ["세부유형", result.topic], ["문항형식", result.question_type],
    ["난이도", result.difficulty], ["문항요약", result.summary],
  ];
  return required.filter(([, value]) => !text(value) || value === "unknown").map(([label]) => label);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();  // SOS280: 관리자 전용
  if (denied) return denied;

  try {
    const { analysisId, questionIds } = await request.json() as { analysisId?: string; questionIds?: string[] };
    if (!analysisId) {
      return NextResponse.json({ success: false, message: "분석 ID가 없습니다." }, { status: 400 });
    }

    const supabase = createClient();
    const analysisQuery = await supabase
      .from("source_analysis")
      .select("*")
      .eq("id", analysisId)
      .single();
    if (analysisQuery.error || !analysisQuery.data) {
      throw analysisQuery.error ?? new Error("분석 정보를 찾을 수 없습니다.");
    }

    const sourceQuery = await supabase
      .from("source_files")
      .select("*")
      .eq("id", analysisQuery.data.source_file_id)
      .single();
    if (sourceQuery.error || !sourceQuery.data) {
      throw sourceQuery.error ?? new Error("원본 시험지를 찾을 수 없습니다.");
    }

    const questionQuery = await supabase
      .from("analysis_questions")
      .select("id,question_no,answer,status,confidence,ai_result,review_result,page_no,crop_x,crop_y,crop_width,crop_height,question_image_path")
      .eq("analysis_id", analysisId)
      .order("question_no");
    if (questionQuery.error) throw questionQuery.error;

    const questions = questionQuery.data ?? [];
    const requestedIds = Array.isArray(questionIds) && questionIds.length > 0 ? new Set(questionIds) : null;
    const candidates = questions.filter((item) =>
      (item.status === "APPROVED" || item.status === "AUTO_REGISTERED") &&
      (!requestedIds || requestedIds.has(item.id))
    );
    const rejected = candidates
      .map((item) => ({ item, missing: registrationMissing(item) }))
      .filter((entry) => entry.missing.length > 0);
    const rejectedIds = new Set(rejected.map((entry) => entry.item.id));
    const registerable = candidates.filter((item) => !rejectedIds.has(item.id));

    for (const entry of rejected) {
      const reason = `문제은행 등록 차단 · 필수 분류 누락: ${entry.missing.join(", ")}`;
      const blocked = await supabase.from("analysis_questions").update({
        status: "REVIEW",
        review_reason: reason,
        updated_at: new Date().toISOString(),
      }).eq("id", entry.item.id);
      if (blocked.error) throw blocked.error;
    }
    if (registerable.length === 0) {
      const detail = rejected.length ? ` 필수 분류가 비어 있는 ${rejected.length}문항은 보류로 이동했습니다.` : "";
      return NextResponse.json({ success: false, message: `등록할 문항이 없습니다.${detail}` }, { status: 400 });
    }

    const result = await registerQuestions(supabase, sourceQuery.data, registerable);
    const now = new Date().toISOString();

    // analysis_questions.status는 AI 분석/검토 상태만 관리한다.
    // 실제 등록 문항과 중복 제외 문항을 review_result.bank_status로 구분한다.
    const registeredIds = new Set(result.registeredQuestionIds ?? []);
    const duplicateMap = new Map((result.duplicates ?? []).map((item: any) => [item.questionId, item]));

    const registrationUpdates = await Promise.all(
      registerable.map(async (item) => {
        const duplicate = duplicateMap.get(item.id) as any;
        const nextReviewResult = registeredIds.has(item.id)
          ? {
              ...(item.review_result ?? {}),
              bank_status: "REGISTERED",
              bank_registered_at: now,
              duplicate_status: null,
              duplicate_of: null,
            }
          : duplicate
            ? {
                ...(item.review_result ?? {}),
                bank_status: "DUPLICATE_SKIPPED",
                bank_registered_at: null,
                duplicate_status: "EXACT",
                duplicate_of: duplicate.existingProblemId,
                duplicate_title: duplicate.existingTitle,
                duplicate_checked_at: now,
              }
            : item.review_result ?? {};

        return supabase
          .from("analysis_questions")
          .update({
            review_result: nextReviewResult,
            review_reason: duplicate ? `문제은행 완전중복 · 기존 문항: ${duplicate.existingTitle}` : null,
            updated_at: now,
          })
          .eq("id", item.id);
      }),
    );
    const registrationUpdateError = registrationUpdates.find((item) => item.error)?.error;
    if (registrationUpdateError) throw registrationUpdateError;
    const analysisUpdate = await supabase
      .from("source_analysis")
      .update({
        status: "DONE",
        progress: 100,
        current_step: "문제은행 등록 완료",
        finished_at: now,
        updated_at: now,
      })
      .eq("id", analysisId);
    if (analysisUpdate.error) throw analysisUpdate.error;

    return NextResponse.json({
      success: true,
      registered: result.registered,
      embedded: result.embedded,
      duplicates: result.duplicates?.length ?? 0,
      duplicateItems: result.duplicates ?? [],
      blocked: rejected.length,
      message: `${result.registered}개 문항을 문제은행에 등록했습니다.${result.duplicates?.length ? ` 완전중복 ${result.duplicates.length}문항은 기존 문항을 유지하고 추가 등록하지 않았습니다.` : ""}${rejected.length ? ` 분류 누락 ${rejected.length}문항은 보류했습니다.` : ""}`,
    });
  } catch (error: any) {
    console.error("[problem-bank/register]", error);
    return NextResponse.json(
      {
        success: false,
        message: error?.message || "문제은행 등록에 실패했습니다.",
        code: error?.code || null,
        details: error?.details || null,
        hint: error?.hint || null,
      },
      { status: 500 },
    );
  }
}
