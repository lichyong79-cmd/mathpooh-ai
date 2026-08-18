/**
 * 문항 이미지(크롭)에 인쇄된 "원본 문항번호"의 실제 위치를 픽셀로 찾아낸다.
 *
 * 기존 방식의 문제
 *   - CSS 에 left 4.2% / top 7.5% / height 7.2% 같은 고정 비율을 박아 두었다.
 *   - 크롭 이미지의 가로·세로 비율은 문항마다 완전히 다르다.
 *     짧은 문항은 300px, 그림이 있는 문항은 1200px 높이가 나온다.
 *   - 그래서 (1) 로고가 번호와 다른 자리에 뜨고(로고 따로·번호 따로),
 *     (2) 세로로 긴 문항에서는 7.2%가 커져 본문 첫 줄까지 덮었다.
 *
 * 새 방식
 *   - 이미지의 잉크 픽셀을 직접 읽어 "첫 번째 글자 줄"을 찾고,
 *     그 줄에서 맨 왼쪽 토큰("13." "[7]" "24)")의 좌우 끝을 잡는다.
 *   - 토큰 폭은 항상 "그 줄의 높이"에 비례한 상한 안으로 강제된다.
 *     → 본문을 덮는 사고가 구조적으로 일어날 수 없다.
 *   - 좌표는 이미지 크기 대비 % 이므로 화면 크기가 바뀌어도 그대로 맞는다.
 */

export type NumberMaskBox = {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  /** measured = 픽셀 실측 / estimated = 실측 불가 시 보수적 추정 */
  source: "measured" | "estimated";
};

/** 분석용 캔버스 최대 폭. 좌표를 %로 내보내므로 축소해도 결과는 같다. */
const ANALYSIS_MAX_WIDTH = 960;

/** 문항번호를 찾을 영역: 위쪽 45%, 왼쪽 25% 안 */
const SEARCH_TOP_RATIO = 0.45;
const MAX_NUMBER_LEFT_RATIO = 0.25;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * problem_code(`<시험지 UUID>-013`)에서 원본 문항번호를 뽑는다.
 * 자릿수를 알면 마스크 폭의 상·하한을 훨씬 좁게 잡을 수 있다.
 */
export function parseOriginalQuestionNo(code?: string | null): number | null {
  if (!code) return null;
  const tail = String(code).trim().split("-").pop();
  if (!tail || !/^\d{1,3}$/.test(tail)) return null;
  const value = Number(tail);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function toBox(
  left: number,
  top: number,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number,
  source: NumberMaskBox["source"],
): NumberMaskBox {
  const l = clamp(left, 0, canvasWidth - 1);
  const t = clamp(top, 0, canvasHeight - 1);
  const w = clamp(width, 1, canvasWidth - l);
  const h = clamp(height, 1, canvasHeight - t);
  return {
    leftPct: (l / canvasWidth) * 100,
    topPct: (t / canvasHeight) * 100,
    widthPct: (w / canvasWidth) * 100,
    heightPct: (h / canvasHeight) * 100,
    source,
  };
}

/**
 * 픽셀을 읽을 수 없을 때(다른 도메인 이미지 등) 쓰는 보수적 추정값.
 * 기준을 이미지 "높이"가 아니라 "폭"으로 잡는 것이 핵심이다.
 * 크롭 폭은 항상 한 단(段)의 폭이라 글자 크기에 비례하지만,
 * 크롭 높이는 문항 길이에 따라 서너 배씩 달라지기 때문이다.
 */
export function estimateNumberBox(
  naturalWidth: number,
  naturalHeight: number,
  originalNo?: number | null,
): NumberMaskBox {
  const w = Math.max(1, naturalWidth);
  const h = Math.max(1, naturalHeight);
  const digits = originalNo ? String(originalNo).length : 2;
  const lineHeight = clamp(w * 0.038, 10, h * 0.18);
  const boxWidth = Math.min(lineHeight * (0.45 * digits + 0.42), w * 0.16);
  const boxHeight = Math.min(lineHeight * 1.14, h * 0.22);
  const left = Math.min(w * 0.01, 6);
  const top = Math.min(h * 0.01, 6);
  return toBox(left, top, boxWidth, boxHeight, w, h, "estimated");
}

type InkMask = { mask: Uint8Array; width: number; height: number };

/** 밝기 임계값을 자동으로 낮춰가며 잉크 마스크를 만든다. */
function buildInkMask(data: Uint8ClampedArray, width: number, height: number): InkMask | null {
  const total = width * height;
  const luminance = new Uint8Array(total);

  for (let i = 0; i < total; i += 1) {
    const p = i * 4;
    const alpha = data[p + 3];
    if (alpha < 24) {
      luminance[i] = 255;
      continue;
    }
    const value = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    luminance[i] =
      alpha >= 250 ? value : Math.round(value * (alpha / 255) + 255 * (1 - alpha / 255));
  }

  for (const threshold of [205, 170, 130, 96]) {
    let ink = 0;
    for (let i = 0; i < total; i += 1) if (luminance[i] < threshold) ink += 1;
    const ratio = ink / total;
    // 글자 위주의 시험지 크롭은 보통 잉크 비율이 1~20% 사이다.
    if (ratio > 0.004 && ratio < 0.45) {
      const mask = new Uint8Array(total);
      for (let i = 0; i < total; i += 1) mask[i] = luminance[i] < threshold ? 1 : 0;
      return { mask, width, height };
    }
  }
  return null;
}

type LineBand = { top: number; bottom: number };

/** 위에서부터 글자 줄 밴드를 만든다(작은 세로 공백은 같은 줄로 묶음). */
function collectLineBands(
  ink: InkMask,
  scanBottom: number,
  minRowInk: number,
  gapTolerance: number,
): LineBand[] {
  const bands: LineBand[] = [];
  let start = -1;
  let blank = 0;

  for (let y = 0; y <= scanBottom; y += 1) {
    const base = y * ink.width;
    let count = 0;
    for (let x = 0; x < ink.width; x += 1) {
      if (ink.mask[base + x]) {
        count += 1;
        if (count >= minRowInk) break;
      }
    }

    if (count >= minRowInk) {
      if (start < 0) start = y;
      blank = 0;
    } else if (start >= 0) {
      blank += 1;
      if (blank > gapTolerance) {
        bands.push({ top: start, bottom: y - blank });
        start = -1;
        blank = 0;
        if (bands.length >= 6) break;
      }
    }
  }
  if (start >= 0) bands.push({ top: start, bottom: scanBottom });
  return bands;
}

/**
 * 한 줄 안에서 맨 왼쪽 토큰(= 문항번호)의 좌표와 폭을 구한다.
 *
 * 어절 사이 공백은 글자 사이 공백보다 확실히 넓다는 점을 이용한다.
 * 고정 임계값 대신 "그 줄 앞부분에서 가장 넓은 공백"을 기준으로 삼아
 * 글꼴·크기가 달라져도 번호 뒤 첫 공백을 정확히 찾는다.
 */
function findLeadingToken(ink: InkMask, band: LineBand, digits: number | null) {
  const bandHeight = band.bottom - band.top + 1;
  const scanRight = Math.min(ink.width - 1, Math.round(bandHeight * 3.2));
  const columnInk = new Uint16Array(scanRight + 1);

  for (let y = band.top; y <= band.bottom; y += 1) {
    const base = y * ink.width;
    for (let x = 0; x <= scanRight; x += 1) {
      if (ink.mask[base + x]) columnInk[x] += 1;
    }
  }

  let left = -1;
  for (let x = 0; x <= scanRight; x += 1) {
    if (columnInk[x] > 0) {
      left = x;
      break;
    }
  }
  if (left < 0) return null;

  // 잉크가 끊긴 구간(빈칸) 목록
  const runs: { start: number; length: number }[] = [];
  let blankStart = -1;
  for (let x = left; x <= scanRight; x += 1) {
    if (columnInk[x] > 0) {
      if (blankStart >= 0) {
        runs.push({ start: blankStart, length: x - blankStart });
        blankStart = -1;
      }
    } else if (blankStart < 0) {
      blankStart = x;
    }
  }
  if (blankStart >= 0) runs.push({ start: blankStart, length: scanRight + 1 - blankStart });

  const minSpace = Math.max(3, Math.round(bandHeight * 0.13));
  let maxRun = 0;
  for (const run of runs) if (run.length > maxRun) maxRun = run.length;

  let width: number | null = null;
  if (maxRun >= minSpace) {
    const threshold = Math.max(minSpace, Math.round(maxRun * 0.7));
    for (const run of runs) {
      if (run.length >= threshold) {
        width = run.start - left;
        break;
      }
    }
  }
  if (width === null || width <= 0) width = Math.round(bandHeight * 1.6);

  // 자릿수를 알면 상·하한을 좁게, 모르면 넉넉하게 잡는다.
  const minWidth = digits
    ? Math.round(bandHeight * (0.34 * digits + 0.1))
    : Math.round(bandHeight * 0.5);
  const maxWidth = digits
    ? Math.round(bandHeight * (0.62 * digits + 0.62))
    : Math.round(bandHeight * 2.6);

  return { left, width: Math.round(clamp(width, minWidth, maxWidth)) };
}

/**
 * 이미지에서 문항번호 상자를 실측한다. 실패하면 null.
 * (호출부에서 estimateNumberBox 로 대체한다)
 */
export function measureNumberBox(
  source: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
  originalNo?: number | null,
): NumberMaskBox | null {
  if (typeof document === "undefined") return null;
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight)) return null;
  if (naturalWidth < 24 || naturalHeight < 24) return null;

  const scale = Math.min(1, ANALYSIS_MAX_WIDTH / naturalWidth);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  try {
    context.drawImage(source, 0, 0, width, height);
  } catch {
    return null;
  }

  let data: Uint8ClampedArray;
  try {
    data = context.getImageData(0, 0, width, height).data;
  } catch {
    // 다른 도메인 이미지라 캔버스가 오염된 경우
    return null;
  }

  const ink = buildInkMask(data, width, height);
  if (!ink) return null;

  const digits = originalNo ? String(originalNo).length : null;
  const scanBottom = Math.min(height - 1, Math.max(8, Math.round(height * SEARCH_TOP_RATIO)));
  const minRowInk = Math.max(2, Math.round(width * 0.0035));
  const gapTolerance = Math.max(2, Math.round(width * 0.0045));
  // 이보다 얇으면 표 괘선·머리말 선으로 보고 건너뛴다.
  const minTextHeight = Math.max(6, Math.round(width * 0.014));
  // 이보다 두꺼우면 줄이 서로 붙은 것이므로 실측을 포기한다.
  const maxTextHeight = Math.max(minTextHeight + 1, Math.round(width * 0.09));

  for (const band of collectLineBands(ink, scanBottom, minRowInk, gapTolerance)) {
    const bandHeight = band.bottom - band.top + 1;
    if (bandHeight < minTextHeight) continue;
    if (bandHeight > maxTextHeight) return null;
    if (band.top > height * SEARCH_TOP_RATIO) return null;

    const token = findLeadingToken(ink, band, digits);
    if (!token) continue;
    if (token.left > width * MAX_NUMBER_LEFT_RATIO) return null;

    const pad = Math.max(1, Math.round(bandHeight * 0.12));
    return toBox(
      token.left - pad,
      band.top - pad,
      token.width + pad * 2,
      bandHeight + pad * 2,
      width,
      height,
      "measured",
    );
  }

  return null;
}
