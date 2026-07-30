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
import {
  buildDocumentAnchors,
  type DocumentAnchors,
  type QuestionAnchor,
} from "@/lib/crop/question-anchors";

type SourceFile = {
  id: string;
  created_at: string;
  title: string;
  source: string | null;
  grade: string | null;
  subject: string | null;
  status: string;
  error_message: string | null;
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
  APPROVED: "검수 완료",
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
  return String(review[key] ?? ai[key] ?? "");
}

function isBankRegistered(question: Question) {
  return String(question.review_result?.bank_status ?? "") === "REGISTERED";
}

function displayQuestionStatus(question: Question) {
  return isBankRegistered(question) ? "등록 완료" : (statusText[question.status] ?? question.status);
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

const CROP_ENGINE_VERSION = "text-anchor-v1";

/** 텍스트 앵커 자르기에서 내용 바깥으로 남길 여백(px, 렌더 캔버스 기준) */
const ANCHOR_PADDING = {
  left: 14,
  top: 10,
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
    y: Math.max(0, anchor.topPct - 0.5),
    width: Math.max(1, anchor.columnRightPct - anchor.columnLeftPct),
    height: Math.max(1, anchor.bottomPct - anchor.topPct),
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
    // 단의 마지막 문항: 다음 문항이 없으므로 큰 공백에서 멈춘다.
    blockBottom = descendToBlockBottom(ink, blockTop, Math.max(24, Math.round(pageH * 0.045)));
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

function hasValidCrop(question: Question | null) {
  if (!question) return false;
  return (
    Number(question.page_no) >= 1 &&
    Number(question.crop_width) > 0 &&
    Number(question.crop_height) > 0
  );
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
  const [pageNo, setPageNo] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [preview, setPreview] = useState("");

  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("저장됨");
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
  const activeQuestion =
    questions.find((item) => item.id === activeQuestionId) ?? questions[0] ?? null;


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
    const result = await supabase
      .from("source_files")
      .select("id,created_at,title,source,grade,subject,status,error_message")
      .order("created_at", { ascending: false });

    if (result.error) throw result.error;
    const rows = (result.data ?? []) as SourceFile[];
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

  // PDF 텍스트 레이어에서 문항번호의 실제 좌표를 한 번만 읽어 캐시한다.
  // AI 좌표와 달리 오차가 없고, 문항 목록이 바뀔 때만 다시 계산한다.
  const questionNoKey = useMemo(
    () => questions.map((item) => item.question_no).join(","),
    [questions],
  );

  useEffect(() => {
    if (!pdfDoc) {
      setAnchors(null);
      return;
    }

    let cancelled = false;
    setAnchorBusy(true);

    void (async () => {
      try {
        const expected = questionNoKey
          .split(",")
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0);
        const result = await buildDocumentAnchors(pdfDoc, expected.length ? expected : undefined);
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
  }, [pdfDoc, questionNoKey]);

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
    if (draft && draft.width >= 1 && draft.height >= 1) setSelection(draft);
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
    if ((viewMode === "all" || viewMode === "review") && pdfDoc && questions.length) {
      void buildThumbnails();
    }
  }, [viewMode, pdfDoc, questions.length, buildThumbnails]);

  async function startAnalysis() {
    if (!workspace) return;

    // 문항이 이미 있으면 AI를 다시 호출하지 않는다.
    // 현재 좌표에 단일 Crop 엔진만 적용하여 같은 결과를 다시 저장한다.
    if (questions.length > 0) {
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
      setMessage(`전체 빠른 자르기 완료 · ${payload.questionCount ?? 0}문항 · 이제 전체 문항 자르기를 저장하세요.`);
      await loadWorkspace(workspace.source.id);
      await loadSources();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 분석에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function saveCrop() {
    if (!workspace?.analysis?.id || !activeQuestion || !selection || !preview) {
      setError("시험지에서 문항 영역을 먼저 드래그해 주세요.");
      return;
    }

    setBusy("crop");
    setError("");
    setMessage("");

    try {
      const blob = await (await fetch(preview)).blob();
      const form = new FormData();
      form.append("image", blob, `${String(activeQuestion.question_no).padStart(3, "0")}.webp`);
      form.append("analysisId", workspace.analysis.id);
      form.append("sourceFileId", workspace.source.id);
      form.append("questionId", activeQuestion.id);
      form.append("questionNo", String(activeQuestion.question_no));
      form.append("pageNo", String(pageNo));
      form.append("cropX", String(selection.x));
      form.append("cropY", String(selection.y));
      form.append("cropWidth", String(selection.width));
      form.append("cropHeight", String(selection.height));

      const response = await fetch("/api/problem-bank/materialize", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "문항 이미지 저장에 실패했습니다.");
      }

      const reviewResult = {
        ...(activeQuestion.review_result ?? {}),
        crop_engine_version: CROP_ENGINE_VERSION,
        crop_manual: true,
      };
      const patchResponse = await fetch(`/api/analysis/questions/${activeQuestion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_no: pageNo,
          crop_x: selection.x,
          crop_y: selection.y,
          crop_width: selection.width,
          crop_height: selection.height,
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
                item.id === activeQuestion.id
                  ? { ...patchPayload.question, question_image_path: payload.path ?? patchPayload.question.question_image_path }
                  : item,
              ),
            }
          : current,
      );
      setMessage(`${activeQuestion.question_no}번 문항 이미지 저장 완료`);
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
      difficulty: String(form.get("difficulty") ?? "중"),
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

  async function analyzeOneQuestion() {
    if (!activeQuestion) return;
    setBusy("one");
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/analysis/questions/${activeQuestion.id}/analyze`, {
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
                item.id === activeQuestion.id ? payload.question : item,
              ),
            }
          : current,
      );
      setMessage(`${activeQuestion.question_no}번 문항 재분석 완료`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문항 분석에 실패했습니다.");
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
    setBusy("register-pending");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/problem-bank/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: workspace.analysis.id,
          questionIds: targets.map((item) => item.id),
        }),
      });
      const raw = await response.text();
      let payload: any = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch {
        throw new Error(`문제은행 등록 응답이 JSON이 아닙니다. HTTP ${response.status}`);
      }
      if (!response.ok || !payload?.success) throw new Error(apiErrorMessage(payload, "문제은행 등록에 실패했습니다.", response.status));
      await loadWorkspace(workspace.source.id);
      setViewMode("registered");
      setMessage(`${Number(payload.registered ?? targets.length)}문항을 문제은행에 등록했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문제은행 등록에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function approveAndRegister(question: Question) {
    if (!workspace?.analysis?.id) return;
    setBusy("review-action");
    setError("");
    setMessage("");
    try {
      await patchQuestionStatus(question, "APPROVED");
      const response = await fetch("/api/problem-bank/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: workspace.analysis.id, questionIds: [question.id] }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(apiErrorMessage(payload, "문제은행 등록에 실패했습니다.", response.status));
      await loadWorkspace(workspace.source.id);
      setViewMode("review");
      setMessage(`${question.question_no}번을 문제은행에 등록했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문제은행 등록에 실패했습니다.");
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


  async function materializeQuestion(question: Question): Promise<Question> {
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

    // 미적용 문항만 canonical 계산. 이미 같은 엔진으로 저장된 문항은 정확히 같은 좌표로 다시 저장한다.
    const canonical = resolveQuestionCrop(sourceCanvas, question, anchors);
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
      crop_manual: false,
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
            y: Math.max(0, anchor.topPct - 0.5),
            width: Math.max(1, anchor.columnRightPct - anchor.columnLeftPct),
            height: Math.max(1, anchor.bottomPct - anchor.topPct),
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문항 목록을 채우지 못했습니다.");
    } finally {
      setBusy("");
      setQueueProgress({ done: 0, total: 0 });
    }
  }

  async function recropAllQuestions() {
    if (!workspace || !pdfDoc || !questions.length) return;
    setBusy("recrop");
    setError("");
    setMessage("");
    setQueueProgress({ done: 0, total: questions.length });
    try {
      const updated: Question[] = [];
      for (let index = 0; index < questions.length; index += 1) {
        const nextQuestion = await materializeQuestion(questions[index]);
        updated.push(nextQuestion);
        setQueueProgress({ done: index + 1, total: questions.length });
      }
      setWorkspace((current) => current ? { ...current, questions: current.questions.map((item) => updated.find((next) => next.id === item.id) ?? item) } : current);
      setThumbnailUrls({});
      setMessage(`전체 문항 자르기 저장 완료 · ${updated.length}문항 · AI 좌표는 다시 호출하지 않았습니다.`);
      if (viewMode === "all" || viewMode === "review") await buildThumbnails();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "전체 문항 다시 자르기에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function runAutoPipeline() {
    if (!workspace || !pdfDoc || !questions.length) return;
    setBusy("queue");
    setError("");
    setMessage("");
    setQueueProgress({ done: 0, total: questions.length });

    const concurrency = Math.min(3, questions.length);
    const failures: Array<{ questionNo: number; message: string }> = [];
    let cursor = 0;
    let done = 0;

    async function analyzeQueuedQuestion(question: Question) {
      let target = question;
      if (!target.question_image_path || !isCanonicalized(target)) {
        target = await materializeQuestion(target);
      }

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

      setWorkspace((current) => current ? {
        ...current,
        questions: current.questions.map((item) => item.id === target.id ? payload.question : item),
      } : current);
    }

    async function worker() {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= questions.length) return;
        const question = questions[index];

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
          setQueueProgress({ done, total: questions.length });
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      // 분석 기준을 통과한 문항을 한 번에 문제은행으로 넘긴다.
      // 임베딩도 묶어서 생성하므로 문항별 등록보다 빠르고, upsert라 재실행해도 중복되지 않는다.
      let registered = 0;
      const analysisId = workspace.analysis?.id;
      if (analysisId) {
        const registerResponse = await fetch("/api/problem-bank/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysisId }),
        });
        const registerRaw = await registerResponse.text();
        let registerPayload: any = null;
        try {
          registerPayload = registerRaw ? JSON.parse(registerRaw) : null;
        } catch {
          throw new Error(`문제은행 등록 응답이 JSON이 아닙니다. HTTP ${registerResponse.status}`);
        }

        // 자동등록 대상이 0개인 경우는 오류가 아니라 전부 검토대상인 정상 상황이다.
        if (registerResponse.ok && registerPayload?.success) {
          registered = Number(registerPayload.registered ?? 0);
          await loadWorkspace(selectedId);
        } else if (registerResponse.status !== 400 || !String(registerPayload?.message ?? "").includes("등록할 문항이 없습니다")) {
          throw new Error(apiErrorMessage(registerPayload, "문제은행 자동등록에 실패했습니다.", registerResponse.status));
        }
      }

      if (failures.length) {
        const preview = failures.slice(0, 4).map((item) => `${item.questionNo}번`).join(", ");
        setError(`분석 실패 ${failures.length}문항(${preview}${failures.length > 4 ? " 외" : ""})은 검토대상으로 보류했습니다.`);
        setMessage(`자동 처리 완료 · 문제은행 등록 ${registered} · 검토보류 ${failures.length}`);
      } else {
        setMessage(`자동 처리 완료 · 문제은행 등록 ${registered}문항 · 나머지는 검토대상으로 보류했습니다.`);
      }
      setViewMode("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "자동 처리 중 오류가 발생했습니다.");
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

  const analysisStatus = workspace?.analysis?.status ?? workspace?.source.status ?? "uploaded";
  const progress = Math.max(0, Math.min(100, Number(workspace?.analysis?.progress ?? 0)));
  const croppedCount = questions.filter((question) => hasValidCrop(question)).length;
  const registeredQuestions = questions.filter((question) => isBankRegistered(question));
  const pendingQuestions = questions.filter((question) =>
    !isBankRegistered(question) && (question.status === "AUTO_REGISTERED" || question.status === "APPROVED")
  );
  const reviewQuestions = questions.filter((question) => question.status === "REVIEW");
  const failedQuestions = questions.filter((question) => question.status === "FAILED" || question.status === "REJECTED");
  const visibleQuestions = viewMode === "registered" ? registeredQuestions
    : viewMode === "pending" ? pendingQuestions
    : viewMode === "review" ? reviewQuestions
    : viewMode === "failed" ? failedQuestions
    : questions;

  return (
    <main className="analysis-page">
      <header className="page-header">
        <div>
          <button className="back-button" onClick={() => router.push("/problem-bank")}>← 문제은행</button>
          <small>AI ANALYSIS WORKSPACE</small>
          <h1>AI 문항 분석 · 자르기 검수</h1>
          <p>원본 PDF에서 문항 영역을 확인하고, 잘못 잘린 문항만 다시 지정한 뒤 분석 결과를 검수합니다.</p>
        </div>
        <div className="header-actions">
          <span className="save-state">{saveState}</span>
          {anchors?.hasTextLayer ? (
            <button
              onClick={() => void fillMissingQuestionsFromPdf()}
              disabled={!workspace?.analysis?.id || !!busy}
              title="AI가 놓친 문항을 PDF 문항번호에서 찾아 채웁니다."
            >
              {busy === "fill" ? `문항 채우는 중 ${queueProgress.done}/${queueProgress.total}` : "PDF에서 빠진 문항 채우기"}
            </button>
          ) : null}
          <button className="primary" onClick={() => void startAnalysis()} disabled={!workspace || !!busy}>
            {busy === "analysis" ? "AI 좌표 찾는 중..." : busy === "recrop" ? `전체 저장 ${queueProgress.done}/${queueProgress.total}` : questions.length ? "전체 문항 자르기 저장" : "전체 빠른 자르기 시작"}
          </button>
        </div>
      </header>

      {message ? <div className="notice success">{message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="source-bar">
        <label>
          분석할 시험지
          <select
            value={selectedId}
            onChange={(event) => void loadWorkspace(event.target.value)}
            disabled={busy === "load"}
          >
            {sources.length === 0 ? <option value="">등록된 시험지가 없습니다.</option> : null}
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.title} · {source.grade || "학년 미정"} · {source.subject || "과목 미정"}
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

      {(busy === "queue" || busy === "one" || busy === "analysis") ? (
        <div className="ai-working-overlay" role="status" aria-live="polite">
          <div className="ai-working-card">
            <div className="ai-orbit"><span>AI</span></div>
            <h2>{busy === "queue" ? "AI가 문항을 분석하고 있습니다" : busy === "one" ? "AI가 선택 문항을 다시 분석하고 있습니다" : "AI가 시험지의 문항 위치를 찾고 있습니다"}</h2>
            <p>화면을 닫지 말고 잠시 기다려 주세요.</p>
            {busy === "queue" ? (
              <>
                <div className="ai-progress-label"><b>{queueProgress.done} / {queueProgress.total}</b><span>문항 처리</span></div>
                <div className="ai-progress-track"><i style={{ width: `${queueProgress.total ? Math.round(queueProgress.done / queueProgress.total * 100) : 0}%` }} /></div>
                <small>자르기 저장 → AI 분석 → 자동 판정 → 문제은행 등록</small>
              </>
            ) : <div className="ai-pulse-row"><i /><i /><i /></div>}
          </div>
        </div>
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

          <section className="pipeline-bar">
            <div className="mode-buttons status-tabs">
              <button className={viewMode === "single" ? "active" : ""} onClick={() => setViewMode("single")}>한 문항 보기</button>
              <button className={viewMode === "all" ? "active" : ""} onClick={() => setViewMode("all")}>전체 {questions.length}</button>
              <button className={viewMode === "registered" ? "active registered" : ""} onClick={() => setViewMode("registered")}>등록완료 {registeredQuestions.length}</button>
              <button className={viewMode === "pending" ? "active pending" : ""} onClick={() => setViewMode("pending")}>등록대기 {pendingQuestions.length}</button>
              <button className={viewMode === "review" ? "active review" : ""} onClick={() => setViewMode("review")}>검토보류 {reviewQuestions.length}</button>
              <button className={viewMode === "failed" ? "active failed" : ""} onClick={() => setViewMode("failed")}>제외/실패 {failedQuestions.length}</button>
            </div>
            <div className="pipeline-counts"><b>등록완료 {registeredQuestions.length}</b><b>보류 {reviewQuestions.length}</b></div>
            <button className="queue-button" onClick={() => void runAutoPipeline()} disabled={!questions.length || !!busy}>
              {busy === "queue" ? `자동 처리 ${queueProgress.done}/${queueProgress.total}` : "자르기 저장 + 문항분석 자동 실행"}
            </button>
          </section>

          {viewMode === "pending" && pendingQuestions.length ? (
            <section className="pending-toolbar">
              <div>
                <strong>등록대기 {pendingQuestions.length}문항</strong>
                <span>분석 기준을 통과한 문항입니다. 한 번에 모두 등록하거나 카드별로 등록할 수 있습니다.</span>
              </div>
              <button onClick={() => void registerPendingQuestions(pendingQuestions)} disabled={!!busy}>
                {busy === "register-pending" ? "문제은행 등록 중..." : `${pendingQuestions.length}문항 전체 문제은행 등록`}
              </button>
            </section>
          ) : null}

          {viewMode !== "single" ? (
            <section className={`all-crops-grid ${viewMode === "review" ? "review-large-grid" : ""}`}>
              {visibleQuestions.map((question) => (
                <article key={question.id} className={`crop-card ${isBankRegistered(question) ? "registered-card" : question.status === "AUTO_REGISTERED" || question.status === "APPROVED" ? "auto" : question.status === "REVIEW" ? "hold" : "failed-card"}`}>
                  <button className="card-open" onClick={() => { setActiveQuestionId(question.id); setViewMode("single"); }}>
                    <div className="crop-thumb">
                      {thumbnailUrls[question.id] ? <img src={thumbnailUrls[question.id]} alt={`${question.question_no}번 잘린 문항`} /> : <span>{thumbnailBusy ? "미리보기 생성 중..." : "미리보기 없음"}</span>}
                    </div>
                    <div className="crop-card-head"><strong>{question.question_no}번</strong><span>{displayQuestionStatus(question)}</span></div>
                    <small>{valueOf(question, "unit") || "단원 분석 전"}</small>
                    <small>신뢰도 {question.confidence == null ? "-" : `${Math.round(Number(question.confidence) * 100)}%`}</small>
                    {question.review_reason ? <small className="review-reason">{question.review_reason}</small> : null}
                  </button>
                  {(!isBankRegistered(question) && (question.status === "AUTO_REGISTERED" || question.status === "APPROVED")) ? <div className="review-card-actions single-action pending-actions">
                    <button className="register-now" onClick={() => void registerPendingQuestions([question])} disabled={!!busy}>이 문항 문제은행 등록</button>
                  </div> : null}
                  {question.status === "REVIEW" ? <div className="review-card-actions">
                    <button onClick={() => { setActiveQuestionId(question.id); setViewMode("single"); }}>자르기 수정</button>
                    <button onClick={() => { setActiveQuestionId(question.id); setViewMode("single"); setTimeout(() => void analyzeOneQuestion(), 0); }}>분석 다시</button>
                    <button className="register-now" onClick={() => void approveAndRegister(question)} disabled={!!busy}>현재 결과로 등록</button>
                    <button className="exclude" onClick={() => void excludeQuestion(question)} disabled={!!busy}>등록 제외</button>
                  </div> : null}
                  {isBankRegistered(question) ? <div className="review-card-actions single-action">
                    <button className="register-now" onClick={() => router.push("/problem-bank")}>문제은행에서 보기</button>
                  </div> : null}
                </article>
              ))}
              {!visibleQuestions.length ? <div className="all-empty">이 상태의 문항이 없습니다.</div> : null}
            </section>
          ) : null}

          {viewMode === "single" ? <section className="workspace-grid">
            <aside className="question-list">
              <div className="panel-title"><h2>문항 번호</h2><span>{questions.length}</span></div>
              <div className="number-grid">
                {questions.map((question) => (
                  <button
                    key={question.id}
                    className={`${question.id === activeQuestion?.id ? "active" : ""} ${hasValidCrop(question) ? "cropped" : ""}`}
                    onClick={() => setActiveQuestionId(question.id)}
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
                <span>{activeQuestion ? `${activeQuestion.question_no}번 영역을 드래그` : "문항을 선택하세요"}</span>
                {workspace.examUrl ? <a href={workspace.examUrl} target="_blank" rel="noreferrer">원본 새 창</a> : null}
              </div>

              <div className="canvas-shell">
                {busy === "pdf" ? <div className="loading">시험지를 불러오는 중입니다.</div> : null}
                <canvas ref={canvasRef} />
                {pdfDoc ? (
                  <div
                    ref={overlayRef}
                    className="overlay"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    {selection ? (
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

                  <div className="preview-card">
                    <div className="preview-title">
                      <strong>잘린 문항 미리보기</strong>
                      <span>{hasValidCrop(activeQuestion) ? "저장됨" : "미저장"}</span>
                    </div>
                    <div className="preview-image">
                      {preview ? <img src={preview} alt={`${activeQuestion.question_no}번 미리보기`} /> : <span>원본에서 문항 영역을 드래그하세요.</span>}
                    </div>
                    <div className="crop-actions">
                      <button className="crop-save" onClick={() => void saveCrop()} disabled={busy === "crop" || !selection}>
                        {busy === "crop" ? "저장 중..." : "문항 자르기 저장"}
                      </button>
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
                      <select name="difficulty" defaultValue={valueOf(activeQuestion, "difficulty") || "중"}>
                        <option value="하">하</option>
                        <option value="중">중</option>
                        <option value="상">상</option>
                        <option value="최상">최상</option>
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

      <style jsx>{`
        *{box-sizing:border-box}.analysis-page{min-height:100vh;background:#f3f5f9;padding:20px;font-family:Arial,"Pretendard",sans-serif;color:#202433}.page-header{max-width:1880px;margin:0 auto 14px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}.back-button{border:0;background:transparent;padding:0 0 8px;color:#5f687a;font-weight:800;cursor:pointer}.page-header small{display:block;color:#566bdc;font-weight:900;letter-spacing:.08em}.page-header h1{margin:5px 0;font-size:30px}.page-header p{margin:0;color:#71798a}.header-actions{display:flex;align-items:center;gap:12px}.save-state{font-size:13px;color:#7a8291}.primary{border:0;background:#5369df;color:#fff;border-radius:11px;padding:13px 20px;font-weight:900}.primary:disabled{opacity:.5}.notice{max-width:1880px;margin:0 auto 12px;padding:12px 15px;border-radius:10px;font-weight:800}.notice.success{background:#eaf8f1;color:#23795a}.notice.error{background:#fff0f0;color:#a83c3c}.source-bar{max-width:1880px;margin:0 auto 12px;background:#fff;border:1px solid #dde2ec;border-radius:13px;padding:12px 14px;display:flex;align-items:end;gap:10px}.source-bar label{flex:1;font-size:12px;color:#697285;font-weight:800}.source-bar select{display:block;width:100%;height:42px;margin-top:5px;border:1px solid #d8dde7;border-radius:9px;padding:0 11px;background:#fff;font-weight:700}.source-bar button,.source-bar a{height:42px;border:1px solid #d8dde7;background:#fff;border-radius:9px;padding:0 15px;display:inline-flex;align-items:center;color:#3d4658;text-decoration:none;font-weight:800}.ai-health{max-width:1880px;margin:0 auto 12px;border:1px solid #dde2ec;border-radius:13px;padding:11px 14px;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px}.ai-health>div{display:flex;align-items:center;gap:10px}.ai-health small{display:block;color:#7b8392;font-weight:800}.ai-health strong{display:block;margin-top:2px;font-size:14px}.health-dot{width:11px;height:11px;border-radius:50%;background:#a0a7b4;box-shadow:0 0 0 4px rgba(160,167,180,.15)}.ai-health.ok{border-color:#a9d9c5;background:#f2fbf7}.ai-health.ok .health-dot{background:#35a874;box-shadow:0 0 0 4px rgba(53,168,116,.15)}.ai-health.fail{border-color:#efb4b4;background:#fff6f6}.ai-health.fail .health-dot{background:#df5151;box-shadow:0 0 0 4px rgba(223,81,81,.15)}.ai-health button{height:36px;border:1px solid #d7dce7;background:#fff;border-radius:9px;padding:0 13px;font-weight:900}.ai-health button:disabled{opacity:.55}.empty-panel{max-width:1880px;height:420px;margin:auto;background:#fff;border:1px solid #dde2ec;border-radius:14px;display:grid;place-items:center;color:#737c8d}.status-panel{max-width:1880px;margin:0 auto 12px;background:#fff;border:1px solid #dde2ec;border-radius:13px;padding:12px 15px;display:grid;grid-template-columns:minmax(260px,1.6fr) repeat(4,minmax(100px,.7fr));gap:10px;position:relative;overflow:hidden}.status-panel div{display:grid;gap:3px}.status-panel small{color:#7b8392}.status-panel strong{font-size:14px}.progress-wrap{position:absolute!important;left:0;right:0;bottom:0;height:4px;background:#e8ebf2}.progress-wrap span{display:block;height:100%;background:#5369df;transition:width .25s}.pipeline-bar{max-width:1880px;margin:0 auto 12px;background:#fff;border:1px solid #dde2ec;border-radius:13px;padding:10px;display:flex;gap:10px;align-items:center}.mode-buttons{display:flex;gap:6px}.mode-buttons button,.queue-button{height:40px;border:1px solid #d7dce7;background:#fff;border-radius:9px;padding:0 14px;font-weight:900}.mode-buttons button.active{background:#5369df;color:#fff;border-color:#5369df}.mode-buttons button.review.active{background:#d96a2f;border-color:#d96a2f}.mode-buttons button.registered.active{background:#288b63;border-color:#288b63}.mode-buttons button.pending.active{background:#b88319;border-color:#b88319}.mode-buttons button.failed.active{background:#9b4f5d;border-color:#9b4f5d}.status-tabs{flex-wrap:wrap}.pipeline-counts{display:flex;gap:12px;margin-left:auto;color:#586174}.queue-button{background:#283247;color:#fff;border-color:#283247}.pending-toolbar{max-width:1880px;margin:0 auto 12px;background:#fff8e8;border:1px solid #e6c778;border-radius:13px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:18px}.pending-toolbar div{display:grid;gap:4px}.pending-toolbar strong{font-size:17px;color:#7d5510}.pending-toolbar span{font-size:13px;color:#746746}.pending-toolbar button{border:0;background:#a96f0d;color:#fff;border-radius:10px;padding:12px 18px;font-weight:900;white-space:nowrap}.pending-toolbar button:disabled{opacity:.55}.all-crops-grid{max-width:1880px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}.all-crops-grid.review-large-grid{grid-template-columns:repeat(3,440px);gap:16px;justify-content:start;overflow-x:auto;padding-bottom:10px}.review-large-grid .crop-card{width:440px;min-width:440px;max-width:440px;min-height:590px;padding:14px;grid-template-rows:1fr auto}.review-large-grid .card-open{grid-template-rows:360px auto auto auto;gap:10px}.review-large-grid .crop-thumb{height:360px;min-height:360px;max-height:360px;background:#fff}.review-large-grid .crop-thumb img{max-height:none;width:100%;object-fit:contain}.review-large-grid .crop-card-head strong{font-size:22px}.review-large-grid .crop-card-head span{font-size:15px}.review-large-grid .crop-card small{font-size:15px;line-height:1.5}.review-large-grid .review-reason{font-size:14px!important;padding:11px}.review-large-grid .review-card-actions button{min-height:48px;font-size:16px}.crop-card{min-height:260px;text-align:left;border:1px solid #dce1ea;border-radius:12px;background:#fff;padding:10px;display:grid;gap:8px;overflow:hidden}.card-open{border:0;background:transparent;padding:0;text-align:left;display:grid;grid-template-rows:170px auto auto auto;gap:8px;cursor:pointer;width:100%}.crop-thumb{display:grid;place-items:center;overflow:auto;background:#f7f8fb;border:1px solid #e2e6ee;border-radius:9px}.crop-thumb img{display:block;max-width:100%;max-height:100%;object-fit:contain}.crop-thumb span{color:#7b8392;font-size:12px}.crop-card-head{display:flex;justify-content:space-between;align-items:center}.crop-card span{font-size:12px;font-weight:900}.crop-card.auto{border-left:5px solid #c8942f}.crop-card.registered-card{border-left:5px solid #42a57a}.crop-card.hold{border-left:5px solid #e07b43}.crop-card.failed-card{border-left:5px solid #9b4f5d}.crop-card small{color:#6d7686}.review-reason{display:block;color:#a65332!important;background:#fff4ed;border-radius:7px;padding:7px;line-height:1.4}.review-card-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding-top:8px;border-top:1px solid #edf0f4}.review-card-actions button{min-height:34px;border:1px solid #d7dce7;background:#fff;border-radius:8px;font-weight:800;cursor:pointer}.review-card-actions .register-now{background:#283247;border-color:#283247;color:#fff}.review-card-actions .exclude{color:#a34444}.review-card-actions.single-action{grid-template-columns:1fr}.pending-actions{margin-top:auto}.pending-actions .register-now{min-height:42px}.all-empty{grid-column:1/-1;background:#fff;border:1px solid #dde2ec;border-radius:12px;padding:50px;text-align:center}.quick-adjust{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.quick-adjust button{height:34px;border:1px solid #d7dce7;background:#fff;border-radius:8px;font-weight:800;font-size:12px}.workspace-grid{max-width:1880px;margin:auto;display:grid;grid-template-columns:205px minmax(650px,1fr) 390px;gap:14px;align-items:start}.question-list,.pdf-panel,.review-panel{background:#fff;border:1px solid #dde2ec;border-radius:14px}.question-list,.review-panel{position:sticky;top:10px;max-height:calc(100vh - 20px);overflow:auto}.question-list{padding:14px}.panel-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.panel-title h2{font-size:17px;margin:0}.panel-title span{font-size:12px;color:#7b8392}.number-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.number-grid button{height:37px;border:1px solid #d9dee8;border-radius:8px;background:#fff;font-weight:900;cursor:pointer}.number-grid button.cropped{background:#eaf8f1;border-color:#a8d7c4;color:#267b5d}.number-grid button.active{background:#5369df;border-color:#5369df;color:#fff}.legend{display:grid;gap:7px;margin-top:14px;color:#747d8d;font-size:12px}.legend span{display:flex;align-items:center;gap:7px}.legend i{width:10px;height:10px;border-radius:50%}.done-dot{background:#62b391}.active-dot{background:#5369df}.pdf-panel{overflow:hidden}.pdf-toolbar{min-height:54px;border-bottom:1px solid #e4e8ef;padding:8px 12px;display:flex;align-items:center;gap:8px}.pdf-toolbar button,.pdf-toolbar a{border:1px solid #d7dce7;background:#fff;border-radius:9px;padding:9px 12px;text-decoration:none;color:#414a5b;font-weight:800}.pdf-toolbar button:disabled{opacity:.45}.pdf-toolbar span{margin-left:auto;color:#5369df;font-weight:900}.canvas-shell{position:relative;width:min(100%,1050px);margin:12px auto;background:#fff;min-height:520px}.canvas-shell canvas{display:block;width:100%;height:auto}.loading{position:absolute;inset:0;display:grid;place-items:center;background:#fff;color:#737c8d;z-index:3}.overlay{position:absolute;inset:0;cursor:crosshair;touch-action:none}.crop-box{position:absolute;pointer-events:none;border:2px solid #e24444;background:rgba(226,68,68,.09)}.crop-box.selected b{position:absolute;left:-2px;top:-25px;background:#e24444;color:#fff;padding:3px 8px;border-radius:6px 6px 0 0}.crop-box.draft{border-color:#5369df;border-style:dashed;background:rgba(83,105,223,.08)}.review-panel{padding:14px}.review-sticky-head{display:flex;justify-content:space-between;align-items:center;padding-bottom:11px;border-bottom:1px solid #e6e9ef}.review-sticky-head small{color:#7b8392}.review-sticky-head h2{margin:2px 0 0;font-size:24px}.question-nav{display:flex;gap:6px}.question-nav button{width:38px;height:36px;border:1px solid #d7dce7;background:#fff;border-radius:8px;font-weight:900}.preview-card{padding:13px 0;border-bottom:1px solid #e6e9ef}.preview-title{display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px}.preview-title span{color:#748092}.preview-image{min-height:190px;max-height:360px;overflow:auto;border:1px dashed #cbd2de;border-radius:10px;background:#fafbfd;display:grid;place-items:center;color:#7a8392}.preview-image img{display:block;max-width:100%}.crop-actions{display:grid;grid-template-columns:1fr auto;gap:7px;margin-top:8px}.crop-actions button{height:40px;border:1px solid #d7dce7;background:#fff;border-radius:9px;font-weight:900}.crop-actions .crop-save{background:#283247;border-color:#283247;color:#fff}.analysis-form{padding-top:13px;display:grid;gap:10px}.form-head{display:flex;justify-content:space-between;align-items:center}.form-head button{border:1px solid #d7dce7;background:#fff;border-radius:8px;padding:8px 10px;font-weight:800}.analysis-form label{display:grid;gap:5px;font-size:12px;color:#687184;font-weight:800}.analysis-form input,.analysis-form select,.analysis-form textarea{width:100%;border:1px solid #d6dce7;border-radius:8px;background:#fff;padding:10px;color:#252b37;font:inherit}.analysis-form textarea{resize:vertical}.two-columns{display:grid;grid-template-columns:1fr 1fr;gap:8px}.confidence-row{display:flex;justify-content:space-between;padding:10px 12px;background:#f6f7fa;border-radius:8px;color:#646d7d}.analysis-save{height:44px;border:0;border-radius:9px;background:#5369df;color:#fff;font-weight:900}.analysis-save:disabled{opacity:.5}.no-question{min-height:400px;display:grid;place-items:center;text-align:center;color:#737c8c;padding:20px}.ai-working-overlay{position:fixed;inset:0;z-index:9999;background:rgba(18,24,38,.62);backdrop-filter:blur(3px);display:grid;place-items:center;padding:24px}.ai-working-card{width:min(620px,92vw);background:#fff;border-radius:24px;padding:36px 42px;text-align:center;box-shadow:0 28px 80px rgba(0,0,0,.28)}.ai-working-card h2{margin:18px 0 8px;font-size:28px}.ai-working-card p{margin:0 0 24px;color:#6c7484;font-size:16px}.ai-orbit{width:86px;height:86px;margin:auto;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#5369df,#7c8df0,#5369df);animation:ai-spin 1.2s linear infinite}.ai-orbit:before{content:"";position:absolute;width:68px;height:68px;border-radius:50%;background:#fff}.ai-orbit span{position:relative;z-index:1;font-size:22px;font-weight:1000;color:#5369df;animation:ai-spin-reverse 1.2s linear infinite}.ai-progress-label{display:flex;justify-content:center;align-items:baseline;gap:9px;margin-bottom:10px}.ai-progress-label b{font-size:28px;color:#283247}.ai-progress-label span{color:#747d8d}.ai-progress-track{height:14px;border-radius:999px;background:#e8ebf3;overflow:hidden}.ai-progress-track i{display:block;height:100%;background:linear-gradient(90deg,#5369df,#8b9af2);transition:width .25s}.ai-working-card small{display:block;margin-top:13px;color:#6d7686}.ai-pulse-row{display:flex;justify-content:center;gap:9px}.ai-pulse-row i{width:12px;height:12px;border-radius:50%;background:#5369df;animation:ai-pulse .9s infinite alternate}.ai-pulse-row i:nth-child(2){animation-delay:.2s}.ai-pulse-row i:nth-child(3){animation-delay:.4s}@keyframes ai-spin{to{transform:rotate(360deg)}}@keyframes ai-spin-reverse{to{transform:rotate(-360deg)}}@keyframes ai-pulse{to{transform:translateY(-9px);opacity:.35}}@media(max-width:1450px){.workspace-grid{grid-template-columns:185px minmax(580px,1fr) 350px}.page-header h1{font-size:27px}}@media(max-width:1150px){.workspace-grid{grid-template-columns:180px minmax(0,1fr)}.review-panel{grid-column:1/-1;position:static;max-height:none}.status-panel{grid-template-columns:1fr 1fr 1fr}.question-list{position:sticky}.preview-image{max-height:500px}}@media(max-width:760px){.pending-toolbar{align-items:stretch;flex-direction:column}.pending-toolbar button{width:100%}.all-crops-grid.review-large-grid{grid-template-columns:repeat(3,440px)}.review-large-grid .card-open{grid-template-rows:360px auto auto auto}.analysis-page{padding:9px}.page-header{align-items:flex-start;flex-direction:column}.header-actions{width:100%;justify-content:space-between}.source-bar{align-items:stretch;flex-direction:column}.source-bar button,.source-bar a{justify-content:center}.status-panel{grid-template-columns:1fr 1fr}.workspace-grid{grid-template-columns:1fr}.question-list{position:static;max-height:none}.number-grid{grid-template-columns:repeat(8,1fr)}.pdf-toolbar{flex-wrap:wrap}.pdf-toolbar span{width:100%;margin-left:0}.review-panel{grid-column:auto}.canvas-shell{min-height:360px}}
      `}</style>
    </main>
  );
}
