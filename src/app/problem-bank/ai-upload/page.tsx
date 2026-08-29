"use client";

import {
  FormEvent,
  PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import "./analysis.css";
import {
  buildDocumentAnchors,
  type DocumentAnchors,
  type QuestionAnchor,
} from "@/lib/crop/question-anchors";
import AdminPortalShell from "@/components/admin-portal-sidebar";
import MATHPOOHLoader from "@/components/math-pooh-loader";
import { DIFFICULTY_SCALE, difficultyLabel } from "@/lib/difficulty-scale";
import { SOURCE_WORKFLOW_LABEL, classifyQuestionStage, type SourceWorkflowState } from "@/lib/source-workflow";

type SourceFile = {
  id: string;
  created_at: string;
  title: string;
  source: string | null;
  grade: string | null;
  subject: string | null;
  status: string;
  error_message: string | null;
  workflow_label?: string;
  workflow_detail?: string;
  workflow_state?: SourceWorkflowState;
};

type Analysis = {
  id: string;
  status: string;
  progress: number | null;
  current_step: string | null;
  total_questions: number | null;
} | null;

type Question = {
  id: string;
  question_no: number;
  page_no: number | null;
  answer: string | null;
  status: string;
  confidence: number | null;
  ai_result: Record<string, unknown> | null;
  review_result: Record<string, unknown> | null;
  crop_x: number | null;
  crop_y: number | null;
  crop_width: number | null;
  crop_height: number | null;
  question_image_path: string | null;
  review_reason?: string | null;
};

type Workspace = {
  source: SourceFile;
  analysis: Analysis;
  questions: Question[];
  /** 서버가 확인한 실제 문제은행 등록 문항. */
  registeredQuestionIds?: string[];
  registeredQuestionNos?: number[];
  examUrl: string | null;
  solutionUrl: string | null;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const statusText: Record<string, string> = {
  uploaded: "업로드 완료",
  PENDING: "분석 대기",
  WAITING: "분석 대기",
  RUNNING: "AI 분석 중",
  REVIEW: "검수 필요",
  APPROVED: "등록 대기",
  AUTO_REGISTERED: "등록 대기",
  REGISTERED: "등록 완료",
  REJECTED: "등록 제외",
  DONE: "분석 완료",
  FAILED: "분석 실패",
  completed: "분석 완료",
};

function apiErrorMessage(payload: any, fallback: string, status?: number) {
  const parts = [
    payload?.message || fallback,
    payload?.code ? `코드: ${payload.code}` : "",
    payload?.details ? `상세: ${payload.details}` : "",
    payload?.hint ? `힌트: ${payload.hint}` : "",
    status ? `HTTP ${status}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function valueOf(question: Question, key: string) {
  const review = question.review_result ?? {};
  const ai = question.ai_result ?? {};
  const direct = review[key] ?? ai[key];
  if (direct !== undefined && direct !== null && String(direct).trim()) {
    if (key === "question_type" && direct === "objective") return "multiple_choice";
    if (key === "question_type" && direct === "subjective") return "short_answer";
    return String(direct);
  }

  const dna = ai.problem_dna && typeof ai.problem_dna === "object"
    ? ai.problem_dna as Record<string, any>
    : null;
  if (!dna) return "";
  if (key === "question_type") {
    const format = String(dna.basic?.question_format ?? "unknown");
    return format === "objective" ? "multiple_choice" : format;
  }
  if (key === "subject") return String(dna.basic?.subject ?? "");
  if (key === "unit") return String(dna.basic?.minor_unit ?? dna.basic?.middle_unit ?? dna.basic?.major_unit ?? "");
  if (key === "topic") return String(dna.basic?.detailed_topic ?? "");
  if (key === "difficulty") {
    return String(dna.difficulty?.final_grade ?? dna.difficulty?.overall_level ?? "");
  }
  if (key === "summary") return String(dna.summary?.one_line ?? "");
  return "";
}

function officialSolutionOf(question: Question, sourceHasSolution = false): {
  tone: "verified" | "review" | "missing";
  label: string;
  detail: string;
  solutionSteps: string[];
  issues: string[];
  officialAnswer: string;
  evidence: string;
} {
  const raw = question.ai_result?.official_solution;
  const solution = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const verification = String(solution.verification ?? "");
  const materializedPath = String(question.ai_result?.official_solution_image_path ?? "").trim();
  // 실제 문항별 해설 이미지가 저장되어 있으면 과거 connected 플래그보다 이것을 우선한다.
  const connected = Boolean(materializedPath) || solution.connected === true;
  const dna = question.ai_result?.problem_dna && typeof question.ai_result.problem_dna === "object"
    ? question.ai_result.problem_dna as Record<string, any>
    : null;
  const solutionSteps: string[] = Array.isArray(dna?.solution?.representative_solution)
    ? dna.solution.representative_solution.map((value: unknown) => String(value).trim()).filter(Boolean)
    : Array.isArray(dna?.thinking?.solution_steps)
      ? dna.thinking.solution_steps.map((value: unknown) => String(value).trim()).filter(Boolean)
    : [];
  const issues: string[] = Array.isArray(solution.issues)
    ? solution.issues.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const officialAnswer = String(solution.official_answer ?? "").trim();
  const evidence = String(solution.evidence_summary ?? "").trim();

  if (!connected) {
    if (sourceHasSolution) {
      return {
        tone: "review",
        label: "공식 해설 추출 확인 필요",
        detail: "해설지는 첨부되어 있지만 이 문항의 해설 이미지가 아직 연결되지 않았습니다. 문항 재분석 시 자동 연결을 다시 시도합니다.",
        solutionSteps, issues, officialAnswer, evidence,
      };
    }
    return { tone: "missing", label: "공식 해설 미연결", detail: "해설 PDF가 첨부되지 않았습니다.", solutionSteps, issues, officialAnswer, evidence };
  }
  // materializedPath가 있으면 과거 verification=missing 값은 stale 상태이므로 missing으로 보지 않는다.
  if (verification === "official_pdf_missing" && materializedPath) {
    return {
      tone: "review",
      label: "공식 해설 연결됨 · 재검증 필요",
      detail: "문항별 공식 해설 이미지는 연결되어 있습니다. 이전 분석의 미연결 기록만 남아 있어 재분석 시 교차검증 상태를 갱신합니다.",
      solutionSteps, issues, officialAnswer, evidence,
    };
  }
  if (verification === "manual_crop_connected" || verification === "official_pdf_image_connected") {
    return { tone: "verified", label: "공식 해설 이미지 연결 완료", detail: "문항별 공식 해설 이미지가 저장되어 있습니다.", solutionSteps, issues, officialAnswer, evidence };
  }
  if (verification === "official_pdf_review_required") {
    return { tone: "review", label: "공식 해설 확인 필요", detail: issues.join(" · ") || "해설 탐색 또는 정답 교차검증 결과를 확인해 주세요.", solutionSteps, issues, officialAnswer, evidence };
  }
  return { tone: "verified", label: "공식 해설 교차검증 완료", detail: "같은 문항번호의 공식 해설을 분석에 함께 사용했습니다.", solutionSteps, issues, officialAnswer, evidence };
}

/**
 * v164: 등록완료 판정 기준을 서버(problem_bank_questions 행 존재)와 일치시킨다.
 * review_result.bank_status는 재분석 등으로 지워질 수 있어 보조 신호로만 쓴다.
 */
function isBankRegistered(
  question: Question,
  registeredIds?: Set<string>,
  registeredNos?: Set<number>,
) {
  if (registeredIds || registeredNos) {
    return Boolean(
      registeredIds?.has(question.id) ||
      registeredNos?.has(Number(question.question_no))
    );
  }
  return String(question.review_result?.bank_status ?? "") === "REGISTERED";
}

function displayQuestionStatus(question: Question, registeredIds?: Set<string>) {
  return isBankRegistered(question, registeredIds) ? "등록 완료" : (statusText[question.status] ?? question.status);
}

function sourceWorkflowTone(state?: SourceWorkflowState) {
  if (state === "REGISTERED") return "registered";
  if (state === "REVIEW" || state === "PENDING") return "analysis";
  if (state === "ANALYZING") return "crop";
  if (state === "FAILED") return "recognition";
  return "idle";
}

function dnaLabels(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => typeof value === "object" && value ? String((value as any).tag ?? "") : String(value ?? "")).map((value) => value.trim()).filter(Boolean);
}

function DnaLine({ label, values }: { label: string; values: unknown }) {
  const items = dnaLabels(values);
  if (!items.length) return null;
  return <div className="dna-line"><b>{label}</b><span>{items.join(" · ")}</span></div>;
}

function ProblemDnaCard({ question }: { question: Question }) {
  const raw = question.ai_result?.problem_dna;
  if (!raw || typeof raw !== "object") return null;
  const dna = raw as Record<string, any>;
  const basic = dna.basic ?? {};
  const concept = dna.concept ?? {};
  const thinking = dna.thinking ?? {};
  const solution = dna.solution ?? {};
  const difficulty = dna.difficulty ?? {};
  const value = dna.educational_value ?? {};
  const summary = dna.summary ?? {};
  const process = Array.isArray(thinking.process) ? thinking.process.map((step: any) => `${step.stage}: ${step.action}`).filter(Boolean) : [];

  return <section className="dna-card">
    <div className="dna-card-title"><div><small>Problem DNA v3.0</small><strong>{question.question_no}번 문항분석 카드</strong></div><em>{difficulty.final_grade || "-"}</em></div>
    <details open><summary>문항분류</summary><div className="dna-section">
      <div className="dna-line"><b>분류</b><span>{[basic.subject, basic.grade, basic.curriculum, basic.major_unit, basic.middle_unit, basic.minor_unit, basic.detailed_topic].filter(Boolean).join(" / ")}</span></div>
      <DnaLine label="문항유형" values={[basic.question_format, ...(basic.problem_types ?? []), ...(basic.presentation_types ?? [])]} />
    </div></details>
    <details><summary>개념 DNA</summary><div className="dna-section">
      <DnaLine label="핵심" values={concept.core_concepts} /><DnaLine label="보조" values={concept.supporting_concepts} /><DnaLine label="선수" values={concept.prerequisite_concepts} /><DnaLine label="연결" values={concept.linked_concepts} />
      <DnaLine label="공식·정리" values={[...(concept.formulas ?? []), ...(concept.theorems ?? [])]} /><DnaLine label="적용방식" values={concept.application_methods} />
    </div></details>
    <details><summary>사고 DNA</summary><div className="dna-section"><DnaLine label="과정" values={process} /><DnaLine label="사고유형" values={thinking.thinking_types} /><div className="dna-line"><b>핵심발상</b><span>{thinking.key_insight}</span></div></div></details>
    <details><summary>풀이 DNA</summary><div className="dna-section"><DnaLine label="주요전략" values={solution.strategies} /><DnaLine label="대표풀이" values={solution.representative_solution} /><DnaLine label="최단풀이" values={solution.shortest_solution} /><DnaLine label="대안풀이" values={solution.alternative_solutions} /></div></details>
    <details><summary>난이도·요구능력 DNA</summary><div className="dna-section">
      <div className="dna-score-grid"><span>최종 <b>{difficulty.final_grade}</b></span><span>개념 <b>{difficulty.concept}</b></span><span>해석 <b>{difficulty.condition_interpretation}</b></span><span>발상 <b>{difficulty.insight}</b></span><span>계산 <b>{difficulty.calculation}</b></span><span>시간 <b>{difficulty.time_burden}</b></span></div>
      <DnaLine label="요구능력" values={dna.abilities} /><DnaLine label="난이도근거" values={difficulty.reasons} />
    </div></details>
    <details><summary>오답·함정 DNA</summary><div className="dna-section"><DnaLine label="예상오류" values={dna.errors} /><DnaLine label="함정요소" values={dna.traps} /><div className="dna-line"><b>지도포인트</b><span>{summary.teaching_point}</span></div></div></details>
    <details><summary>활용 DNA</summary><div className="dna-section"><DnaLine label="훈련목적" values={value.training_objectives} /><DnaLine label="추천수준" values={value.recommended_student_levels} /><DnaLine label="유사문항" values={value.similar_question_features} /><DnaLine label="변형포인트" values={value.mutation_points} /></div></details>
    <div className="dna-final"><b>{summary.one_line}</b><span>진입점: {summary.first_entry_point}</span><span>막힘: {summary.common_sticking_point}</span><span>결정점: {summary.decisive_solving_point}</span></div>
  </section>;
}


const CROP_PADDING = {
  left: 18,
  top: 16,
  right: 18,
  bottom: 20,
} as const;

const AUTO_EXPAND = {
  x: 3.2,
  top: 4.5,
  bottom: 13.0,
} as const;

type CanonicalCrop = {
  rect: Rect;
  canvas: HTMLCanvasElement;
};

const CROP_ENGINE_VERSION = "text-anchor-v2";

/** 텍스트 앵커 자르기에서 내용 바깥으로 남길 여백(px, 렌더 캔버스 기준) */
const ANCHOR_PADDING = {
  left: 14,
  top: 30,
  right: 14,
  bottom: 14,
} as const;

function isCanonicalized(question: Question) {
  return String(question.review_result?.crop_engine_version ?? "") === CROP_ENGINE_VERSION;
}

function cropExact(pageCanvas: HTMLCanvasElement, rect: Rect): CanonicalCrop {
  const sx = Math.max(0, Math.floor(pageCanvas.width * rect.x / 100));
  const sy = Math.max(0, Math.floor(pageCanvas.height * rect.y / 100));
  const ex = Math.min(pageCanvas.width, Math.ceil(pageCanvas.width * (rect.x + rect.width) / 100));
  const ey = Math.min(pageCanvas.height, Math.ceil(pageCanvas.height * (rect.y + rect.height) / 100));
  const sw = Math.max(1, ex - sx);
  const sh = Math.max(1, ey - sy);
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const context = out.getContext("2d");
  if (context) {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, sw, sh);
    context.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  }
  return { rect, canvas: out };
}

type InkMask = {
  sw: number;
  sh: number;
  /** 1 = 실제 내용 잉크. 페이지 테두리·단 구분선 같은 긴 직선은 0으로 뺀다. */
  mask: Uint8Array;
  rowInk: Uint32Array;
  rowMin: number;
};

/** 캔버스를 잉크 마스크로 바꾼다. 이후 상·하·좌·우 판정은 모두 이 마스크로 한다. */
function buildInkMask(region: HTMLCanvasElement): InkMask | null {
  const sw = region.width;
  const sh = region.height;
  const context = region.getContext("2d", { willReadFrequently: true });
  if (!context || sw < 2 || sh < 2) return null;
  const pixels = context.getImageData(0, 0, sw, sh).data;

  const raw = new Uint8Array(sw * sh);
  const rawRow = new Uint32Array(sh);
  const rawCol = new Uint32Array(sw);

  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      const i = (y * sw + x) * 4;
      const lum = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
      if (pixels[i + 3] > 20 && lum < 242) {
        raw[y * sw + x] = 1;
        rawRow[y] += 1;
        rawCol[x] += 1;
      }
    }
  }

  const structuralRow = new Uint8Array(sh);
  const structuralCol = new Uint8Array(sw);
  for (let y = 0; y < sh; y += 1) if (rawRow[y] >= sw * 0.72) structuralRow[y] = 1;
  for (let x = 0; x < sw; x += 1) if (rawCol[x] >= sh * 0.72) structuralCol[x] = 1;

  const mask = new Uint8Array(sw * sh);
  const rowInk = new Uint32Array(sh);
  for (let y = 0; y < sh; y += 1) {
    if (structuralRow[y]) continue;
    for (let x = 0; x < sw; x += 1) {
      if (structuralCol[x]) continue;
      if (raw[y * sw + x]) {
        mask[y * sw + x] = 1;
        rowInk[y] += 1;
      }
    }
  }

  return { sw, sh, mask, rowInk, rowMin: Math.max(2, Math.floor(sw * 0.0015)) };
}

function rowHasInk(ink: InkMask, y: number) {
  return y >= 0 && y < ink.sh && ink.rowInk[y] >= ink.rowMin;
}

/**
 * 기준 행에서 시작해 잉크가 끊기지 않는 동안 위로 올라가, 그 덩어리의 진짜 상단을 찾는다.
 *
 * 분수 분자, 지수, 근호처럼 문항번호 줄에 "붙어 있는" 요소는 행이 이어져 있으므로 포함되고,
 * 줄 간격만큼 떨어져 있는 이전 문항의 마지막 줄은 공백에서 끊기므로 포함되지 않는다.
 * 13번처럼 첫 줄에 분수가 있는 문항이 잘리던 원인이 여기였다.
 */
function climbToBlockTop(ink: InkMask, startRow: number, joinGap: number) {
  let seed = -1;
  for (let y = Math.max(0, startRow - joinGap); y < ink.sh; y += 1) {
    if (rowHasInk(ink, y)) {
      seed = y;
      break;
    }
  }
  if (seed < 0) return null;

  let top = seed;
  let gap = 0;
  for (let y = seed - 1; y >= 0; y -= 1) {
    if (rowHasInk(ink, y)) {
      top = y;
      gap = 0;
    } else {
      gap += 1;
      if (gap > joinGap) break;
    }
  }
  return top;
}

/** 한계 행 이하에서 마지막 잉크 행을 찾는다. 중간 공백은 그냥 통과한다. */
function lastInkRow(ink: InkMask, limitRow: number) {
  for (let y = Math.min(limitRow, ink.sh - 1); y >= 0; y -= 1) {
    if (rowHasInk(ink, y)) return y;
  }
  return null;
}

/** 단의 마지막 문항용. 큰 공백을 만나면 멈춰 꼬리말이 딸려오지 않게 한다. */
function descendToBlockBottom(ink: InkMask, startRow: number, maxGap: number) {
  let bottom = startRow;
  let gap = 0;
  for (let y = Math.max(0, startRow); y < ink.sh; y += 1) {
    if (rowHasInk(ink, y)) {
      bottom = y;
      gap = 0;
    } else {
      gap += 1;
      if (gap > maxGap) break;
    }
  }
  return bottom;
}

/** 확정된 행 구간 안에서만 좌우 경계를 계산한다. */
function columnBoundsInRows(ink: InkMask, top: number, bottom: number) {
  const colInk = new Uint32Array(ink.sw);
  for (let y = top; y <= bottom; y += 1) {
    const base = y * ink.sw;
    for (let x = 0; x < ink.sw; x += 1) {
      if (ink.mask[base + x]) colInk[x] += 1;
    }
  }
  const colMin = Math.max(1, Math.floor((bottom - top + 1) * 0.0015));

  let left = 0;
  while (left < ink.sw && colInk[left] < colMin) left += 1;
  let right = ink.sw - 1;
  while (right > left && colInk[right] < colMin) right -= 1;
  if (left >= ink.sw || right <= left) return null;
  return { left, right };
}

/**
 * 기본 자르기 엔진 (SOS58).
 * 위·아래 경계는 PDF에 실제로 인쇄된 문항번호 좌표가 이미 확정한다.
 * 픽셀 판독은 그 밴드 "안에서" 여백을 줄이는 데만 쓰고, 절대 밖으로 넓히지 않는다.
 * 따라서 이전 문항 선택지나 다음 문항이 끌려올 수 없다.
 */
function buildAnchorCrop(pageCanvas: HTMLCanvasElement, anchor: QuestionAnchor): CanonicalCrop {
  const pageH = pageCanvas.height;

  // 위쪽을 넉넉히 열어둔다. 실제 시작점은 잉크 연결성으로 다시 좁힌다.
  const bandTopPct = Math.max(0, anchor.topPct - 2.6);
  // 다음 문항의 첫 줄이 밴드 안에 들어와야 그 줄의 진짜 상단을 계산할 수 있다.
  const bandBottomPct = anchor.nextTopPct === null
    ? Math.min(100, anchor.bottomPct)
    : Math.min(100, anchor.nextTopPct + 1.8);

  const fallbackRect: Rect = {
    x: anchor.columnLeftPct,
    y: Math.max(0, anchor.topPct - 2.6),
    width: Math.max(1, anchor.columnRightPct - anchor.columnLeftPct),
    height: Math.max(1, anchor.bottomPct - Math.max(0, anchor.topPct - 2.6)),
  };

  const sx = Math.max(0, Math.floor((pageCanvas.width * anchor.columnLeftPct) / 100));
  const ex = Math.min(pageCanvas.width, Math.ceil((pageCanvas.width * anchor.columnRightPct) / 100));
  const sy = Math.max(0, Math.floor((pageH * bandTopPct) / 100));
  const ey = Math.min(pageH, Math.ceil((pageH * bandBottomPct) / 100));
  const sw = Math.max(1, ex - sx);
  const sh = Math.max(1, ey - sy);

  const region = document.createElement("canvas");
  region.width = sw;
  region.height = sh;
  const context = region.getContext("2d", { willReadFrequently: true });
  if (!context) return cropExact(pageCanvas, fallbackRect);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, sw, sh);
  context.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const ink = buildInkMask(region);
  if (!ink) return cropExact(pageCanvas, fallbackRect);

  // 줄 안에서 붙어 있는 요소(분수 분자·지수)와, 줄 간격만큼 떨어진 다른 문항을 가르는 기준.
  const joinGap = Math.max(3, Math.round(pageH * 0.0022));

  const anchorRow = Math.round((pageH * anchor.topPct) / 100) - sy;
  const blockTop = climbToBlockTop(ink, anchorRow, joinGap);
  if (blockTop === null) return cropExact(pageCanvas, fallbackRect);

  let blockBottom: number;
  if (anchor.nextTopPct === null) {
    // 단의 마지막 문항도 footerTop으로 제한된 안전 밴드 안에서는 마지막 잉크까지 포함한다.
    // 본문과 선택지 사이의 큰 공백을 종료점으로 쓰면 선택지가 떨어진 2번·6번이 잘린다.
    blockBottom = lastInkRow(ink, ink.sh - 1) ?? blockTop;
  } else {
    // 다음 문항의 진짜 시작점 바로 위까지가 이 문항의 영역이다.
    // 중간 공백은 무시하므로 도형·선택지 앞의 넓은 여백이 있어도 끝까지 살아남는다.
    const nextRow = Math.round((pageH * anchor.nextTopPct) / 100) - sy;
    const nextTop = climbToBlockTop(ink, nextRow, joinGap);
    const limit = nextTop === null ? ink.sh - 1 : Math.max(blockTop, nextTop - 1);
    blockBottom = lastInkRow(ink, limit) ?? limit;
  }
  if (blockBottom < blockTop) blockBottom = blockTop;

  const sides = columnBoundsInRows(ink, blockTop, blockBottom);
  if (!sides) return cropExact(pageCanvas, fallbackRect);

  const top = Math.max(0, blockTop - ANCHOR_PADDING.top);
  const bottom = Math.min(sh - 1, blockBottom + ANCHOR_PADDING.bottom);
  const left = Math.max(0, sides.left - ANCHOR_PADDING.left);
  const right = Math.min(sw - 1, sides.right + ANCHOR_PADDING.right);

  const out = document.createElement("canvas");
  out.width = Math.max(1, right - left + 1);
  out.height = Math.max(1, bottom - top + 1);
  const outContext = out.getContext("2d");
  if (!outContext) return cropExact(pageCanvas, fallbackRect);
  outContext.fillStyle = "#fff";
  outContext.fillRect(0, 0, out.width, out.height);
  outContext.drawImage(region, left, top, out.width, out.height, 0, 0, out.width, out.height);

  return {
    rect: {
      x: ((sx + left) / pageCanvas.width) * 100,
      y: ((sy + top) / pageCanvas.height) * 100,
      width: (out.width / pageCanvas.width) * 100,
      height: (out.height / pageCanvas.height) * 100,
    },
    canvas: out,
  };
}

/**
 * 예비 자르기 엔진 (스캔 PDF 전용).
 * 텍스트 레이어가 없어 앵커를 못 찾을 때만 쓴다.
 * AI 좌표를 안전하게 넓힌 뒤, 실제 인쇄 내용의 경계를 한 번만 계산한다.
 */
function buildCanonicalCrop(
  pageCanvas: HTMLCanvasElement,
  input: Rect,
  options?: { questionNumberY?: number | null },
): CanonicalCrop {
  const isLeftColumn = input.x + input.width / 2 < 50;
  const columnMin = isLeftColumn ? 0 : 50.35;
  const columnMax = isLeftColumn ? 49.65 : 100;

  const expandedLeft = Math.max(columnMin, input.x - AUTO_EXPAND.x);
  const anchorY = Number(options?.questionNumberY);
  // AI가 저장한 실제 문항번호 y가 있으면 그 위 0.85%까지만 탐색한다.
  // 페이지 최상단의 교재명·페이지번호·가로선이 Content Box에 끌려오는 것을 막는다.
  const expandedTop = Number.isFinite(anchorY)
    ? Math.max(0, anchorY - 0.85)
    : Math.max(0, input.y - AUTO_EXPAND.top);
  const expandedRight = Math.min(columnMax, input.x + input.width + AUTO_EXPAND.x);
  const expandedBottom = Math.min(100, input.y + input.height + AUTO_EXPAND.bottom);

  const sx = Math.max(0, Math.floor(pageCanvas.width * expandedLeft / 100));
  const sy = Math.max(0, Math.floor(pageCanvas.height * expandedTop / 100));
  const ex = Math.min(pageCanvas.width, Math.ceil(pageCanvas.width * expandedRight / 100));
  const ey = Math.min(pageCanvas.height, Math.ceil(pageCanvas.height * expandedBottom / 100));
  const sw = Math.max(1, ex - sx);
  const sh = Math.max(1, ey - sy);

  const region = document.createElement("canvas");
  region.width = sw;
  region.height = sh;
  const regionContext = region.getContext("2d", { willReadFrequently: true });
  if (!regionContext) return { rect: input, canvas: region };
  regionContext.fillStyle = "#fff";
  regionContext.fillRect(0, 0, sw, sh);
  regionContext.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const pixels = regionContext.getImageData(0, 0, sw, sh).data;
  const rawRowInk = new Uint32Array(sh);
  const rawColInk = new Uint32Array(sw);

  const isInk = (x: number, y: number) => {
    const i = (y * sw + x) * 4;
    const lum = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
    return pixels[i + 3] > 20 && lum < 242;
  };

  // 먼저 원본 잉크량을 계산하여 페이지 테두리·단 구분선처럼 길게 이어지는 선을 찾는다.
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      if (isInk(x, y)) {
        rawRowInk[y] += 1;
        rawColInk[x] += 1;
      }
    }
  }

  const structuralRows = new Uint8Array(sh);
  const structuralCols = new Uint8Array(sw);
  for (let y = 0; y < sh; y += 1) {
    if (rawRowInk[y] >= sw * 0.72) structuralRows[y] = 1;
  }
  for (let x = 0; x < sw; x += 1) {
    if (rawColInk[x] >= sh * 0.72) structuralCols[x] = 1;
  }

  const rowInk = new Uint32Array(sh);
  const colInk = new Uint32Array(sw);
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      // 긴 세로/가로선과 그 바로 옆 1px는 글자 영역 판정에서 제외한다.
      if (
        structuralRows[y] || structuralRows[Math.max(0, y - 1)] || structuralRows[Math.min(sh - 1, y + 1)] ||
        structuralCols[x] || structuralCols[Math.max(0, x - 1)] || structuralCols[Math.min(sw - 1, x + 1)]
      ) continue;
      if (isInk(x, y)) {
        rowInk[y] += 1;
        colInk[x] += 1;
      }
    }
  }

  const rowMin = Math.max(2, Math.floor(sw * 0.0015));
  const colMin = Math.max(2, Math.floor(sh * 0.0015));
  const rowHas = (y: number) => rowInk[y] >= rowMin;
  const colHas = (x: number) => colInk[x] >= colMin;

  let top = 0;
  while (top < sh && !rowHas(top)) top += 1;
  let bottom = sh - 1;
  while (bottom > top && !rowHas(bottom)) bottom -= 1;

  // 잉크 덩어리 사이의 매우 큰 공백을 이용해 이전 문항의 선택지나 페이지 꼬리말을 제거한다.
  // 일반적인 수식 줄 간격은 유지하고, 영역 높이의 7% 이상인 공백만 경계 후보로 본다.
  if (top < bottom) {
    const bands: Array<{ start: number; end: number }> = [];
    let y = top;
    const joinGap = Math.max(3, Math.floor(sh * 0.006));
    while (y <= bottom) {
      while (y <= bottom && !rowHas(y)) y += 1;
      if (y > bottom) break;
      const start = y;
      let lastInk = y;
      let gap = 0;
      while (y <= bottom) {
        if (rowHas(y)) {
          lastInk = y;
          gap = 0;
        } else {
          gap += 1;
          if (gap > joinGap) break;
        }
        y += 1;
      }
      bands.push({ start, end: lastInk });
    }

    const hugeGap = Math.max(42, Math.floor(sh * 0.07));
    if (bands.length >= 2) {
      // 앞쪽의 짧은 찌꺼기 뒤에 큰 공백이 있으면 실제 문항은 아래쪽 덩어리로 본다.
      for (let i = 0; i < bands.length - 1; i += 1) {
        const gap = bands[i + 1].start - bands[i].end - 1;
        const upperHeight = bands[i].end - bands[0].start + 1;
        const lowerHeight = bands[bands.length - 1].end - bands[i + 1].start + 1;
        if (gap >= hugeGap && upperHeight <= sh * 0.22 && lowerHeight > upperHeight * 1.15) {
          top = bands[i + 1].start;
        }
      }

      // 본문 뒤 큰 공백 아래에 작은 슬로건/페이지 문구만 있으면 잘라낸다.
      for (let i = bands.length - 2; i >= 0; i -= 1) {
        const gap = bands[i + 1].start - bands[i].end - 1;
        const trailingHeight = bands[bands.length - 1].end - bands[i + 1].start + 1;
        const bodyHeight = bands[i].end - top + 1;
        if (gap >= hugeGap && trailingHeight <= sh * 0.14 && bodyHeight > trailingHeight * 1.8) {
          bottom = bands[i].end;
          break;
        }
      }
    }
  }

  let left = 0;
  while (left < sw && !colHas(left)) left += 1;
  let right = sw - 1;
  while (right > left && !colHas(right)) right -= 1;

  if (top >= sh || left >= sw || bottom <= top || right <= left) {
    return { rect: input, canvas: region };
  }

  left = Math.max(0, left - CROP_PADDING.left);
  top = Math.max(0, top - CROP_PADDING.top);

  // AI 문항번호 기준점은 실제 내용 상단과 가까울 때만 사용한다.
  // 기준점이 이전 문항 선택지나 큰 빈 공간을 가리키면 픽셀 내용 경계를 우선한다.
  if (Number.isFinite(anchorY)) {
    const anchorPixel = Math.floor((anchorY / 100) * pageCanvas.height) - sy;
    const anchorDistance = Math.abs(anchorPixel - top);
    const anchorTolerance = Math.max(28, Math.floor(sh * 0.10));
    if (anchorDistance <= anchorTolerance) {
      top = Math.min(top, Math.max(0, anchorPixel - CROP_PADDING.top));
    }
  }

  right = Math.min(sw - 1, right + CROP_PADDING.right);
  bottom = Math.min(sh - 1, bottom + CROP_PADDING.bottom);

  const out = document.createElement("canvas");
  out.width = Math.max(1, right - left + 1);
  out.height = Math.max(1, bottom - top + 1);
  const outContext = out.getContext("2d");
  if (!outContext) return { rect: input, canvas: region };
  outContext.fillStyle = "#fff";
  outContext.fillRect(0, 0, out.width, out.height);
  outContext.drawImage(region, left, top, out.width, out.height, 0, 0, out.width, out.height);

  return {
    rect: {
      x: ((sx + left) / pageCanvas.width) * 100,
      y: ((sy + top) / pageCanvas.height) * 100,
      width: (out.width / pageCanvas.width) * 100,
      height: (out.height / pageCanvas.height) * 100,
    },
    canvas: out,
  };
}

function aiBoundingBox(question: Question): { rect: Rect; questionNumberY: number | null } | null {
  const aiCrop = question.ai_result?.ai_crop as Record<string, unknown> | undefined;
  const box = aiCrop?.bounding_box as Record<string, unknown> | undefined;
  if (!box) return null;

  const rect = {
    x: Number(box.x),
    y: Number(box.y),
    width: Number(box.width),
    height: Number(box.height),
  };
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const questionNumberY = Number(box.question_number_y);
  return {
    rect,
    questionNumberY: Number.isFinite(questionNumberY) ? questionNumberY : null,
  };
}

function isManualCrop(question: Question) {
  return Boolean(question.review_result?.crop_manual);
}

function resolveQuestionCrop(
  pageCanvas: HTMLCanvasElement,
  question: Question,
  anchors?: DocumentAnchors | null,
): CanonicalCrop {
  const currentRect = questionRect(question);
  // 사람이 직접 저장한 좌표와 현재 엔진으로 확정된 좌표는 그대로 사용한다.
  if (isManualCrop(question) || isCanonicalized(question)) return cropExact(pageCanvas, currentRect);

  // 1순위: PDF 안에 실제로 인쇄된 문항번호 좌표. 오차가 없으므로 항상 이것을 먼저 쓴다.
  const anchor = anchorFor(question, anchors);
  if (anchor) return buildAnchorCrop(pageCanvas, anchor);

  // 2순위: 스캔 PDF처럼 텍스트 레이어가 없을 때만 기존 AI bounding box 경로를 쓴다.
  const aiBox = aiBoundingBox(question);
  const sourceRect = aiBox?.rect ?? currentRect;
  return buildCanonicalCrop(pageCanvas, sourceRect, {
    questionNumberY: aiBox?.questionNumberY ?? null,
  });
}

/** 해당 문항의 텍스트 앵커를 찾는다. 사람이 손댄 문항은 앵커를 쓰지 않는다. */
function anchorFor(question: Question, anchors?: DocumentAnchors | null): QuestionAnchor | null {
  if (!anchors?.hasTextLayer) return null;
  if (isManualCrop(question)) return null;
  const questionNo = Number(question.question_no);
  if (!Number.isFinite(questionNo)) return null;
  return anchors.byQuestionNo.get(questionNo) ?? null;
}

function questionRect(question: Question): Rect {
  return {
    x: Number(question.crop_x ?? 0),
    y: Number(question.crop_y ?? 0),
    width: Number(question.crop_width ?? 0),
    height: Number(question.crop_height ?? 0),
  };
}

function recognitionDisplayRect(question: Question, anchors?: DocumentAnchors | null): Rect {
  const rect = questionRect(question);
  const anchor = anchorFor(question, anchors);
  if (!anchor || anchor.page !== Number(question.page_no)) return rect;

  // 인식 화면은 AI의 임시 crop 좌표가 아니라 PDF에서 찾은 실제 문항번호 위치를 표시한다.
  // 같은 단의 다음 문항번호 직전까지를 해당 문항 영역으로 보여준다.
  const top = Math.max(0, anchor.topPct - 2.6);
  const bottom = Math.min(100, anchor.bottomPct);
  return {
    x: Math.max(0, anchor.columnLeftPct + 0.15),
    y: top,
    width: Math.max(1, anchor.columnRightPct - anchor.columnLeftPct - 0.3),
    height: Math.max(1, bottom - top),
  };
}

function hasValidCrop(question: Question | null) {
  if (!question) return false;
  return (
    Number(question.page_no) >= 1 &&
    Number(question.crop_width) > 0 &&
    Number(question.crop_height) > 0
  );
}


function ManualSolutionCropModal({
  doc,
  questionNo,
  initialPage,
  onClose,
  onSave,
}: {
  doc: any;
  questionNo: number;
  initialPage: number;
  onClose: () => void;
  onSave: (blob: Blob, pageNo: number) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{x:number;y:number}|null>(null);
  const [pageNo, setPageNo] = useState(Math.max(1, initialPage || 1));
  const [pageCount, setPageCount] = useState(Number(doc?.numPages ?? 1));
  const [rect, setRect] = useState<Rect|null>(null);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    let cancelled=false;
    void (async()=>{
      try{
        if(!doc || !canvasRef.current) return;
        setPageCount(Number(doc.numPages ?? 1));
        const page=await doc.getPage(pageNo);
        const base=page.getViewport({scale:1});
        const viewport=page.getViewport({scale:Math.max(1.4,Math.min(2.2,1200/base.width))});
        const canvas=canvasRef.current;
        canvas.width=Math.ceil(viewport.width);
        canvas.height=Math.ceil(viewport.height);
        const ctx=canvas.getContext("2d");
        if(!ctx) return;
        await page.render({canvasContext:ctx,viewport}).promise;
        if(!cancelled) setRect(null);
      }catch(e){ if(!cancelled) setLocalError(e instanceof Error?e.message:"해설 PDF 페이지를 불러오지 못했습니다."); }
    })();
    return()=>{cancelled=true};
  },[doc,pageNo]);

  function pos(event: React.PointerEvent<HTMLDivElement>){
    const el=wrapRef.current;
    if(!el) return {x:0,y:0};
    const b=el.getBoundingClientRect();
    return {
      x:Math.max(0,Math.min(100,((event.clientX-b.left)/b.width)*100)),
      y:Math.max(0,Math.min(100,((event.clientY-b.top)/b.height)*100)),
    };
  }

  function down(event:React.PointerEvent<HTMLDivElement>){
    if(saving) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p=pos(event); startRef.current=p; setRect({x:p.x,y:p.y,width:0,height:0});
  }
  function move(event:React.PointerEvent<HTMLDivElement>){
    if(!startRef.current) return;
    const p=pos(event),s=startRef.current;
    setRect({x:Math.min(s.x,p.x),y:Math.min(s.y,p.y),width:Math.abs(p.x-s.x),height:Math.abs(p.y-s.y)});
  }
  function up(){ startRef.current=null; }

  async function save(){
    const canvas=canvasRef.current;
    if(!canvas||!rect||rect.width<1||rect.height<1) return setLocalError("저장할 해설 영역을 드래그해 주세요.");
    setSaving(true);setLocalError("");
    try{
      const cropped=cropExact(canvas,rect).canvas;
      const blob=await new Promise<Blob>((resolve,reject)=>cropped.toBlob(v=>v?resolve(v):reject(new Error("해설 이미지 변환 실패")),"image/webp",.94));
      await onSave(blob,pageNo);
      onClose();
    }catch(e){setLocalError(e instanceof Error?e.message:"해설 저장 실패");}
    finally{setSaving(false);}
  }

  return <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.68)",display:"grid",placeItems:"center",padding:20}}>
    <div style={{width:"min(1180px,96vw)",height:"92vh",background:"#fff",borderRadius:16,display:"grid",gridTemplateRows:"auto 1fr auto",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #ddd"}}>
        <div><strong>{questionNo}번 공식 해설 직접 긁기</strong><div style={{fontSize:12,color:"#667085"}}>해설 PDF에서 해당 풀이 영역을 마우스로 드래그하세요.</div></div>
        <button type="button" onClick={onClose}>닫기</button>
      </div>
      <div style={{overflow:"auto",padding:12,background:"#eef1f4"}}>
        <div ref={wrapRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} style={{position:"relative",width:"fit-content",margin:"0 auto",cursor:"crosshair",touchAction:"none"}}>
          <canvas ref={canvasRef} style={{display:"block",maxWidth:"100%",height:"auto",background:"#fff"}} />
          {rect ? <div style={{position:"absolute",left:`${rect.x}%`,top:`${rect.y}%`,width:`${rect.width}%`,height:`${rect.height}%`,border:"2px solid #e74c3c",background:"rgba(231,76,60,.08)",pointerEvents:"none"}}/>:null}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",padding:"10px 16px",borderTop:"1px solid #ddd"}}>
        <button type="button" disabled={pageNo<=1||saving} onClick={()=>setPageNo(v=>Math.max(1,v-1))}>← 이전</button>
        <span style={{fontWeight:800}}>해설 {pageNo}/{pageCount}쪽</span>
        <button type="button" disabled={pageNo>=pageCount||saving} onClick={()=>setPageNo(v=>Math.min(pageCount,v+1))}>다음 →</button>
        <span style={{flex:1,fontSize:12,color:"#667085"}}>{localError}</span>
        <button type="button" disabled={!rect||saving} onClick={()=>void save()} style={{fontWeight:900}}>{saving?"저장 중...":"이 영역을 공식 해설로 저장"}</button>
      </div>
    </div>
  </div>;
}

export default function AnalysisWorkspacePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [sources, setSources] = useState<SourceFile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activeQuestionId, setActiveQuestionId] = useState("");

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [anchors, setAnchors] = useState<DocumentAnchors | null>(null);
  const [anchorBusy, setAnchorBusy] = useState(false);
  const [solutionPdfDoc, setSolutionPdfDoc] = useState<any>(null);
  const [solutionAnchors, setSolutionAnchors] = useState<DocumentAnchors | null>(null);
  const solutionPdfDocRef = useRef<any>(null);
  const solutionAnchorsRef = useRef<DocumentAnchors | null>(null);
  const [solutionAnchorBusy, setSolutionAnchorBusy] = useState(false);
  const [pageNo, setPageNo] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [preview, setPreview] = useState("");
  const [solutionPreviewUrl, setSolutionPreviewUrl] = useState("");
  const [manualSolutionCropOpen, setManualSolutionCropOpen] = useState(false);
  const [manualRecognitionMode, setManualRecognitionMode] = useState(false);
  const [manualRecognitionQuestionNo, setManualRecognitionQuestionNo] = useState("");

  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("저장됨");
  const [workflowStep, setWorkflowStep] = useState<1 | 2 | 3>(1);
  const [viewMode, setViewMode] = useState<"single" | "all" | "registered" | "pending" | "review" | "failed">("single");
  const [queueProgress, setQueueProgress] = useState({ done: 0, total: 0 });
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [thumbnailBusy, setThumbnailBusy] = useState(false);
  const [aiHealth, setAiHealth] = useState<{ checking: boolean; success: boolean | null; message: string; model?: string }>({
    checking: false,
    success: null,
    message: "AI 연결 확인 전",
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRenderTaskRef = useRef<any>(null);
  const selectionRef = useRef<Rect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const questions = workspace?.questions ?? [];
  const selectedSource = sources.find((source) => source.id === selectedId) ?? null;
  const questionNumberKey = questions.map((question) => Number(question.question_no)).join(",");
  useEffect(() => { solutionPdfDocRef.current = solutionPdfDoc; }, [solutionPdfDoc]);
  useEffect(() => { solutionAnchorsRef.current = solutionAnchors; }, [solutionAnchors]);

  const activeQuestion =
    questions.find((item) => item.id === activeQuestionId) ?? questions[0] ?? null;

  const nextMissingManualQuestion = (after = 0) => {
    const existing = new Set(questions.map((item) => Number(item.question_no)));
    if (after) existing.add(after);
    const detected = anchors ? [...anchors.byQuestionNo.keys()].sort((a, b) => a - b) : [];
    return detected.find((no) => no > after && !existing.has(no))
      ?? detected.find((no) => !existing.has(no))
      ?? Math.max(0, ...existing) + 1;
  };

  const beginManualRecognition = () => {
    const next = nextMissingManualQuestion();
    setManualRecognitionMode(true);
    setManualRecognitionQuestionNo(String(next));
    const anchor = anchors?.byQuestionNo.get(next);
    if (anchor) setPageNo(anchor.page);
    setDraft(null);
    setMessage(`${next}번을 직접 추가합니다. PDF에서 문제 전체를 네모로 드래그하세요.`);
  };


  const checkAiHealth = useCallback(async () => {
    setAiHealth((current) => ({ ...current, checking: true, message: "AI 연결 확인 중..." }));
    try {
      const response = await fetch("/api/analysis/health", { cache: "no-store" });
      const payload = await response.json();
      setAiHealth({
        checking: false,
        success: Boolean(response.ok && payload.success),
        message: payload.message || (response.ok ? "AI 연결 정상" : "AI 연결 실패"),
        model: payload.model,
      });
    } catch (caught) {
      setAiHealth({
        checking: false,
        success: false,
        message: caught instanceof Error ? caught.message : "AI 연결 확인 실패",
      });
    }
  }, []);

  const loadSources = useCallback(async () => {
    const [sourceResult, statusResponse] = await Promise.all([
      supabase.from("source_files").select("id,created_at,title,source,grade,subject,status,error_message").order("created_at", { ascending: false }),
      fetch("/api/source-files/analysis-statuses", { cache: "no-store" }),
    ]);
    if (sourceResult.error) throw sourceResult.error;
    if (!statusResponse.ok) throw new Error(await statusResponse.text());

    const statusPayload = await statusResponse.json() as {
      success?: boolean;
      statuses?: Record<string, { state: SourceFile["workflow_state"]; label: string; detail?: string }>;
      message?: string;
    };
    if (!statusPayload.success) throw new Error(statusPayload.message || "시험지 상태를 불러오지 못했습니다.");
    const statuses = statusPayload.statuses ?? {};

    const rows = ((sourceResult.data ?? []) as SourceFile[]).map((source) => ({
      ...source,
      workflow_label: statuses[source.id]?.label ?? SOURCE_WORKFLOW_LABEL.UNANALYZED,
      workflow_detail: statuses[source.id]?.detail ?? "",
      workflow_state: statuses[source.id]?.state ?? "UNANALYZED",
    }));
    setSources(rows);
    return rows;
  }, [supabase]);

  const loadWorkspace = useCallback(async (sourceId: string) => {
    if (!sourceId) return;
    setBusy("load");
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/analysis/source/${sourceId}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "분석화면을 불러오지 못했습니다.");
      }

      const nextWorkspace = payload as Workspace & { success: true };
      setWorkspace(nextWorkspace);
      setSelectedId(sourceId);
      setActiveQuestionId(nextWorkspace.questions?.[0]?.id ?? "");
      const savedStep = String(nextWorkspace.analysis?.current_step ?? "");
      if (savedStep.includes("3단계") || nextWorkspace.questions?.some((item) => item.status === "AUTO_REGISTERED" || item.status === "REVIEW" || item.status === "APPROVED")) {
        setWorkflowStep(3);
      } else if (savedStep.includes("2단계") || nextWorkspace.questions?.length) {
        setWorkflowStep(2);
      } else {
        setWorkflowStep(1);
      }
    } catch (caught) {
      setWorkspace(null);
      setPdfDoc(null);
      setError(
        caught instanceof Error ? caught.message : "분석화면을 불러오지 못했습니다.",
      );
    } finally {
      setBusy("");
    }
  }, []);

  useEffect(() => {
    void checkAiHealth();
    void (async () => {
      try {
        const rows = await loadSources();
        if (rows.length > 0) await loadWorkspace(rows[0].id);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "시험지 목록을 불러오지 못했습니다.",
        );
      }
    })();
  }, [checkAiHealth, loadSources, loadWorkspace]);

  useEffect(() => {
    if (!workspace?.examUrl) {
      setPdfDoc(null);
      setPageCount(0);
      return;
    }

    let cancelled = false;
    setBusy("pdf");
    setError("");

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const response = await fetch(workspace.examUrl!, { cache: "no-store" });
        if (!response.ok) throw new Error("시험지 PDF를 불러오지 못했습니다.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        const document = await pdfjs.getDocument({ data: bytes }).promise;

        if (!cancelled) {
          setPdfDoc(document);
          setPageCount(document.numPages);
        }
      } catch (caught) {
        if (!cancelled) {
          setPdfDoc(null);
          setPageCount(0);
          setError(caught instanceof Error ? caught.message : "PDF를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setBusy((current) => (current === "pdf" ? "" : current));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspace?.examUrl]);

  useEffect(() => {
    if (!workspace?.solutionUrl) {
      setSolutionPdfDoc(null);
      setSolutionAnchors(null);
      return;
    }
    let cancelled = false;
    setSolutionAnchorBusy(true);
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
        const response = await fetch(workspace.solutionUrl!, { cache: "no-store" });
        if (!response.ok) throw new Error("공식 해설 PDF를 불러오지 못했습니다.");
        const document = await pdfjs.getDocument({ data: new Uint8Array(await response.arrayBuffer()) }).promise;
        const expected = questions.map((question) => Number(question.question_no));
        const found = await buildDocumentAnchors(document, expected.length ? expected : undefined);
        if (!cancelled) {
          solutionPdfDocRef.current = document;
          solutionAnchorsRef.current = found;
          setSolutionPdfDoc(document);
          setSolutionAnchors(found);
        }
      } catch (caught) {
        console.error("공식 해설 문항번호 인식 실패", caught);
        if (!cancelled) { solutionPdfDocRef.current = null; solutionAnchorsRef.current = null; setSolutionPdfDoc(null); setSolutionAnchors(null); }
      } finally {
        if (!cancelled) setSolutionAnchorBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspace?.solutionUrl, questionNumberKey]);

  // SOS313: AI가 놓친 좌측 단까지 찾기 위해 시험지 PDF는 기존 문항목록으로 제한하지 않는다.
  // 문서 전체의 순증가 번호 흐름과 공통 2단 경계로 가짜 번호를 걸러낸다.
  useEffect(() => {
    if (!pdfDoc) {
      setAnchors(null);
      return;
    }

    let cancelled = false;
    setAnchorBusy(true);

    void (async () => {
      try {
        const result = await buildDocumentAnchors(pdfDoc);
        if (!cancelled) setAnchors(result);
      } catch (caught) {
        console.error("문항 앵커 계산 실패", caught);
        if (!cancelled) setAnchors(null);
      } finally {
        if (!cancelled) setAnchorBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, questions]);

  useEffect(() => {
    if (!activeQuestion) {
      setSelection(null);
      setPreview("");
      return;
    }

    if (hasValidCrop(activeQuestion)) {
      // 앵커가 있으면 AI가 쪽을 잘못 잡았어도 실제 인쇄된 쪽으로 이동한다.
      const anchor = anchorFor(activeQuestion, anchors);
      setPageNo(Math.max(1, anchor?.page ?? Number(activeQuestion.page_no ?? 1)));
      // 화면/저장/썸네일은 모두 canonical effect가 계산한 하나의 좌표를 사용한다.
      setSelection(null);
    } else {
      setSelection(null);
      setPreview("");
    }
  }, [activeQuestion, anchors]);

  useEffect(() => {
    const path = String(activeQuestion?.ai_result?.official_solution_image_path ?? "").trim();
    if (!activeQuestion || !path) { setSolutionPreviewUrl(""); return; }
    let cancelled = false;
    void fetch(`/api/analysis/questions/${activeQuestion.id}/solution-image`, { cache: "no-store" })
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => { if (!cancelled) setSolutionPreviewUrl(response.ok && payload.success ? String(payload.imageUrl ?? "") : ""); })
      .catch(() => { if (!cancelled) setSolutionPreviewUrl(""); });
    return () => { cancelled = true; };
  }, [activeQuestion]);

  useEffect(() => {
    if (!pdfDoc || !activeQuestion || !hasValidCrop(activeQuestion)) return;
    let cancelled = false;

    void (async () => {
      try {
        const anchor = anchorFor(activeQuestion, anchors);
        const targetPage = anchor?.page ?? Number(activeQuestion.page_no);
        const page = await pdfDoc.getPage(targetPage);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.max(1.7, 1800 / base.width) });
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = Math.ceil(viewport.width);
        pageCanvas.height = Math.ceil(viewport.height);
        const context = pageCanvas.getContext("2d");
        if (!context) return;
        await page.render({ canvasContext: context, viewport }).promise;
        const canonical = resolveQuestionCrop(pageCanvas, activeQuestion, anchors);
        if (cancelled) return;
        setSelection(canonical.rect);
        setPreview(canonical.canvas.toDataURL("image/webp", 0.92));
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "최종 자르기 좌표를 계산하지 못했습니다.");
      }
    })();

    return () => { cancelled = true; };
  }, [pdfDoc, activeQuestion, anchors]);

  const updatePreview = useCallback((rect: Rect | null) => {
    const canvas = canvasRef.current;
    if (!canvas || !rect || rect.width <= 0 || rect.height <= 0) {
      setPreview("");
      return;
    }

    const sx = Math.floor((canvas.width * rect.x) / 100);
    const sy = Math.floor((canvas.height * rect.y) / 100);
    const sw = Math.max(1, Math.ceil((canvas.width * rect.width) / 100));
    const sh = Math.max(1, Math.ceil((canvas.height * rect.height) / 100));

    const output = document.createElement("canvas");
    output.width = sw;
    output.height = sh;
    const context = output.getContext("2d");
    if (!context) return;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, sw, sh);
    context.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    setPreview(output.toDataURL("image/webp", 0.92));
  }, []);

  useEffect(() => {
    selectionRef.current = selection;
    updatePreview(selection);
  }, [selection, updatePreview]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    void (async () => {
      try {
        const page = await pdfDoc.getPage(pageNo);
        const base = page.getViewport({ scale: 1 });
        const targetWidth = Math.min(1050, Math.max(650, window.innerWidth - 760));
        const viewport = page.getViewport({ scale: targetWidth / base.width });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;

        // 같은 화면 canvas에 이전 PDF.js render가 남아 있으면 먼저 취소한다.
        // selection 변경은 PDF 원본을 다시 렌더링하지 않고 preview만 갱신한다.
        try {
          pageRenderTaskRef.current?.cancel?.();
        } catch {
          // 이미 완료된 렌더 취소 오류는 무시
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const renderTask = page.render({ canvas, canvasContext: context, viewport });
        pageRenderTaskRef.current = renderTask;
        await renderTask.promise;
        if (!cancelled) updatePreview(selectionRef.current);
      } catch (caught) {
        const name = caught instanceof Error ? caught.name : "";
        if (!cancelled && name !== "RenderingCancelledException") {
          setError(caught instanceof Error ? caught.message : "PDF 페이지를 표시하지 못했습니다.");
        }
      } finally {
        if (pageRenderTaskRef.current) pageRenderTaskRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      try {
        pageRenderTaskRef.current?.cancel?.();
      } catch {
        // 취소 경쟁 상태 무시
      }
      pageRenderTaskRef.current = null;
    };
  }, [pdfDoc, pageNo, updatePreview]);

  function pointerPosition(event: PointerEvent<HTMLDivElement>) {
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100)),
    };
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (busy) return;
    const point = pointerPosition(event);
    startRef.current = point;
    setDraft({ x: point.x, y: point.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!startRef.current) return;
    const point = pointerPosition(event);
    setDraft({
      x: Math.min(startRef.current.x, point.x),
      y: Math.min(startRef.current.y, point.y),
      width: Math.abs(point.x - startRef.current.x),
      height: Math.abs(point.y - startRef.current.y),
    });
  }

  function handlePointerUp() {
    const completedRect = draft;
    const targetQuestion = activeQuestion;
    if (completedRect && completedRect.width >= 1 && completedRect.height >= 1) {
      setSelection(completedRect);
      if (workflowStep === 1 && manualRecognitionMode) {
        void saveManualRecognition(completedRect);
      } else if (targetQuestion) {
        void saveCrop(completedRect, targetQuestion);
      }
    }
    setDraft(null);
    startRef.current = null;
  }

  function handlePointerCancel() {
    setDraft(null);
    startRef.current = null;
  }

  const buildThumbnails = useCallback(async () => {
    if (!pdfDoc || !questions.length) return;
    setThumbnailBusy(true);
    try {
      const next: Record<string, string> = {};
      const pageCache = new Map<number, HTMLCanvasElement>();
      for (const question of questions) {
        if (!hasValidCrop(question)) continue;
        const anchor = anchorFor(question, anchors);
        const targetPage = anchor?.page ?? Number(question.page_no);
        let sourceCanvas = pageCache.get(targetPage);
        if (!sourceCanvas) {
          const page = await pdfDoc.getPage(targetPage);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.max(1, 1100 / base.width) });
          sourceCanvas = document.createElement("canvas");
          sourceCanvas.width = Math.ceil(viewport.width);
          sourceCanvas.height = Math.ceil(viewport.height);
          const context = sourceCanvas.getContext("2d");
          if (!context) continue;
          await page.render({ canvasContext: context, viewport }).promise;
          pageCache.set(targetPage, sourceCanvas);
        }
        const canonical = resolveQuestionCrop(sourceCanvas, question, anchors);
        next[question.id] = canonical.canvas.toDataURL("image/jpeg", .78);
      }
      setThumbnailUrls(next);
    } finally {
      setThumbnailBusy(false);
    }
  }, [pdfDoc, questions, anchors]);

  useEffect(() => {
    // 전체/등록대기/등록완료/검토보류/실패 등 카드형 화면은 모두 문항 미리보기가 필요하다.
    if (viewMode !== "single" && pdfDoc && questions.length) {
      void buildThumbnails();
    }
  }, [viewMode, pdfDoc, questions.length, buildThumbnails]);

  async function saveWorkflowStep(step: 1 | 2 | 3, label: string) {
    setWorkflowStep(step);
    if (!workspace?.analysis?.id) return;
    const response = await fetch(`/api/analysis/${workspace.analysis.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_step: label }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || "단계 저장에 실패했습니다.");
    setWorkspace((current) => current ? { ...current, analysis: payload.analysis } : current);
  }

  async function resetStage(stage: "recognition" | "crop" | "analysis") {
    if (!workspace?.analysis?.id) return;
    const warning = stage === "recognition"
      ? "문제인식 결과를 전부 취소하면 미등록 문항과 자르기·분석 결과가 모두 삭제됩니다."
      : stage === "crop"
        ? "자르기 결과를 전부 취소하면 미등록 문항의 자동·수동 자르기와 분석 결과가 삭제됩니다."
        : "문항분석 결과를 전부 취소하면 미등록 문항이 분석 대기 상태로 돌아갑니다.";
    if (!window.confirm(`${warning}\n계속할까요?`)) return;

    setBusy(`reset-${stage}`);
    setError("");
    setMessage("");
    try {
      const sourceId = workspace.source.id;
      const response = await fetch(`/api/analysis/${workspace.analysis.id}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "전체 취소에 실패했습니다.");

      await loadWorkspace(sourceId);
      setWorkflowStep(stage === "recognition" ? 1 : stage === "crop" ? 2 : 3);
      setViewMode(stage === "recognition" ? "single" : "all");
      if (stage === "recognition") setActiveQuestionId("");
      setThumbnailUrls({});
      setPreview("");
      setSelection(null);
      const preserved = Number(payload.preservedRegisteredCount ?? 0);
      setMessage(`${stage === "recognition" ? "문제인식" : stage === "crop" ? "자르기" : "문항분석"} 전체 취소 완료${preserved ? ` · 문제은행 등록 ${preserved}문항은 보존` : ""}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "전체 취소에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function saveManualRecognition(rect: Rect) {
    if (!workspace?.analysis?.id) {
      setError("분석 정보가 없습니다.");
      return;
    }
    const questionNo = Number(manualRecognitionQuestionNo);
    if (!Number.isInteger(questionNo) || questionNo < 1) {
      setError("수동 인식할 문항번호를 먼저 입력해 주세요.");
      return;
    }

    setBusy("manual-recognition");
    setError("");
    setMessage("");
    try {
      let target = questions.find((question) => Number(question.question_no) === questionNo) ?? null;
      if (!target) {
        const createResponse = await fetch("/api/analysis/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId: workspace.analysis.id,
            questionNo,
            pageNo,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          }),
        });
        const createPayload = await createResponse.json();
        if (!createResponse.ok || !createPayload.success) throw new Error(createPayload.message || "수동 인식 문항 추가에 실패했습니다.");
        target = createPayload.question as Question;
      }
      if (!target) throw new Error("수동 인식 문항 정보를 만들지 못했습니다.");

      const reviewResult = {
        ...(target.review_result ?? {}),
        recognition_manual: true,
        recognition_manual_at: new Date().toISOString(),
        crop_manual: true,
        crop_engine_version: CROP_ENGINE_VERSION,
      };
      const patchResponse = await fetch(`/api/analysis/questions/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_no: questionNo,
          page_no: pageNo,
          crop_x: rect.x,
          crop_y: rect.y,
          crop_width: rect.width,
          crop_height: rect.height,
          status: "WAITING",
          review_reason: "관리자가 1단계 문제인식 영역을 수동 보정했습니다.",
          review_result: reviewResult,
        }),
      });
      const patchPayload = await patchResponse.json();
      if (!patchResponse.ok || !patchPayload.success) throw new Error(patchPayload.message || "수동 인식 좌표 저장에 실패했습니다.");

      await loadWorkspace(workspace.source.id);
      setActiveQuestionId(target.id);
      const next = nextMissingManualQuestion(questionNo);
      setManualRecognitionQuestionNo(String(next));
      const nextAnchor = anchors?.byQuestionNo.get(next);
      if (nextAnchor) setPageNo(nextAnchor.page);
      setMessage(`${questionNo}번 직접 추가 완료 · 계속 추가하려면 ${next}번 영역을 드래그하세요.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "수동 문제인식에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function startAnalysis(forceRecognition = false) {
    if (!workspace) return;
    if (
      forceRecognition &&
      questions.length > 0 &&
      workflowStep > 1 &&
      !window.confirm("문제인식을 다시 하면 기존 자르기와 문항분석 결과가 초기화됩니다. 1단계부터 다시 진행할까요?")
    ) return;

    // 문항이 이미 있으면 AI를 다시 호출하지 않는다.
    // 현재 좌표에 단일 Crop 엔진만 적용하여 같은 결과를 다시 저장한다.
    if (questions.length > 0 && !forceRecognition) {
      await recropAllQuestions();
      return;
    }

    setBusy("analysis");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/analysis/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFileId: workspace.source.id, mode: "crop-only" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "AI 분석에 실패했습니다.");
      }

      setThumbnailUrls({});
      await loadWorkspace(workspace.source.id);
      await loadSources();
      setWorkflowStep(1);
      setViewMode("single");
      setPageNo(1);
      setMessage(`AI 문제 인식 완료 · ${payload.questionCount ?? 0}문항 · 문항 수를 확인한 뒤 1단계를 통과하세요.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 분석에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function saveCrop(rectOverride?: Rect, questionOverride?: Question) {
    const targetQuestion = questionOverride ?? activeQuestion;
    const targetRect = rectOverride ?? selection;
    const canvas = canvasRef.current;
    if (!workspace?.analysis?.id || !targetQuestion || !targetRect || !canvas) {
      setError("시험지에서 문항 영역을 먼저 드래그해 주세요.");
      return;
    }

    setBusy("crop");
    setError("");
    setMessage("");

    try {
      const sx = Math.max(0, Math.floor((canvas.width * targetRect.x) / 100));
      const sy = Math.max(0, Math.floor((canvas.height * targetRect.y) / 100));
      const sw = Math.max(1, Math.min(canvas.width - sx, Math.ceil((canvas.width * targetRect.width) / 100)));
      const sh = Math.max(1, Math.min(canvas.height - sy, Math.ceil((canvas.height * targetRect.height) / 100)));
      const output = document.createElement("canvas");
      output.width = sw;
      output.height = sh;
      const outputContext = output.getContext("2d");
      if (!outputContext) throw new Error("자르기 이미지를 만들지 못했습니다.");
      outputContext.fillStyle = "#fff";
      outputContext.fillRect(0, 0, sw, sh);
      outputContext.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await new Promise<Blob>((resolve, reject) => {
        output.toBlob((value) => value ? resolve(value) : reject(new Error("자르기 이미지 변환에 실패했습니다.")), "image/webp", .92);
      });
      const form = new FormData();
      form.append("image", blob, `${String(targetQuestion.question_no).padStart(3, "0")}.webp`);
      form.append("analysisId", workspace.analysis.id);
      form.append("sourceFileId", workspace.source.id);
      form.append("questionId", targetQuestion.id);
      form.append("questionNo", String(targetQuestion.question_no));
      form.append("pageNo", String(pageNo));
      form.append("cropX", String(targetRect.x));
      form.append("cropY", String(targetRect.y));
      form.append("cropWidth", String(targetRect.width));
      form.append("cropHeight", String(targetRect.height));

      const response = await fetch("/api/problem-bank/materialize", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "문항 이미지 저장에 실패했습니다.");
      }

      const reviewResult = {
        ...(targetQuestion.review_result ?? {}),
        crop_engine_version: CROP_ENGINE_VERSION,
        crop_manual: true,
      };
      const patchResponse = await fetch(`/api/analysis/questions/${targetQuestion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_no: pageNo,
          crop_x: targetRect.x,
          crop_y: targetRect.y,
          crop_width: targetRect.width,
          crop_height: targetRect.height,
          status: "WAITING",
          review_reason: "자르기가 수정되어 AI 문항 재분석이 필요합니다.",
          review_result: reviewResult,
        }),
      });
      const patchPayload = await patchResponse.json();
      if (!patchResponse.ok || !patchPayload.success) {
        throw new Error(patchPayload.message || "최종 자르기 좌표 저장에 실패했습니다.");
      }

      setWorkspace((current) =>
        current
          ? {
              ...current,
              questions: current.questions.map((item) =>
                item.id === targetQuestion.id
                  ? { ...patchPayload.question, question_image_path: payload.path ?? patchPayload.question.question_image_path }
                  : item,
              ),
            }
          : current,
      );
      setMessage(`${targetQuestion.question_no}번 수동 자르기 자동 저장 완료`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문항 이미지 저장에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeQuestion) return;

    const form = new FormData(event.currentTarget);
    const previousReview = activeQuestion.review_result ?? {};
    const reviewResult = {
      ...previousReview,
      question_type: String(form.get("question_type") ?? "unknown"),
      subject: String(form.get("subject") ?? ""),
      unit: String(form.get("unit") ?? ""),
      topic: String(form.get("topic") ?? ""),
      difficulty: String(form.get("difficulty") ?? ""),
      summary: String(form.get("summary") ?? ""),
    };

    setSaveState("저장 중...");
    setBusy("save");
    setError("");

    try {
      const response = await fetch(`/api/analysis/questions/${activeQuestion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answer: String(form.get("answer") ?? ""),
          page_no: Number(form.get("page_no") ?? pageNo),
          review_result: reviewResult,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "문항 저장에 실패했습니다.");
      }

      setWorkspace((current) =>
        current
          ? {
              ...current,
              questions: current.questions.map((item) =>
                item.id === activeQuestion.id ? payload.question : item,
              ),
            }
          : current,
      );
      setSaveState("저장됨");
      setMessage(`${activeQuestion.question_no}번 분석 결과 저장 완료`);
    } catch (caught) {
      setSaveState("저장 실패");
      setError(caught instanceof Error ? caught.message : "문항 저장에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function waitForOfficialSolutionReady(timeoutMs = 20000): Promise<boolean> {
    if (!workspace?.solutionUrl) return false;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (solutionPdfDocRef.current && solutionAnchorsRef.current) return true;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
  }

  async function analyzeOneQuestion(targetQuestion: Question | null = activeQuestion) {
    if (!targetQuestion) return;
    setBusy("one");
    setError("");
    setMessage("");

    try {
      if (workspace?.solutionUrl) {
        const ready = await waitForOfficialSolutionReady();
        if (!ready) throw new Error("공식 해설지 준비가 끝나지 않았습니다. 잠시 후 다시 시도해 주세요.");
        const linked = await materializeOfficialSolution(targetQuestion);
        if (!linked) throw new Error(`${targetQuestion.question_no}번 공식 해설을 문항별 이미지로 연결하지 못했습니다.`);
      } else {
        await materializeOfficialSolution(targetQuestion);
      }
      const response = await fetch(`/api/analysis/questions/${targetQuestion.id}/analyze`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "문항 분석에 실패했습니다.");
      }

      setWorkspace((current) =>
        current
          ? {
              ...current,
              questions: current.questions.map((item) =>
                item.id === targetQuestion.id ? payload.question : item,
              ),
            }
          : current,
      );
      setMessage(`${targetQuestion.question_no}번 문항 재분석 완료`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문항 분석에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function materializeOfficialSolution(question: Question): Promise<boolean> {
    if (!workspace?.analysis?.id || !workspace?.solutionUrl) return false;

    if (!solutionPdfDocRef.current || !solutionAnchorsRef.current) {
      await waitForOfficialSolutionReady();
    }

    const doc = solutionPdfDocRef.current;
    const found = solutionAnchorsRef.current;
    if (!doc || !found) return false;

    const anchor = found.byQuestionNo.get(Number(question.question_no));
    if (!anchor) return false;

    const page = await doc.getPage(anchor.page);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.max(1.7, 1800 / base.width) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) return false;
    await page.render({ canvasContext: context, viewport }).promise;

    // 해설지는 문항번호 텍스트 좌표가 정확하므로 큰 상단 여백을 열면
    // 이전 문항의 마지막 줄이 섞인다. 분수·지수 보호용 최소 여백만 둔다.
    const solutionTopPaddingPct = 0.45;
    const solutionTopPct = Math.max(0, anchor.topPct - solutionTopPaddingPct);
    const rect: Rect = {
      x: Math.max(0, anchor.columnLeftPct),
      y: solutionTopPct,
      width: Math.max(1, anchor.columnRightPct - anchor.columnLeftPct),
      height: Math.max(1, Math.min(100, anchor.bottomPct) - solutionTopPct),
    };
    let cropped = cropExact(canvas, rect).canvas;
    // 해설 좌표의 아래 끝이 페이지 경계까지 잡힌 문항은 풀이 뒤에 큰 빈 공간이 남는다.
    // 긴 구분선은 buildInkMask에서 구조선으로 제외하고, 마지막 실제 글자·수식 행까지만 남긴다.
    const solutionInk = buildInkMask(cropped);
    if (solutionInk) {
      const finalInkRow = lastInkRow(solutionInk, solutionInk.sh - 1);
      if (finalInkRow !== null) {
        const bottomPadding = Math.max(12, Math.round(cropped.height * 0.008));
        const trimmedBottom = Math.min(cropped.height, finalInkRow + bottomPadding + 1);
        if (trimmedBottom < cropped.height - bottomPadding) {
          cropped = cropExact(cropped, {
            x: 0,
            y: 0,
            width: 100,
            height: Math.max(1, (trimmedBottom / cropped.height) * 100),
          }).canvas;
        }
      }
    }
    const blob = await new Promise<Blob>((resolve, reject) => cropped.toBlob((value) => value ? resolve(value) : reject(new Error("해설 이미지 변환 실패")), "image/webp", .92));
    const form = new FormData();
    form.append("image", blob, `solution-${String(question.question_no).padStart(3, "0")}.webp`);
    form.append("analysisId", workspace.analysis.id);
    form.append("sourceFileId", workspace.source.id);
    form.append("questionId", question.id);
    form.append("questionNo", String(question.question_no));
    form.append("pageNo", String(anchor.page));
    const response = await fetch("/api/problem-bank/materialize-solution", { method: "POST", body: form });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || `${question.question_no}번 공식 해설 저장 실패`);
    return true;
  }

  async function saveManualOfficialSolution(blob: Blob, solutionPageNo: number) {
    if (!workspace?.analysis?.id || !activeQuestion) throw new Error("현재 문항 정보가 없습니다.");
    const form = new FormData();
    form.append("image", blob, `solution-${String(activeQuestion.question_no).padStart(3, "0")}-manual.webp`);
    form.append("analysisId", workspace.analysis.id);
    form.append("sourceFileId", workspace.source.id);
    form.append("questionId", activeQuestion.id);
    form.append("questionNo", String(activeQuestion.question_no));
    form.append("pageNo", String(solutionPageNo));
    form.append("manual", "true");

    const response = await fetch("/api/problem-bank/materialize-solution", { method: "POST", body: form });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || "공식 해설 수동 저장 실패");

    await loadWorkspace(workspace.source.id);
    setMessage(`${activeQuestion.question_no}번 공식 해설을 직접 연결했습니다.`);
  }


  async function rematchOfficialSolution(question: Question) {
    if (!workspace?.solutionUrl) {
      setError("등록된 공식 해설 PDF가 없습니다.");
      return;
    }
    setBusy("solution-rematch");
    setError("");
    setMessage("");
    try {
      const ready = await waitForOfficialSolutionReady(20000);
      if (!ready) throw new Error("해설 PDF 문항번호 인식 준비가 끝나지 않았습니다. 잠시 후 다시 시도해 주세요.");

      // '다시 자동 매칭'은 이전 앵커를 재사용하지 않고 해설 PDF 번호 인식부터 새로 수행한다.
      const doc = solutionPdfDocRef.current;
      if (!doc) throw new Error("해설 PDF를 불러오지 못했습니다.");
      const expected = questions.map((item) => Number(item.question_no));
      const rebuilt = await buildDocumentAnchors(doc, expected.length ? expected : undefined);
      solutionAnchorsRef.current = rebuilt;
      setSolutionAnchors(rebuilt);
      const found = rebuilt.byQuestionNo.get(Number(question.question_no));
      if (!found) throw new Error(`${question.question_no}번 해설 번호를 자동으로 찾지 못했습니다. 기존 '해설 PDF에서 직접 긁기'를 이용해 주세요.`);
      const matched = await materializeOfficialSolution(question);
      if (!matched) throw new Error(`${question.question_no}번 공식 해설 자동 매칭에 실패했습니다.`);
      await loadWorkspace(workspace.source.id);
      setSolutionPreviewUrl("");
      setMessage(`${question.question_no}번 공식 해설만 다시 자동 매칭했습니다. 문제·DNA·분석 결과는 변경하지 않았습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "공식 해설 다시 자동 매칭에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function patchQuestionStatus(question: Question, status: "APPROVED" | "REJECTED" | "REVIEW") {
    const response = await fetch(`/api/analysis/questions/${question.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || "문항 상태 변경에 실패했습니다.");
    setWorkspace((current) => current ? {
      ...current,
      questions: current.questions.map((item) => item.id === question.id ? payload.question : item),
    } : current);
    return payload.question as Question;
  }


  async function registerPendingQuestions(targets: Question[]) {
    if (!workspace?.analysis?.id || targets.length === 0) return;
    setBusy("register-pending"); setError(""); setMessage("");
    const chunkSize=20;
    const chunks:Array<Question[]>=[];
    for(let i=0;i<targets.length;i+=chunkSize)chunks.push(targets.slice(i,i+chunkSize));
    setQueueProgress({done:0,total:chunks.length});
    let registered=0,blocked=0,duplicates=0;const warnings:string[]=[];
    try {
      for(let i=0;i<chunks.length;i++){
        const chunk=chunks[i];
        const response=await fetch("/api/problem-bank/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({analysisId:workspace.analysis.id,questionIds:chunk.map(item=>item.id)})});
        const raw=await response.text(); let payload:any=null;
        try{payload=raw?JSON.parse(raw):null;}catch{throw new Error(`문제은행 등록 응답이 JSON이 아닙니다. HTTP ${response.status}`);}
        // 묶음 전체가 보류된 400은 전체 작업을 멈추지 않는다.
        if(!response.ok||!payload?.success){
          if(response.status===400){warnings.push(payload?.message||`${i+1}번째 묶음 등록 대상 없음`);}
          else throw new Error(apiErrorMessage(payload,"문제은행 등록에 실패했습니다.",response.status));
        }else{
          registered+=Number(payload.registered??0); blocked+=Number(payload.blocked??0); duplicates+=Number(payload.duplicates??0);
        }
        setQueueProgress({done:i+1,total:chunks.length});
      }
      await loadWorkspace(workspace.source.id); await loadSources(); setViewMode("registered");
      setMessage(`문제은행 등록 완료 · 신규 ${registered}문항${duplicates?` · 중복 ${duplicates}`:""}${blocked?` · 보류 ${blocked}`:""}${warnings.length?` · 확인 ${warnings.length}묶음`:""}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "문제은행 등록에 실패했습니다."); }
    finally { setQueueProgress({done:0,total:0}); setBusy(""); }
  }

  async function approveForPending(question: Question) {
    setBusy("review-action");
    setError("");
    setMessage("");
    try {
      await patchQuestionStatus(question, "APPROVED");
      setViewMode("review");
      setMessage(`${question.question_no}번 검수 완료 · 문제은행 대기로 이동했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "검수 완료 처리에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function excludeQuestion(question: Question) {
    setBusy("review-action");
    setError("");
    try {
      await patchQuestionStatus(question, "REJECTED");
      setMessage(`${question.question_no}번을 등록 제외 처리했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "등록 제외 처리에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }


  async function materializeQuestion(question: Question, forceCorrection = false): Promise<Question> {
    if (!workspace?.analysis?.id || !pdfDoc || !hasValidCrop(question)) throw new Error(`${question.question_no}번 자르기 좌표가 없습니다.`);
    // 앵커가 있으면 실제 인쇄된 쪽을 쓴다. AI가 쪽을 잘못 잡은 문항도 여기서 교정된다.
    const anchor = anchorFor(question, anchors);
    const targetPageNo = anchor?.page ?? Number(question.page_no);
    const page = await pdfDoc.getPage(targetPageNo);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.max(1.6, 1800 / base.width) });
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = Math.ceil(viewport.width);
    sourceCanvas.height = Math.ceil(viewport.height);
    const sourceContext = sourceCanvas.getContext("2d");
    if (!sourceContext) throw new Error("PDF 캔버스를 만들지 못했습니다.");
    await page.render({ canvasContext: sourceContext, viewport }).promise;

    // 2단계 전체 자르기는 1단계 인식 좌표를 출발점으로 경계를 다시 보정한다.
    // 사람이 직접 저장한 문항은 덮어쓰지 않는다.
    const canonical = forceCorrection && !isManualCrop(question)
      ? (() => {
          const correctionAnchor = anchorFor(question, anchors);
          if (correctionAnchor) return buildAnchorCrop(sourceCanvas, correctionAnchor);
          const aiBox = aiBoundingBox(question);
          return buildCanonicalCrop(sourceCanvas, aiBox?.rect ?? questionRect(question), {
            questionNumberY: aiBox?.questionNumberY ?? null,
          });
        })()
      : resolveQuestionCrop(sourceCanvas, question, anchors);
    setThumbnailUrls((current) => ({
      ...current,
      [question.id]: canonical.canvas.toDataURL("image/jpeg", .82),
    }));
    const blob = await new Promise<Blob>((resolve, reject) => canonical.canvas.toBlob((value) => value ? resolve(value) : reject(new Error("이미지 변환 실패")), "image/webp", .92));
    const form = new FormData();
    form.append("image", blob, `${String(question.question_no).padStart(3, "0")}.webp`);
    form.append("analysisId", workspace.analysis.id);
    form.append("sourceFileId", workspace.source.id);
    form.append("questionId", question.id);
    form.append("questionNo", String(question.question_no));
    form.append("pageNo", String(targetPageNo));
    form.append("cropX", String(canonical.rect.x));
    form.append("cropY", String(canonical.rect.y));
    form.append("cropWidth", String(canonical.rect.width));
    form.append("cropHeight", String(canonical.rect.height));
    const response = await fetch("/api/problem-bank/materialize", { method: "POST", body: form });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || `${question.question_no}번 이미지 저장 실패`);

    const reviewResult = {
      ...(question.review_result ?? {}),
      crop_engine_version: CROP_ENGINE_VERSION,
      crop_manual: isManualCrop(question),
    };
    const patchResponse = await fetch(`/api/analysis/questions/${question.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page_no: targetPageNo,
        crop_x: canonical.rect.x,
        crop_y: canonical.rect.y,
        crop_width: canonical.rect.width,
        crop_height: canonical.rect.height,
        ...(forceCorrection ? {
          status: "WAITING",
          review_reason: "2단계 자르기 보정 후 AI 문항 재분석이 필요합니다.",
        } : {}),
        review_result: reviewResult,
      }),
    });
    const patchPayload = await patchResponse.json();
    if (!patchResponse.ok || !patchPayload.success) throw new Error(patchPayload.message || `${question.question_no}번 좌표 저장 실패`);
    return { ...patchPayload.question, question_image_path: payload.path ?? patchPayload.question.question_image_path } as Question;
  }

  /**
   * AI가 일부 문항만 찾아냈을 때, PDF 텍스트에서 읽어낸 문항번호로 빠진 문항을 채운다.
   * AI를 다시 호출하지 않으므로 비용이 들지 않고 결과도 매번 같다.
   */
  async function fillMissingQuestionsFromPdf() {
    if (!workspace?.analysis?.id || !pdfDoc) return;

    setBusy("fill");
    setError("");
    setMessage("");

    try {
      // 기존 문항 목록에 얽매이지 않도록 expected 없이 전체를 다시 훑는다.
      const scanned = await buildDocumentAnchors(pdfDoc);
      if (!scanned.hasTextLayer || scanned.byQuestionNo.size === 0) {
        throw new Error("이 PDF에는 텍스트 레이어가 없어 문항번호를 읽을 수 없습니다. 스캔본이면 먼저 OCR로 텍스트를 입혀 주세요.");
      }

      const existing = new Set(questions.map((item) => Number(item.question_no)));
      const missing = [...scanned.byQuestionNo.values()]
        .filter((anchor) => !existing.has(anchor.questionNo))
        .sort((a, b) => a.questionNo - b.questionNo);

      if (!missing.length) {
        setMessage(`PDF에서 문항번호 ${scanned.byQuestionNo.size}개를 찾았고, 빠진 문항은 없습니다.`);
        return;
      }

      setQueueProgress({ done: 0, total: missing.length });

      for (let index = 0; index < missing.length; index += 1) {
        const anchor = missing[index];
        const response = await fetch("/api/analysis/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId: workspace.analysis.id,
            questionNo: anchor.questionNo,
            pageNo: anchor.page,
            x: anchor.columnLeftPct,
            y: Math.max(0, anchor.topPct - 2.6),
            width: Math.max(1, anchor.columnRightPct - anchor.columnLeftPct),
            height: Math.max(1, anchor.bottomPct - Math.max(0, anchor.topPct - 2.6)),
          }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || `${anchor.questionNo}번 추가 실패`);
        }
        setQueueProgress({ done: index + 1, total: missing.length });
      }

      const added = missing.map((anchor) => anchor.questionNo).join(", ");
      setMessage(`PDF에서 ${missing.length}개 문항을 채웠습니다 (${added}). 이어서 '전체 문항 자르기 저장'을 실행하세요.`);
      await loadWorkspace(workspace.source.id);
      await saveWorkflowStep(1, "1단계 · AI 문제인식 수정");
      setViewMode("single");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문항 목록을 채우지 못했습니다.");
    } finally {
      setBusy("");
      setQueueProgress({ done: 0, total: 0 });
    }
  }

  async function recropAllQuestions() {
    if (!workspace || !questions.length) {
      setError("자르기할 문항이 없습니다.");
      return false;
    }
    if (!pdfDoc) {
      setError("시험지 PDF를 불러오는 중입니다. PDF 로딩이 끝난 뒤 다시 눌러 주세요.");
      return false;
    }
    if (anchorBusy) {
      setError("PDF 문항번호 좌표를 읽는 중입니다. 자르기 기준 준비가 끝난 뒤 다시 눌러 주세요.");
      return false;
    }
    setBusy("recrop");
    setError("");
    setMessage("");
    setQueueProgress({ done: 0, total: questions.length });
    try {
      const updated: Question[] = [];
      for (let index = 0; index < questions.length; index += 1) {
        if (isManualCrop(questions[index])) {
          updated.push(questions[index]);
          setQueueProgress({ done: index + 1, total: questions.length });
          continue;
        }
        const nextQuestion = await materializeQuestion(questions[index], true);
        updated.push(nextQuestion);
        setWorkspace((current) => current ? {
          ...current,
          questions: current.questions.map((item) => item.id === nextQuestion.id ? nextQuestion : item),
        } : current);
        setQueueProgress({ done: index + 1, total: questions.length });
      }
      setMessage(`전체 문항 보정 자르기 완료 · ${updated.length}문항 · 수동 저장 문항은 유지했습니다.`);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "전체 문항 다시 자르기에 실패했습니다.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function runAutoPipeline() {
    if (!workspace || !pdfDoc || !questions.length) return false;
    const analysisTargets = questions.filter((question) =>
      !isBankRegistered(question, registeredIdSet) &&
      !["AUTO_REGISTERED", "APPROVED", "REGISTERED", "REJECTED"].includes(question.status)
    );
    if (!analysisTargets.length) {
      setMessage("재분석이 필요한 문항이 없습니다. 이미 분석을 통과한 문항은 그대로 유지했습니다.");
      setViewMode("pending");
      return true;
    }
    setBusy("queue");
    setError("");
    setMessage("");
    setQueueProgress({ done: 0, total: analysisTargets.length });

    // 해설지가 첨부된 시험지는 해설 PDF와 문항번호 앵커가 준비된 뒤 AI 분석을 시작한다.
    // 이 준비 전에 워커가 먼저 돌면 정상 해설도 official_pdf_missing으로 굳을 수 있다.
    if (workspace.solutionUrl) {
      const ready = await waitForOfficialSolutionReady(20000);
      if (!ready) {
        setBusy("");
        setError("공식 해설지는 첨부되어 있지만 문항별 해설 연결 준비가 끝나지 않았습니다. 잠시 후 다시 분석해 주세요.");
        return false;
      }
    }

    // 3단계 AI 문항분석만 제한 병렬화한다.
    // 인식 → 자르기 → 분석 순서는 그대로 유지하며, 한 문항의 Problem DNA 내용도 줄이지 않는다.
    // 8개 워커는 30문항 기준 대기열을 줄이면서도 과도한 동시호출을 피하는 균형값이다.
    const concurrency = Math.min(8, analysisTargets.length);
    const failures: Array<{ questionNo: number; message: string }> = [];
    let cursor = 0;
    let done = 0;

    async function analyzeQueuedQuestion(question: Question) {
      let target = question;
      if (!target.question_image_path || !isCanonicalized(target)) {
        target = await materializeQuestion(target);
      }
      await materializeOfficialSolution(target);

      const response = await fetch(`/api/analysis/questions/${target.id}/analyze`, { method: "POST" });
      const raw = await response.text();
      let payload: any = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`서버 응답이 JSON이 아닙니다. HTTP ${response.status} · ${raw.slice(0, 240)}`);
      }
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || `${target.question_no}번 분석 실패`);
      }

      // 큐 실행 중 매 문항마다 전체 questions 배열을 다시 그리지 않는다.
      // runAutoPipeline 종료 시 loadWorkspace()가 최신 결과를 한 번에 반영한다.
    }

    async function worker() {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= analysisTargets.length) return;
        const question = analysisTargets[index];

        try {
          await analyzeQueuedQuestion(question);
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "문항 분석 실패";
          failures.push({ questionNo: Number(question.question_no), message });

          // 한 문항 실패가 전체 큐를 멈추지 않도록 검토대상으로 남긴다.
          try {
            const patchResponse = await fetch(`/api/analysis/questions/${question.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "REVIEW",
                review_reason: `AI 분석 실패: ${message.slice(0, 500)}`,
              }),
            });
            const patchRaw = await patchResponse.text();
            const patchPayload = patchRaw ? JSON.parse(patchRaw) : null;
            if (patchResponse.ok && patchPayload?.success) {
              setWorkspace((current) => current ? {
                ...current,
                questions: current.questions.map((item) => item.id === question.id ? patchPayload.question : item),
              } : current);
            }
          } catch {
            // 보류 표시 실패는 원래 분석 오류를 가리지 않는다.
          }
        } finally {
          done += 1;
          setQueueProgress({ done, total: analysisTargets.length });
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      await saveWorkflowStep(3, "3단계 · AI 문항분석 완료");
      await loadWorkspace(selectedId);
      if (failures.length) {
        const preview = failures.slice(0, 4).map((item) => `${item.questionNo}번`).join(", ");
        setError(`분석 실패 ${failures.length}문항(${preview}${failures.length > 4 ? " 외" : ""})은 검토대상으로 보류했습니다.`);
        setMessage(`AI 문항분석 완료 · 정상 문항은 등록대기 · 실패 ${failures.length}문항은 보류 · 문제은행 등록은 수동`);
      } else {
        setMessage("AI 문항분석 완료 · 정상 문항은 등록대기, 검토 필요 문항은 보류로 분류했습니다. 문제은행 등록은 직접 등록 버튼을 눌러야 합니다.");
      }
      setViewMode("review");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "자동 처리 중 오류가 발생했습니다.");
      return false;
    } finally {
      setBusy("");
    }
  }

  function nudgeCrop(kind: "top" | "bottom" | "left" | "right") {
    if (!selection) return;
    const step = 0.7;
    if (kind === "top") setSelection({ ...selection, y: Math.min(selection.y + step, selection.y + selection.height - 1), height: Math.max(1, selection.height - step) });
    if (kind === "bottom") setSelection({ ...selection, height: Math.max(1, selection.height - step) });
    if (kind === "left") setSelection({ ...selection, x: Math.min(selection.x + step, selection.x + selection.width - 1), width: Math.max(1, selection.width - step) });
    if (kind === "right") setSelection({ ...selection, width: Math.max(1, selection.width - step) });
  }

  function moveQuestion(direction: -1 | 1) {
    if (!activeQuestion) return;
    const currentIndex = questions.findIndex((item) => item.id === activeQuestion.id);
    const next = questions[currentIndex + direction];
    if (next) setActiveQuestionId(next.id);
  }

  async function revertRegisteredToPending() {
    if (!workspace?.source?.id || !registeredQuestions.length) return;

    const title = String(workspace.source.title ?? "").trim();
    const confirmed = window.prompt(
      `문제은행 등록완료 ${registeredQuestions.length}문항을 등록대기로 되돌립니다.\n\n` +
      `문제·자르기·해설·DNA·난이도는 그대로 보존되고, 문제은행 등록만 해제됩니다.\n\n` +
      `계속하려면 시험지명을 정확히 입력하세요:\n${title}`
    );

    if (confirmed === null) return;
    if (confirmed.trim() !== title) {
      setError("시험지명이 일치하지 않아 취소했습니다.");
      return;
    }

    setBusy("revert-pending");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/problem-bank/revert-source-to-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFileId: workspace.source.id,
          confirmation: confirmed.trim(),
        }),
      });

      const raw = await response.text();
      let payload: any = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`서버 응답이 JSON이 아닙니다. HTTP ${response.status} · ${raw.slice(0, 240)}`);
      }

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "등록대기 되돌리기에 실패했습니다.");
      }

      await loadWorkspace(workspace.source.id);
      await loadSources();
      setViewMode("pending");
      setMessage(payload.message || `${registeredQuestions.length}문항을 등록대기로 되돌렸습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "등록대기 되돌리기에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function passRecognitionStep() {
    if (!questions.length) {
      setError("인식된 문항이 없습니다. 먼저 AI 문제인식을 실행해 주세요.");
      return;
    }
    const missingAnchors = anchors?.hasTextLayer
      ? questions.filter((question) => !anchors.byQuestionNo.has(Number(question.question_no)) && question.review_result?.recognition_manual !== true)
      : [];
    if (missingAnchors.length) {
      setError(`문항 위치 ${missingAnchors.length}개가 아직 정확히 잡히지 않았습니다. 문제 인식을 다시 해주세요.`);
      return;
    }
    try {
      const cropped = await recropAllQuestions();
      if (!cropped) return;
      await saveWorkflowStep(2, "2단계 · AI 자르기 검수");
      setViewMode("all");
      setMessage(`${questions.length}문항 문제 인식 통과 · 전체 자르기 자동 완료 · 잘못된 문항만 수동 수정하세요.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문제 인식 통과 처리에 실패했습니다.");
    }
  }

  async function passCropStep() {
    const unsaved = questions.filter((question) => !question.question_image_path);
    if (unsaved.length) {
      setError(`자르기 저장이 안 된 문항이 ${unsaved.length}개 있습니다. 전체 문항 자르기 저장을 먼저 실행해 주세요.`);
      return;
    }
    try {
      await saveWorkflowStep(3, "3단계 · AI 문항분석 대기");
      setViewMode("all");
      const analyzed = await runAutoPipeline();
      if (!analyzed) return;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "자르기 통과 처리에 실패했습니다.");
    }
  }

  const analysisStatus = workspace?.analysis?.status ?? workspace?.source.status ?? "uploaded";
  const progress = Math.max(0, Math.min(100, Number(workspace?.analysis?.progress ?? 0)));
  const croppedCount = questions.filter((question) => hasValidCrop(question)).length;
  const savedCropCount = questions.filter((question) => Boolean(question.question_image_path)).length;
  // v164: 등록완료/등록대기/검토보류/실패를 서로 겹치지 않게 나눈다.
  // 목록 API(source-workflow)와 같은 우선순위를 쓰므로 두 화면 숫자가 항상 일치한다.
  const registeredIdSet = useMemo(
    () => new Set(workspace?.registeredQuestionIds ?? []),
    [workspace?.registeredQuestionIds],
  );
  const registeredNoSet = useMemo(
    () => new Set(workspace?.registeredQuestionNos ?? []),
    [workspace?.registeredQuestionNos],
  );
  const questionStages = questions.map((question) => ({
    question,
    stage: classifyQuestionStage(
      question.status,
      isBankRegistered(question, registeredIdSet, registeredNoSet),
    ),
  }));
  const stageList = (target: string) => questionStages.filter((item) => item.stage === target).map((item) => item.question);
  const registeredQuestions = stageList("registered");
  const pendingQuestions = stageList("pending");
  const reviewQuestions = stageList("review");
  const failedQuestions = stageList("failed");
  const analysisNeededQuestions = stageList("other");
  const visibleQuestions = viewMode === "registered" ? registeredQuestions
    : viewMode === "pending" ? pendingQuestions
    : viewMode === "review" ? reviewQuestions
    : viewMode === "failed" ? failedQuestions
    : questions;
  const missingRecognitionAnchors = anchors?.hasTextLayer
    ? questions.filter((question) => !anchors.byQuestionNo.has(Number(question.question_no)) && question.review_result?.recognition_manual !== true)
    : [];
  const detectedMissingQuestions = anchors?.hasTextLayer
    ? [...anchors.byQuestionNo.values()].filter((anchor) => !questions.some((question) => Number(question.question_no) === anchor.questionNo))
    : [];
  const busyInfo: Record<string, { title: string; detail: string }> = {
    load: { title: "분석 화면을 불러오는 중", detail: "시험지와 기존 작업 내용을 준비하고 있습니다." },
    pdf: { title: "시험지를 불러오는 중", detail: "PDF 화면과 문항 좌표를 준비하고 있습니다." },
    analysis: { title: "AI 문제인식 작동 중", detail: "AI가 시험지의 문항 위치와 번호를 찾고 있습니다." },
    "manual-recognition": { title: "수동 문제인식 저장 중", detail: "지정한 문항번호와 드래그 영역을 인식 좌표로 저장하고 있습니다." },
    "solution-rematch": { title: "공식 해설 다시 매칭 중", detail: "문항 분석은 유지하고 해설 PDF의 문항번호 위치만 다시 찾고 있습니다." },
    fill: { title: "빠진 문항을 채우는 중", detail: "PDF에서 누락된 문항번호를 찾아 추가하고 있습니다." },
    recrop: { title: "전체 자르기 처리 중", detail: "인식 좌표를 보정하고 문항 이미지를 순서대로 저장하고 있습니다." },
    crop: { title: "수동 자르기 저장 중", detail: "저장이 완료될 때까지 화면을 조작하지 마세요." },
    queue: { title: "AI 문항분석 작동 중", detail: "각 문항을 분석하고 문제은행 대기 또는 보류로 분류하고 있습니다." },
    one: { title: "AI 선택 문항 재분석 중", detail: "선택한 문항의 분석 결과를 다시 만들고 있습니다." },
    save: { title: "분석 결과 저장 중", detail: "수정한 문항 정보를 안전하게 저장하고 있습니다." },
    "register-pending": { title: "문제은행 저장 중", detail: "선택한 문항을 문제은행에 등록하고 있습니다." },
    "revert-pending": { title: "등록대기로 되돌리는 중", detail: "문제은행 등록만 해제하고 분석·해설·DNA는 그대로 보존합니다." },
    "review-action": { title: "문항 상태 처리 중", detail: "검수 결과를 저장하고 있습니다." },
    "reset-recognition": { title: "문제인식 전체 취소 중", detail: "문제인식과 이후 단계의 작업 결과를 초기화하고 있습니다." },
    "reset-crop": { title: "자르기 전체 취소 중", detail: "자르기 이미지와 이후 분석 결과를 초기화하고 있습니다." },
    "reset-analysis": { title: "문항분석 전체 취소 중", detail: "문항을 분석 대기 상태로 되돌리고 있습니다." },
  };
  const currentBusyInfo = busy ? busyInfo[busy] ?? { title: "처리 중", detail: "작업이 끝날 때까지 잠시 기다려 주세요." } : null;
  const showQueueProgress = ["queue", "recrop", "fill", "register-pending"].includes(busy) && queueProgress.total > 0;

  function moveToAdminPage(target: string) {
    if (!target || target === "analysis") return;
    if (target === "bank") {
      router.push("/problem-bank");
      return;
    }
    const adminTargets: Record<string, string> = {
      problems: "problem-sources",
      exams: "exam-list",
      recommend: "sos-learning",
      results: "student-results",
    };
    window.localStorage.setItem(
      "matspu-admin-menu",
      adminTargets[target] ?? target,
    );
    router.push("/admin");
  }

  return (
    <AdminPortalShell current="problem-analysis" defaultCollapsed>
    <main className="analysis-page">
      <header className="page-header">
        <div>
          <div className="page-move">
            <label htmlFor="analysis-page-move">페이지 이동</label>
            <select
              id="analysis-page-move"
              value="analysis"
              onChange={(event) => moveToAdminPage(event.target.value)}
              aria-label="관리자 페이지 이동"
            >
              <option value="analysis">AI 분석 관리 (현재)</option>
              <option value="dashboard">대시보드</option>
              <option value="students">학생 관리</option>
              <option value="exams">실전 모의고사</option>
              <option value="problems">AI 문제등록</option>
              <option value="bank">문제은행</option>
              <option value="recommend">SOS 추천</option>
              <option value="results">결과 · 이력</option>
              <option value="settings">환경 설정</option>
            </select>
          </div>
          <small>AI ANALYSIS WORKSPACE</small>
          <h1>AI 문제은행 분석 작업장</h1>
          <p>문제 인식 → 자르기 검수 → 문항 분석 순서로 처리합니다.</p>
        </div>
        <div className="header-actions">
          <span className="save-state">{saveState}</span>
        </div>
      </header>

      {message ? <div className="notice success">{message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      {workspace ? (
        <section className="workflow-panel">
          <div className="workflow-steps">
            {([
              { no: 1 as const, title: "AI 문제인식", detail: `${questions.length}문항 인식` },
              { no: 2 as const, title: "AI 자르기", detail: `${savedCropCount}/${questions.length} 저장` },
              { no: 3 as const, title: "AI 문항분석", detail: `대기 ${pendingQuestions.length} · 보류 ${reviewQuestions.length}` },
            ]).map((step) => (
              <button
                key={step.no}
                className={`${workflowStep === step.no ? "active" : ""} ${workflowStep > step.no ? "done" : ""}`}
                onClick={() => {
                  if (step.no <= workflowStep) {
                    setWorkflowStep(step.no);
                    if (step.no === 1) setViewMode("single");
                    if (step.no === 2) setViewMode("all");
                  }
                }}
                disabled={step.no > workflowStep}
              >
                <b>{step.no}</b>
                <span><strong>{step.title}</strong><small>{step.detail}</small></span>
              </button>
            ))}
          </div>

          {workflowStep === 1 ? (
            <div className="workflow-action">
              <div><strong>1단계 · 시험지 문항 확인</strong><span>AI가 찾은 문항 수와 번호를 확인하고 누락 문항을 채웁니다.</span></div>
              <div className="workflow-buttons">
                <button onClick={() => void startAnalysis(true)} disabled={!workspace || !!busy}>{questions.length ? "AI 문제인식 다시 하기" : "AI 문제인식 시작"}</button>
                {anchors?.hasTextLayer && questions.length ? <button className={detectedMissingQuestions.length ? "missing-found" : ""} onClick={() => void fillMissingQuestionsFromPdf()} disabled={!!busy}>{detectedMissingQuestions.length ? `좌·우 누락 ${detectedMissingQuestions.length}개 자동 복구` : "빠진 문항 확인"}</button> : null}
                <button onClick={beginManualRecognition} disabled={!pdfDoc || !!busy}>＋ 누락 문항 직접 추가</button>
                <button className="cancel-all" onClick={() => void resetStage("recognition")} disabled={!questions.length || !!busy}>문제인식 전체 취소</button>
                <button
                  className="pass"
                  onClick={() => void passRecognitionStep()}
                  disabled={!questions.length || anchorBusy || !!busy || missingRecognitionAnchors.length > 0}
                  title={missingRecognitionAnchors.length ? `위치 미확정 ${missingRecognitionAnchors.length}문항` : ""}
                >
                  {missingRecognitionAnchors.length ? `위치 미확정 ${missingRecognitionAnchors.length}문항` : "문제 인식 통과 →"}
                </button>
              </div>
            </div>
          ) : workflowStep === 2 ? (
            <div className="workflow-action">
              <div><strong>2단계 · 전체 자르기 검수</strong><span>전체를 먼저 저장한 뒤 잘못 잘린 문항만 수동으로 수정합니다.</span></div>
              <div className="workflow-buttons">
                <button onClick={() => void recropAllQuestions()} disabled={!questions.length || !pdfDoc || anchorBusy || !!busy}>
                  {!pdfDoc ? "PDF 불러오는 중..." : anchorBusy ? "자르기 기준 준비 중..." : busy === "recrop" ? `보정 중 ${queueProgress.done}/${queueProgress.total}` : "전체 보정 자르기"}
                </button>
                <button onClick={() => setViewMode("single")} disabled={!questions.length}>수동 자르기 화면</button>
                <button className="cancel-all" onClick={() => void resetStage("crop")} disabled={!questions.length || !!busy}>자르기 전체 취소</button>
                <button className="pass" onClick={() => void passCropStep()} disabled={!questions.length || !!busy}>자르기 전체 통과 →</button>
              </div>
              {busy === "recrop" ? (
                <div className="crop-live-progress">
                  <strong>{questions[Math.min(queueProgress.done, Math.max(0, questions.length - 1))]?.question_no ?? "-"}번 문항 보정 중</strong>
                  <span><i style={{ width: `${queueProgress.total ? Math.round(queueProgress.done / queueProgress.total * 100) : 0}%` }} /></span>
                  <small>{queueProgress.done}/{queueProgress.total} 완료 · 아래 카드가 순서대로 갱신됩니다.</small>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="workflow-action">
              <div><strong>3단계 · AI 문항분석</strong><span>자동 통과는 문제은행 대기, 확인이 필요한 문항만 보류로 분류합니다.</span></div>
              <div className="workflow-buttons">
                <button onClick={() => void runAutoPipeline()} disabled={!analysisNeededQuestions.length || savedCropCount !== questions.length || !!busy}>
                  {analysisNeededQuestions.length ? `재분석 필요 ${analysisNeededQuestions.length}문항 분석` : "분석 완료"}
                </button>
                <button
                  className="analyze-one-prominent"
                  onClick={() => void analyzeOneQuestion(activeQuestion)}
                  disabled={!activeQuestion || isBankRegistered(activeQuestion, registeredIdSet) || !!busy}
                  title={activeQuestion && isBankRegistered(activeQuestion, registeredIdSet) ? "문제은행에서 삭제한 뒤 재분석할 수 있습니다." : "현재 선택한 문항만 재분석합니다."}
                >
                  {activeQuestion ? `${activeQuestion.question_no}번만 재분석` : "문항 1개 재분석"}
                </button>
                <button className="cancel-all" onClick={() => void resetStage("analysis")} disabled={!questions.length || !!busy}>분석 전체 취소</button>
                <button onClick={() => setViewMode("pending")}>문제은행 대기 {pendingQuestions.length}</button>
                <button className="review-button" onClick={() => setViewMode("review")}>보류 확인 {reviewQuestions.length}</button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <section className="source-bar">
        <label>
          <span className="source-label-head">
            분석할 시험지
            {selectedSource ? <b className={`source-status-badge ${sourceWorkflowTone(selectedSource.workflow_state)}`}>{selectedSource.workflow_label}{selectedSource.workflow_detail ? ` · ${selectedSource.workflow_detail}` : ""}</b> : null}
          </span>
          <select
            className={`source-status-select ${sourceWorkflowTone(selectedSource?.workflow_state)}`}
            value={selectedId}
            onChange={(event) => void loadWorkspace(event.target.value)}
            disabled={busy === "load"}
          >
            {sources.length === 0 ? <option value="">등록된 시험지가 없습니다.</option> : null}
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                [{source.workflow_label || "상태 확인 중"}] {source.title} · {source.subject || "과목 미정"}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => void loadWorkspace(selectedId)} disabled={!selectedId || !!busy}>새로고침</button>
        {workspace?.solutionUrl ? <a href={workspace.solutionUrl} target="_blank" rel="noreferrer">해설지 보기</a> : null}
      </section>

      <section className={`ai-health ${aiHealth.success === true ? "ok" : aiHealth.success === false ? "fail" : "idle"}`}>
        <div>
          <span className="health-dot" />
          <div>
            <small>AI 연결 상태</small>
            <strong>{aiHealth.message}</strong>
          </div>
        </div>
        <button onClick={() => void checkAiHealth()} disabled={aiHealth.checking}>
          {aiHealth.checking ? "확인 중..." : "연결 다시 확인"}
        </button>
      </section>

      {pdfDoc ? (
        <section className={`ai-health ${anchorBusy ? "idle" : anchors?.hasTextLayer ? "ok" : "fail"}`}>
          <div>
            <span className="health-dot" />
            <div>
              <small>자르기 기준</small>
              <strong>
                {anchorBusy
                  ? "PDF에서 문항번호 좌표를 읽는 중..."
                  : anchors?.hasTextLayer
                    ? `PDF 텍스트 좌표 사용 · 문항번호 ${anchors.byQuestionNo.size}개 인식`
                    : "텍스트 레이어 없음(스캔본) · AI 추정 좌표로 대체"}
              </strong>
            </div>
          </div>
        </section>
      ) : null}

      {currentBusyInfo ? (
        <MATHPOOHLoader
          audience="admin"
          title={currentBusyInfo.title}
          detail={currentBusyInfo.detail}
          current={showQueueProgress ? queueProgress.done : undefined}
          total={showQueueProgress ? queueProgress.total : undefined}
          currentLabel={showQueueProgress ? (busy === "register-pending" ? `문제은행 등록 ${Math.min(queueProgress.done + 1, queueProgress.total)}번째 묶음 처리` : `${questions[Math.min(queueProgress.done, Math.max(0, questions.length - 1))]?.question_no ?? Math.min(queueProgress.done + 1, queueProgress.total)}번 문항`) : undefined}
          kind={busy === "recrop" || busy === "crop" ? "crop" : busy === "save" || busy === "register-pending" ? "save" : busy === "load" || busy === "pdf" ? "loading" : "analysis"}
        />
      ) : null}

      {!workspace ? (
        <section className="empty-panel">
          {busy === "load" ? "분석화면을 불러오는 중입니다..." : "분석할 시험지를 선택해 주세요."}
        </section>
      ) : (
        <>
          <section className="status-panel">
            <div><small>시험지</small><strong>{workspace.source.title}</strong></div>
            <div><small>상태</small><strong>{statusText[analysisStatus] ?? analysisStatus}</strong></div>
            <div><small>현재 단계</small><strong>{workspace.analysis?.current_step || "AI 분석 전"}</strong></div>
            <div><small>문항</small><strong>{questions.length}문항</strong></div>
            <div><small>자르기 완료</small><strong>{croppedCount}/{questions.length}</strong></div>
            <div className="progress-wrap"><span style={{ width: `${progress}%` }} /></div>
          </section>

          {workflowStep === 3 ? <section className="pipeline-bar">
            <div className="mode-buttons status-tabs">
              <button className={viewMode === "single" ? "active" : ""} onClick={() => setViewMode("single")}>한 문항 보기</button>
              <button className={viewMode === "all" ? "active" : ""} onClick={() => setViewMode("all")}>전체 {questions.length}</button>
              <button className={viewMode === "registered" ? "active registered" : ""} onClick={() => setViewMode("registered")}>등록완료 {registeredQuestions.length}</button>
              <button className={viewMode === "pending" ? "active pending" : ""} onClick={() => setViewMode("pending")}>등록대기 {pendingQuestions.length}</button>
              <button className={viewMode === "review" ? "active review" : ""} onClick={() => setViewMode("review")}>검토보류 {reviewQuestions.length}</button>
              <button className={viewMode === "failed" ? "active failed" : ""} onClick={() => setViewMode("failed")}>제외/실패 {failedQuestions.length}</button>
            </div>
            <div className="pipeline-counts"><b>등록완료 {registeredQuestions.length}</b><b>보류 {reviewQuestions.length}</b></div>
            <button className="queue-button" onClick={() => void runAutoPipeline()} disabled={!questions.length || savedCropCount !== questions.length || !!busy}>
              {busy === "queue" ? `AI 분석 ${queueProgress.done}/${queueProgress.total}` : `필요 문항 분석 ${analysisNeededQuestions.length}`}
            </button>
          </section> : null}

          {viewMode === "registered" && registeredQuestions.length ? (
            <section className="pending-toolbar">
              <div className="pending-icon">↩</div>
              <div>
                <small>REGISTERED QUESTIONS</small>
                <strong>등록완료 <b>{registeredQuestions.length}</b>문항</strong>
                <span>필요하면 문제은행 등록만 해제하고 등록대기로 되돌릴 수 있습니다. 분석·해설·DNA는 그대로 보존됩니다.</span>
              </div>
              <button onClick={() => void revertRegisteredToPending()} disabled={!!busy}>
                {busy === "revert-pending" ? "등록대기로 되돌리는 중..." : `등록완료 ${registeredQuestions.length}문항 → 등록대기`}
              </button>
            </section>
          ) : null}

          {viewMode === "pending" && pendingQuestions.length ? (
            <section className="pending-toolbar">
              <div className="pending-icon">✓</div>
              <div>
                <small>READY TO REGISTER</small>
                <strong>등록대기 <b>{pendingQuestions.length}</b>문항</strong>
                <span>분석 기준을 통과한 문항입니다. 한 번에 모두 등록하거나 카드별로 등록할 수 있습니다.</span>
              </div>
              <button onClick={() => void registerPendingQuestions(pendingQuestions)} disabled={!!busy}>
                {busy === "register-pending" ? "문제은행 등록 중..." : `문제은행에 ${pendingQuestions.length}문항 모두 등록 →`}
              </button>
            </section>
          ) : null}

          {viewMode !== "single" ? (
            <section className={`all-crops-grid ${workflowStep === 2 ? "crop-three-grid" : ""}`}>
              {visibleQuestions.map((question) => (
                <article key={question.id} className={`crop-card ${isBankRegistered(question, registeredIdSet) ? "registered-card" : question.status === "AUTO_REGISTERED" || question.status === "APPROVED" ? "auto" : question.status === "REVIEW" ? "hold" : "failed-card"}`}>
                  <button className="card-open" onClick={() => { setActiveQuestionId(question.id); setViewMode("single"); }}>
                    <div className="crop-thumb">
                      {thumbnailUrls[question.id] ? <img src={thumbnailUrls[question.id]} alt={`${question.question_no}번 잘린 문항`} /> : <span>{thumbnailBusy ? "미리보기 생성 중..." : "미리보기 없음"}</span>}
                    </div>
                    <div className="crop-card-head">
                      <strong>{question.question_no}번</strong>
                      <div className="card-status-group">
                        <span className={`card-difficulty level-${valueOf(question, "difficulty") || "unknown"}`}>난이도 {difficultyLabel(valueOf(question, "difficulty"))}</span>
                        <span className="card-workflow-status">{displayQuestionStatus(question, registeredIdSet)}</span>
                      </div>
                    </div>
                    <small>{valueOf(question, "unit") || "단원 분석 전"}</small>
                    <small>신뢰도 {question.confidence == null ? "-" : `${Math.round(Number(question.confidence) * 100)}%`}</small>
                    <small className={`solution-badge ${officialSolutionOf(question, Boolean(workspace?.solutionUrl)).tone}`}>{officialSolutionOf(question, Boolean(workspace?.solutionUrl)).label}</small>
                    {question.review_reason ? <small className="review-reason">{question.review_reason}</small> : null}
                  </button>
                  <div className="review-card-actions single-action solution-open-action">
                    <button onClick={() => { setActiveQuestionId(question.id); setViewMode("single"); }}>공식 해설·DNA 확인</button>
                  </div>
                  {!isBankRegistered(question, registeredIdSet) ? <div className="review-card-actions single-action analyze-one-action">
                    <button onClick={() => { setActiveQuestionId(question.id); void analyzeOneQuestion(question); }} disabled={!!busy}>{question.question_no}번만 재분석</button>
                  </div> : null}
                  {(!isBankRegistered(question, registeredIdSet) && (question.status === "AUTO_REGISTERED" || question.status === "APPROVED")) ? <div className="review-card-actions single-action pending-actions">
                    <button className="register-now" onClick={() => void registerPendingQuestions([question])} disabled={!!busy}>이 문항 문제은행 등록</button>
                  </div> : null}
                  {question.status === "REVIEW" ? <div className="review-card-actions">
                    <button onClick={() => { setActiveQuestionId(question.id); setViewMode("single"); }}>자르기 수정</button>
                    <button className="register-now" onClick={() => void approveForPending(question)} disabled={!!busy}>수정 완료 · 대기로</button>
                    <button className="exclude" onClick={() => void excludeQuestion(question)} disabled={!!busy}>등록 제외</button>
                  </div> : null}
                  {isBankRegistered(question, registeredIdSet) ? <div className="review-card-actions single-action">
                    <button className="register-now" onClick={() => router.push("/problem-bank")}>문제은행에서 보기</button>
                  </div> : null}
                </article>
              ))}
              {!visibleQuestions.length ? <div className="all-empty">이 상태의 문항이 없습니다.</div> : null}
            </section>
          ) : null}

          {viewMode === "single" ? <section className={`workspace-grid ${workflowStep === 1 ? "recognition-mode" : ""}`}>
            <aside className="question-list">
              <div className="panel-title"><h2>문항 번호</h2><span>{questions.length}</span></div>
              <div className="number-grid">
                {questions.map((question) => (
                  <button
                    key={question.id}
                    className={`${question.id === activeQuestion?.id ? "active" : ""} ${hasValidCrop(question) ? "cropped" : ""}`}
                    onClick={() => { setActiveQuestionId(question.id); if (workflowStep === 1 && manualRecognitionMode) setManualRecognitionQuestionNo(String(question.question_no)); }}
                  >
                    {question.question_no}
                  </button>
                ))}
              </div>
              <div className="legend">
                <span><i className="done-dot" />자르기 저장</span>
                <span><i className="active-dot" />현재 문항</span>
              </div>
            </aside>

            <section className="pdf-panel">
              <div className="pdf-toolbar">
                <button disabled={pageNo <= 1} onClick={() => setPageNo((value) => value - 1)}>이전 페이지</button>
                <b>{pageCount ? `${pageNo} / ${pageCount}` : "PDF 로딩"}</b>
                <button disabled={!pageCount || pageNo >= pageCount} onClick={() => setPageNo((value) => value + 1)}>다음 페이지</button>
                <span>{workflowStep === 1
                  ? (manualRecognitionMode ? "문항번호 입력 → 실제 문항 영역을 드래그" : "자동 인식 결과를 확인하세요")
                  : (activeQuestion ? `${activeQuestion.question_no}번 영역을 드래그` : "문항을 선택하세요")}</span>
                {workflowStep === 1 ? <div className="manual-recognition-tools">
                  <button type="button" className={manualRecognitionMode ? "active" : ""} onClick={() => { if (manualRecognitionMode) { setManualRecognitionMode(false); setDraft(null); } else beginManualRecognition(); }}>
                    {manualRecognitionMode ? "직접 추가 종료" : "＋ 누락 문항 직접 추가"}
                  </button>
                  {manualRecognitionMode ? <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={manualRecognitionQuestionNo}
                    onChange={(event) => setManualRecognitionQuestionNo(event.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="문항번호"
                    aria-label="수동 인식 문항번호"
                  /> : null}
                </div> : null}
                {workspace.examUrl ? <a href={workspace.examUrl} target="_blank" rel="noreferrer">원본 새 창</a> : null}
              </div>

              {workflowStep === 1 && manualRecognitionMode ? <div className="manual-recognition-guide"><b>{manualRecognitionQuestionNo || "?"}번 직접 추가 중</b><span>문항번호가 목록에 없어도 괜찮습니다. 현재 PDF에서 문제 전체의 왼쪽 위부터 오른쪽 아래까지 드래그하면 새 문항으로 즉시 생성됩니다.</span><button type="button" onClick={() => setManualRecognitionMode(false)}>끝내기</button></div> : null}

              <div className="canvas-shell">
                {busy === "pdf" ? <div className="loading">시험지를 불러오는 중입니다.</div> : null}
                <canvas ref={canvasRef} />
                {pdfDoc ? (
                  <div
                    ref={overlayRef}
                    className={`overlay ${workflowStep === 1 && manualRecognitionMode ? "manual-recognition-active" : ""}`}
                    onPointerDown={workflowStep === 1 && !manualRecognitionMode ? undefined : handlePointerDown}
                    onPointerMove={workflowStep === 1 && !manualRecognitionMode ? undefined : handlePointerMove}
                    onPointerUp={workflowStep === 1 && !manualRecognitionMode ? undefined : handlePointerUp}
                    onPointerCancel={workflowStep === 1 && !manualRecognitionMode ? undefined : handlePointerCancel}
                  >
                    {workflowStep === 1 ? questions
                      .filter((question) => Number(question.page_no) === pageNo && hasValidCrop(question))
                      .map((question) => {
                        const rect = recognitionDisplayRect(question, anchors);
                        return (
                          <div
                            key={question.id}
                            className={`crop-box recognition-box ${question.review_result?.recognition_manual === true ? "manual" : ""}`}
                            style={{
                              left: `${rect.x}%`,
                              top: `${rect.y}%`,
                              width: `${rect.width}%`,
                              height: `${rect.height}%`,
                            }}
                          >
                            <b>{question.question_no}</b>
                          </div>
                        );
                      }) : null}
                    {workflowStep !== 1 && selection ? (
                      <div
                        className="crop-box selected"
                        style={{
                          left: `${selection.x}%`,
                          top: `${selection.y}%`,
                          width: `${selection.width}%`,
                          height: `${selection.height}%`,
                        }}
                      >
                        <b>{activeQuestion?.question_no}</b>
                      </div>
                    ) : null}
                    {draft ? (
                      <div
                        className="crop-box draft"
                        style={{
                          left: `${draft.x}%`,
                          top: `${draft.y}%`,
                          width: `${draft.width}%`,
                          height: `${draft.height}%`,
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>

            <aside className="review-panel">
              {activeQuestion ? (
                <>
                  <div className="review-sticky-head">
                    <div>
                      <small>현재 문항</small>
                      <h2>{activeQuestion.question_no}번</h2>
                    </div>
                    <div className="question-nav">
                      <button onClick={() => moveQuestion(-1)}>←</button>
                      <button onClick={() => moveQuestion(1)}>→</button>
                    </div>
                  </div>

                  <section className={`official-solution-panel prominent ${officialSolutionOf(activeQuestion, Boolean(workspace?.solutionUrl)).tone}`}>
                    <div className="official-solution-head">
                      <div>
                        <small>{activeQuestion.question_no}번 공식 해설 확인</small>
                        <strong>{officialSolutionOf(activeQuestion, Boolean(workspace?.solutionUrl)).label}</strong>
                      </div>
                      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                        {workspace.solutionUrl ? <button type="button" disabled={busy === "solution-rematch" || solutionAnchorBusy} onClick={() => void rematchOfficialSolution(activeQuestion)}>
                          {busy === "solution-rematch" ? "해설 재매칭 중..." : "↻ 해설 다시 자동 매칭"}
                        </button> : null}
                        {workspace.solutionUrl ? <button type="button" onClick={() => setManualSolutionCropOpen(true)}>해설 PDF에서 직접 긁기</button> : null}
                        {workspace.solutionUrl ? <a href={workspace.solutionUrl} target="_blank" rel="noreferrer">전체 원본 해설지</a> : null}
                      </div>
                    </div>
                    <p>{officialSolutionOf(activeQuestion, Boolean(workspace?.solutionUrl)).detail}</p>
                    {officialSolutionOf(activeQuestion, Boolean(workspace?.solutionUrl)).officialAnswer ? <div className="official-answer"><b>공식 정답</b><strong>{officialSolutionOf(activeQuestion, Boolean(workspace?.solutionUrl)).officialAnswer}</strong></div> : null}
                    {officialSolutionOf(activeQuestion, Boolean(workspace?.solutionUrl)).evidence ? <p><b>확인 근거:</b> {officialSolutionOf(activeQuestion, Boolean(workspace?.solutionUrl)).evidence}</p> : null}
                    {solutionPreviewUrl ? <details open><summary>{activeQuestion.question_no}번 잘린 공식 해설 이미지</summary><img className="solution-preview-image" src={solutionPreviewUrl} alt={`${activeQuestion.question_no}번 공식 해설`} /></details> : <small className="solution-empty">이 문항을 재분석하면 문항별 공식 해설 이미지가 표시됩니다.</small>}
                    {officialSolutionOf(activeQuestion, Boolean(workspace?.solutionUrl)).solutionSteps.length ? <details><summary>AI가 정리한 핵심 풀이</summary><ol>{officialSolutionOf(activeQuestion, Boolean(workspace?.solutionUrl)).solutionSteps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></details> : null}
                  </section>

                  <div className="preview-card">
                    <div className="preview-title">
                      <strong>잘린 문항 미리보기</strong>
                      <span>{hasValidCrop(activeQuestion) ? "저장됨" : "미저장"}</span>
                    </div>
                    <div className="preview-image">
                      {preview ? <img src={preview} alt={`${activeQuestion.question_no}번 미리보기`} /> : <span>원본에서 문항 영역을 드래그하세요.</span>}
                    </div>
                    <div className="crop-actions auto-save-actions">
                      <span>영역을 드래그하면 자동 저장됩니다.</span>
                      <button onClick={() => { setSelection(null); setPreview(""); }}>다시 선택</button>
                    </div>
                  </div>

                  <form key={activeQuestion.id} onSubmit={saveQuestion} className="analysis-form">
                    <div className="form-head">
                      <strong>AI 분석 결과</strong>
                      <button type="button" onClick={() => void analyzeOneQuestion()} disabled={busy === "one"}>
                        {busy === "one" ? "재분석 중..." : "이 문항 재분석"}
                      </button>
                    </div>

                    <ProblemDnaCard question={activeQuestion} />

                    <div className="two-columns">
                      <label>페이지<input name="page_no" type="number" min="1" defaultValue={activeQuestion.page_no ?? pageNo} /></label>
                      <label>정답<input name="answer" defaultValue={activeQuestion.answer ?? ""} /></label>
                    </div>

                    <label>문항 유형
                      <select name="question_type" defaultValue={valueOf(activeQuestion, "question_type") || "unknown"}>
                        <option value="unknown">미분류</option>
                        <option value="multiple_choice">객관식</option>
                        <option value="short_answer">단답형</option>
                        <option value="essay">서술형</option>
                      </select>
                    </label>

                    <label>과목<input name="subject" defaultValue={valueOf(activeQuestion, "subject")} /></label>
                    <label>단원<input name="unit" defaultValue={valueOf(activeQuestion, "unit")} /></label>
                    <label>세부 유형<input name="topic" defaultValue={valueOf(activeQuestion, "topic")} /></label>
                    <label>난이도
                      <select name="difficulty" defaultValue={valueOf(activeQuestion, "difficulty") || ""}><option value="">미분류 · AI/관리자 확인 필요</option>
                        {DIFFICULTY_SCALE.map((d)=><option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                    </label>
                    <label>AI 요약<textarea name="summary" rows={4} defaultValue={valueOf(activeQuestion, "summary")} /></label>

                    <div className="confidence-row">
                      <span>AI 신뢰도</span>
                      <strong>{activeQuestion.confidence == null ? "-" : `${Math.round(Number(activeQuestion.confidence) * 100)}%`}</strong>
                    </div>

                    <button className="analysis-save" type="submit" disabled={busy === "save"}>
                      {busy === "save" ? "저장 중..." : "분석 결과 저장"}
                    </button>
                  </form>
                </>
              ) : (
                <div className="no-question">분석된 문항이 없습니다. 먼저 AI 분석을 실행하세요.</div>
              )}
            </aside>
          </section> : null}
        </>
      )}

      {manualSolutionCropOpen && activeQuestion && solutionPdfDoc ? (
        <ManualSolutionCropModal
          doc={solutionPdfDoc}
          questionNo={Number(activeQuestion.question_no)}
          initialPage={Number(activeQuestion.ai_result?.official_solution_page_no ?? 1)}
          onClose={() => setManualSolutionCropOpen(false)}
          onSave={saveManualOfficialSolution}
        />
      ) : null}

      <style jsx>{`
        .page-move{display:flex;align-items:center;gap:9px;margin-bottom:10px}
        .page-move label{font-size:13px;color:#596274;font-weight:900}
        .page-move select{height:40px;min-width:220px;border:1px solid #cfd5e1;border-radius:10px;background:#fff;padding:0 36px 0 12px;color:#365d3c;font-weight:900;cursor:pointer}
        .page-move select:focus{outline:3px solid rgba(47,105,55,.18);border-color:#2f6937}
        .workflow-panel{max-width:1880px;margin:0 auto 12px;background:#fff;border:1px solid #dce1eb;border-radius:16px;padding:14px}
        .workflow-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
        .workflow-steps>button{min-height:76px;border:1px solid #dce1eb;background:#f8f9fc;border-radius:12px;padding:12px;text-align:left;display:flex;align-items:center;gap:11px;cursor:pointer}
        .workflow-steps>button>b{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#e3e7ef;color:#566071}
        .workflow-steps>button span{display:grid;gap:4px}.workflow-steps>button strong{font-size:16px}.workflow-steps>button small{color:#778092}
        .workflow-steps>button.active{border-color:#2f6937;background:#f3f7f3}.workflow-steps>button.active>b{background:#2f6937;color:#fff}.workflow-steps>button.done>b{background:#2f9b72;color:#fff}
        .workflow-steps>button:disabled{cursor:not-allowed;opacity:.48}
        .workflow-action{margin-top:11px;border-radius:12px;background:#f7f8fb;padding:13px 15px;display:flex;align-items:center;justify-content:space-between;gap:18px}
        .workflow-action>div:first-child{display:grid;gap:4px}.workflow-action span{font-size:13px;color:#6f7889}.workflow-buttons{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
        .workflow-buttons button{height:40px;border:1px solid #d5dbe6;background:#fff;border-radius:9px;padding:0 14px;font-weight:900}.workflow-buttons button.pass{background:#2f6937;border-color:#2f6937;color:#fff}.workflow-buttons button.review-button{background:#6f985c;border-color:#6f985c;color:#fff}.workflow-buttons button:disabled{opacity:.45}
        .workflow-buttons button.cancel-all{border-color:#e0a7a7;background:#fff5f5;color:#ad3f3f}.workflow-buttons button.analyze-one-prominent{border-color:#9fbe9f;background:#f3f7f3;color:#4d7d46;box-shadow:0 2px 8px rgba(47,105,55,.15)}.analyze-one-action button{border-color:#9fbe9f!important;background:#f3f7f3!important;color:#4d7d46!important;font-weight:900}
        .pipeline-bar{max-width:1880px;margin:0 auto 12px;padding:11px 13px;border:1px solid #dce2eb;border-radius:14px;background:#fff;display:flex;align-items:center;gap:12px;box-shadow:0 5px 18px rgba(47,105,55,.06)}.status-tabs{display:flex;gap:6px;flex-wrap:wrap}.status-tabs button{height:38px;padding:0 12px;border:1px solid #dce2eb;border-radius:9px;background:#f7f8fb;color:#59657a;font-weight:900;cursor:pointer}.status-tabs button.active{border-color:#285c31;background:#285c31;color:#fff}.status-tabs button.active.registered{border-color:#27845f;background:#27845f}.status-tabs button.active.pending{border-color:#4d7d46;background:#4d7d46;color:#fff}.status-tabs button.active.review{border-color:#4d7d46;background:#4d7d46}.status-tabs button.active.failed{border-color:#bd4652;background:#bd4652}.pipeline-counts{display:flex;gap:6px;margin-left:auto}.pipeline-counts b{padding:7px 10px;border-radius:999px;background:#eaf7f1;color:#24775a;font-size:12px}.pipeline-counts b+ b{background:#f3f7f3;color:#4d7d46}.queue-button{height:40px;padding:0 14px;border:0;border-radius:9px;background:#2f6937;color:#fff;font-weight:950}.queue-button:disabled{opacity:.45}
        .pending-toolbar{max-width:1880px;margin:0 auto 14px;display:grid;grid-template-columns:52px minmax(0,1fr) auto;align-items:center;gap:14px;padding:16px 18px;border:1px solid #a9c4ad;border-left:6px solid #4d7d46;border-radius:15px;background:linear-gradient(120deg,#f3f7f3,#e9f2ea);box-shadow:0 8px 24px rgba(47,105,55,.11)}.pending-icon{width:48px;height:48px;display:grid;place-items:center;border-radius:50%;background:#4d7d46;color:#fff;font-size:24px;font-weight:950;box-shadow:0 5px 13px rgba(47,105,55,.22)}.pending-toolbar>div:nth-child(2){display:grid;gap:3px}.pending-toolbar small{color:#46734e;font-size:10px;font-weight:950;letter-spacing:.09em}.pending-toolbar strong{color:#285c31;font-size:18px}.pending-toolbar strong b{color:#35683e;font-size:23px}.pending-toolbar span{color:#5f7563;font-size:12px}.pending-toolbar>button{min-width:240px;height:48px;padding:0 18px;border:0;border-radius:11px;background:linear-gradient(135deg,#285c31,#285c31);color:#fff;font-size:14px;font-weight:950;box-shadow:0 7px 17px rgba(47,105,55,.22);cursor:pointer}.pending-toolbar>button:hover{transform:translateY(-1px);box-shadow:0 9px 21px rgba(47,105,55,.27)}.pending-toolbar>button:disabled{opacity:.55;transform:none}
        section.workspace-grid.recognition-mode{grid-template-columns:205px minmax(760px,1fr)}
        section.workspace-grid.recognition-mode .review-panel{display:none}
        section.workspace-grid.recognition-mode .overlay{cursor:default}
        section.workspace-grid.recognition-mode .overlay.manual-recognition-active{cursor:crosshair}
        .manual-recognition-tools{display:flex;align-items:center;gap:6px;margin-left:auto}.manual-recognition-tools button{white-space:nowrap}.manual-recognition-tools button.active{background:#285c31;color:#fff;border-color:#285c31}.manual-recognition-tools input{width:92px;height:36px;border:1px solid #cfd5e1;border-radius:8px;padding:0 9px;font-weight:900}
        .workflow-buttons button.missing-found{background:#fff1d7;border-color:#d99a2b;color:#8b5509;box-shadow:0 0 0 2px rgba(217,154,43,.12)}
        .manual-recognition-guide{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:12px 15px;border:2px solid #2f6937;border-radius:11px;background:#eef8f1;color:#214d2a}.manual-recognition-guide b{font-size:14px}.manual-recognition-guide span{font-size:12px;line-height:1.5}.manual-recognition-guide button{height:34px;border:1px solid #bdd1c1;border-radius:8px;background:#fff;color:#285c31;font-weight:900}
        @media(max-width:760px){.manual-recognition-guide{grid-template-columns:1fr}.manual-recognition-guide button{width:100%}}
        .crop-box.recognition-box{border:3px solid #2f6937;background:rgba(47,105,55,.08)}
        .crop-box.recognition-box.manual{border-color:#1e5aa8;background:rgba(30,90,168,.09)}
        .crop-box.recognition-box b{position:absolute;left:-3px;top:-27px;background:#2f6937;color:#fff;padding:4px 9px;border-radius:7px 7px 0 0;font-size:14px}
        .crop-box.recognition-box.manual b{background:#1e5aa8}
        section.all-crops-grid.crop-three-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
        section.all-crops-grid.crop-three-grid .crop-card{min-width:0;min-height:520px;padding:14px}
        section.all-crops-grid.crop-three-grid .card-open{grid-template-rows:400px auto auto auto;gap:10px}
        section.all-crops-grid.crop-three-grid .crop-thumb{height:400px;min-height:400px;max-height:400px;background:#fff}
        section.all-crops-grid.crop-three-grid .crop-thumb img{width:100%;max-height:none;object-fit:contain}
        section.all-crops-grid.crop-three-grid .crop-card-head strong{font-size:22px}
        section.all-crops-grid.crop-three-grid .crop-card-head span,section.all-crops-grid.crop-three-grid .crop-card small{font-size:15px}
        .card-status-group{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}
        .card-difficulty{display:inline-flex;align-items:center;justify-content:center;min-width:70px;padding:5px 9px;border-radius:999px;font-size:13px!important;font-weight:900;line-height:1;color:#fff;box-shadow:0 3px 8px rgba(15,29,55,.14)}
        .card-difficulty.level-1{background:#31936c}
        .card-difficulty.level-2{background:#4f72c8}
        .card-difficulty.level-3{background:#c9932d}
        .card-difficulty.level-4{background:#e36f2d}
        .card-difficulty.level-5{background:#b83d58}
        .card-difficulty.level-6{background:#a85636}
        .card-difficulty.level-7{background:#8d3e55}
        .card-difficulty.level-8{background:#62243d}
        .card-difficulty.level-unknown{background:#8b95a7}
        .card-workflow-status{white-space:nowrap}
        .workflow-action .crop-live-progress{flex:1 0 100%;display:grid;grid-template-columns:auto minmax(240px,1fr) auto;align-items:center;gap:10px;padding:11px 13px;border-radius:10px;background:#eaf0ff;color:#364dbb}
        .crop-live-progress>span{height:12px;overflow:hidden;border-radius:999px;background:#d4dcf7}.crop-live-progress>span i{display:block;height:100%;background:#2f6937;transition:width .2s}.crop-live-progress small{font-weight:800;color:#65708c}
        .workflow-action:has(.crop-live-progress){flex-wrap:wrap}
        .solution-badge{display:inline-flex!important;width:max-content;padding:5px 8px;border-radius:999px;font-weight:900!important}
        .solution-badge.verified{background:#e4f7ee;color:#187653}.solution-badge.review{background:#f3f7f3;color:#a65316}.solution-badge.missing{background:#fdeaea;color:#ad3434}
        .solution-open-action button{background:#f3f7f3!important;border-color:#98a5ef!important;color:#3348b2!important;font-weight:950!important}
        .official-solution-panel{display:grid;gap:9px;padding:12px;border:1px solid;border-radius:11px}
        .official-solution-panel.prominent{margin-top:12px;border-width:2px;box-shadow:0 5px 16px rgba(47,105,55,.08)}
        .official-solution-panel.verified{border-color:#9ed8bd;background:#f0fbf6}.official-solution-panel.review{border-color:#efc18f;background:#fff8ed}.official-solution-panel.missing{border-color:#edb2b2;background:#fff5f5}
        .official-solution-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.official-solution-head>div{display:grid;gap:2px}.official-solution-head small{color:#758091;font-size:11px}.official-solution-head strong{font-size:14px}.official-solution-head a{padding:7px 9px;border:1px solid currentColor;border-radius:7px;font-size:12px;font-weight:900;text-decoration:none}
        .official-solution-panel p{margin:0;color:#535e70;font-size:12px;line-height:1.55}.official-solution-panel details{padding-top:7px;border-top:1px solid rgba(80,90,110,.16)}.official-solution-panel summary{cursor:pointer;font-size:12px;font-weight:900}.official-solution-panel ol{margin:9px 0 0;padding-left:20px;color:#3f4858;font-size:12px;line-height:1.55}.solution-empty{color:#7d8695}
        .official-answer{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.72);font-size:12px}.official-answer strong{font-size:17px;color:#24345c}
        .solution-preview-image{display:block;width:100%;max-height:420px;object-fit:contain;margin:9px 0;border:1px solid #dce1e9;border-radius:8px;background:#fff}
        .dna-card{display:grid;gap:7px;padding:12px;border:1px solid #d7dcec;border-radius:12px;background:#f9faff}.dna-card-title{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:8px;border-bottom:1px solid #e0e4ef}.dna-card-title>div{display:grid;gap:2px}.dna-card-title small{color:#65708a;font-size:10px}.dna-card-title strong{font-size:14px}.dna-card-title em{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#2f6937;color:#fff;font-size:20px;font-style:normal;font-weight:950}
        .dna-card details{border:1px solid #e0e4ee;border-radius:8px;background:#fff;overflow:hidden}.dna-card summary{cursor:pointer;padding:9px 10px;color:#30394c;font-size:12px;font-weight:950}.dna-section{display:grid;gap:7px;padding:0 10px 10px}.dna-line{display:grid;gap:2px}.dna-line b{color:#727c91;font-size:10px}.dna-line span{color:#303847;font-size:12px;line-height:1.45}.dna-score-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.dna-score-grid span{display:flex;justify-content:space-between;padding:6px;border-radius:6px;background:#eef1f8;color:#667084;font-size:10px}.dna-score-grid b{color:#24304a;font-size:11px}.dna-final{display:grid;gap:5px;padding:10px;border-radius:8px;background:#e9edff;color:#35446f;font-size:11px;line-height:1.45}.dna-final>b{color:#1f2f64;font-size:12px}
        @media(max-width:1300px){section.all-crops-grid.crop-three-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:1000px){.pipeline-bar{align-items:stretch;flex-wrap:wrap}.pipeline-counts{margin-left:0}.pending-toolbar{grid-template-columns:46px 1fr}.pending-toolbar>button{grid-column:1/-1;width:100%}}@media(max-width:760px){section.workspace-grid.recognition-mode{grid-template-columns:1fr}section.all-crops-grid.crop-three-grid{grid-template-columns:1fr}.pending-toolbar{grid-template-columns:1fr;text-align:center}.pending-icon{margin:auto}.pending-toolbar>button{grid-column:auto;min-width:0}.pipeline-counts{width:100%}}
      `}</style>
    </main>
    </AdminPortalShell>
  );
}
