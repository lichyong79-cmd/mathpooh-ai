/**
 * PDF 텍스트 레이어에서 "문항번호의 실제 인쇄 좌표"를 직접 읽어내는 모듈.
 *
 * 기존 방식: AI(비전 모델)에게 0~100% bounding box를 물어봄 → 좌표가 매번 흔들림
 * 새 방식  : PDF 안에 이미 들어있는 글자 좌표를 그대로 사용 → 오차 0, 비용 0
 *
 * 이 모듈은 좌표만 만든다. 렌더링/트리밍은 화면 쪽에서 한다.
 */

export type ColumnBand = {
  /** 0~100 % */
  left: number;
  right: number;
};

export type QuestionAnchor = {
  questionNo: number;
  page: number;
  column: number;
  /** 문항번호 글자 맨 위 (0~100 %) */
  topPct: number;
  /** 이 문항이 차지할 수 있는 최대 하단 (0~100 %) */
  bottomPct: number;
  /** 같은 단 다음 문항번호 줄의 top. 없으면 null (단의 마지막 문항) */
  nextTopPct: number | null;
  columnLeftPct: number;
  columnRightPct: number;
  /** 단 끝까지 내려간 문항(= 다음 단/다음 쪽으로 이어질 수 있음) → 검수 표시용 */
  spansColumnEnd: boolean;
};

export type PageAnchors = {
  page: number;
  hasTextLayer: boolean;
  columns: ColumnBand[];
  anchors: QuestionAnchor[];
};

export type DocumentAnchors = {
  hasTextLayer: boolean;
  pages: Map<number, PageAnchors>;
  byQuestionNo: Map<number, QuestionAnchor>;
};

type RawItem = {
  text: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  fontHeight: number;
};

type Line = {
  text: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  fontHeight: number;
};

/** 문항번호로 인정할 패턴: 1.  11.  [3]  7)  01. */
const QUESTION_NUMBER = /^\s*\[?\s*(\d{1,3})\s*[.．)\]]/;

/** pdf.js Util.transform 과 동일 (외부 의존 없이 직접 구현) */
function multiply(m: number[], t: number[]) {
  return [
    m[0] * t[0] + m[2] * t[1],
    m[1] * t[0] + m[3] * t[1],
    m[0] * t[2] + m[2] * t[3],
    m[1] * t[2] + m[3] * t[3],
    m[0] * t[4] + m[2] * t[5] + m[4],
    m[1] * t[4] + m[3] * t[5] + m[5],
  ];
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** 페이지의 모든 글자를 화면 좌표(y가 아래로 증가)로 변환해서 읽는다. */
async function readItems(page: any): Promise<{ items: RawItem[]; width: number; height: number }> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: RawItem[] = [];

  for (const raw of content.items as any[]) {
    const text = String(raw?.str ?? "");
    if (!text.trim()) continue;
    const source = raw.transform as number[] | undefined;
    if (!source || source.length < 6) continue;

    const t = multiply(viewport.transform as number[], source);
    const fontHeight = Math.abs(Math.hypot(t[2], t[3])) || Number(raw.height) || 10;
    const width = Number(raw.width ?? 0);
    const baselineX = t[4];
    const baselineY = t[5];

    items.push({
      text,
      left: baselineX,
      right: baselineX + width,
      // baseline 기준 위로 ascent, 아래로 descent 만큼을 글자 상자로 본다.
      top: baselineY - fontHeight * 0.86,
      bottom: baselineY + fontHeight * 0.24,
      fontHeight,
    });
  }

  return { items, width: viewport.width, height: viewport.height };
}

/**
 * 단(column) 자동 감지.
 * 머리말/꼬리말을 뺀 본문 영역에서 세로로 계속 비어있는 띠를 찾는다.
 * 50% 고정값을 쓰지 않으므로 좌우 여백이 다른 교재에서도 정확하다.
 */
function detectColumns(items: RawItem[], pageWidth: number, pageHeight: number): ColumnBand[] {
  const body = items.filter(
    (item) => item.top > pageHeight * 0.06 && item.bottom < pageHeight * 0.94,
  );
  if (body.length < 12) return [{ left: 0, right: 100 }];

  const buckets = new Uint32Array(200); // 0.5% 단위
  for (const item of body) {
    const from = Math.max(0, Math.floor((item.left / pageWidth) * 200));
    const to = Math.min(199, Math.ceil((item.right / pageWidth) * 200));
    for (let i = from; i <= to; i += 1) buckets[i] += 1;
  }

  let best: { start: number; end: number } | null = null;
  let run = -1;
  for (let i = 60; i <= 140; i += 1) {
    // 60~140 = 페이지 폭의 30~70%
    if (buckets[i] === 0) {
      if (run < 0) run = i;
    } else {
      if (run >= 0) {
        const band = { start: run, end: i - 1 };
        if (!best || band.end - band.start > best.end - best.start) best = band;
        run = -1;
      }
    }
  }
  if (run >= 0) {
    const band = { start: run, end: 140 };
    if (!best || band.end - band.start > best.end - best.start) best = band;
  }

  // SOS321: 완전히 빈 띠만 찾으면 단 구분에 실패하는 시험지가 있다.
  // 상단 제목이나 가로 구분선이 페이지 가운데를 가로지르면 그 열의 카운트가 0이 아니게 되어
  // "빈 띠 없음 → 1단"으로 판정되고, 그러면 좌우 단이 뒤섞여 문항번호가 1→3→2→4로 어긋난다.
  //
  // 본문 대부분이 비어 있으면 단 구분으로 본다. 소수의 전폭 요소는 무시한다.
  if (!best || best.end - best.start + 1 < 3) {
    const rowCount = body.length;
    const sparse = Math.max(1, Math.floor(rowCount * 0.06));   // 6% 이하만 걸치면 빈 띠로 취급
    let bestSparse: { start: number; end: number } | null = null;
    let runSparse = -1;
    for (let i = 60; i <= 140; i += 1) {
      if (buckets[i] <= sparse) {
        if (runSparse < 0) runSparse = i;
      } else if (runSparse >= 0) {
        const band = { start: runSparse, end: i - 1 };
        if (!bestSparse || band.end - band.start > bestSparse.end - bestSparse.start) bestSparse = band;
        runSparse = -1;
      }
    }
    if (runSparse >= 0) {
      const band = { start: runSparse, end: 140 };
      if (!bestSparse || band.end - band.start > bestSparse.end - bestSparse.start) bestSparse = band;
    }
    if (!bestSparse || bestSparse.end - bestSparse.start + 1 < 3) return [{ left: 0, right: 100 }];
    best = bestSparse;
  }

  const gutterCenter = ((best.start + best.end + 1) / 2) / 2; // 0~100 %
  return [
    { left: 0, right: gutterCenter },
    { left: gutterCenter, right: 100 },
  ];
}

/**
 * SOS321 · 단 구분 검증.
 *
 * 후보 배치(감지된 것, 1단, 가운데 2단)를 각각 적용해 보고
 * "쪽 → 단 → 위에서 아래" 순서로 읽었을 때 문항번호가 가장 잘 증가하는 배치를 고른다.
 * 시험지 번호는 항상 그 순서로 붙으므로 신뢰할 수 있는 기준이다.
 */
function columnOrderScore(items: RawItem[], width: number, bands: ColumnBand[]) {
  const numbers: Array<{ column: number; top: number; no: number }> = [];
  for (let c = 0; c < bands.length; c += 1) {
    const leftPx = (bands[c].left / 100) * width;
    const rightPx = (bands[c].right / 100) * width;
    const inBand = items.filter((item) => {
      const center = (item.left + item.right) / 2;
      return center >= leftPx && center < rightPx;
    });
    for (const line of buildLines(inBand)) {
      const match = /^\s*(\d{1,3})\s*[.,]/.exec(line.text);
      if (!match) continue;
      const no = Number(match[1]);
      if (!Number.isFinite(no) || no < 1 || no > 200) continue;
      numbers.push({ column: c, top: line.top, no });
    }
  }
  if (numbers.length < 2) return 0;
  numbers.sort((a, b) => a.column - b.column || a.top - b.top);

  // 읽는 순서대로 번호가 커지는 최장 구간의 길이
  const seq = numbers.map((x) => x.no);
  const best = new Array(seq.length).fill(1);
  let top = 1;
  for (let i = 1; i < seq.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (seq[j] < seq[i] && best[j] + 1 > best[i]) best[i] = best[j] + 1;
    }
    if (best[i] > top) top = best[i];
  }
  return top / seq.length;   // 0~1. 1이면 완전히 순서대로
}

function pickBetterColumns(
  items: RawItem[],
  width: number,
  height: number,
  detected: ColumnBand[],
): ColumnBand[] {
  const candidates: ColumnBand[][] = [detected];
  if (detected.length === 1) {
    candidates.push([{ left: 0, right: 50 }, { left: 50, right: 100 }]);
  } else {
    candidates.push([{ left: 0, right: 100 }]);
  }

  let bestBands = detected;
  let bestScore = -1;
  for (const bands of candidates) {
    const score = columnOrderScore(items, width, bands);
    // 동점이면 먼저 온 후보(감지 결과)를 유지한다.
    if (score > bestScore + 0.001) {
      bestScore = score;
      bestBands = bands;
    }
  }
  return bestBands;
}

/** 같은 줄에 있는 글자 조각들을 한 줄로 합친다. ("11" + "." 처럼 쪼개져도 인식되게) */
function buildLines(items: RawItem[]): Line[] {
  if (!items.length) return [];
  const unit = median(items.map((item) => item.fontHeight)) || 10;
  const sorted = [...items].sort((a, b) => a.top - b.top || a.left - b.left);

  const lines: Line[] = [];
  let bucket: RawItem[] = [sorted[0]];

  const flush = () => {
    if (!bucket.length) return;
    const ordered = [...bucket].sort((a, b) => a.left - b.left);
    lines.push({
      text: ordered.map((item) => item.text).join(""),
      left: Math.min(...ordered.map((item) => item.left)),
      right: Math.max(...ordered.map((item) => item.right)),
      top: Math.min(...ordered.map((item) => item.top)),
      bottom: Math.max(...ordered.map((item) => item.bottom)),
      fontHeight: median(ordered.map((item) => item.fontHeight)),
    });
    bucket = [];
  };

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = bucket[bucket.length - 1];
    if (Math.abs(sorted[i].top - previous.top) <= unit * 0.55) {
      bucket.push(sorted[i]);
    } else {
      flush();
      bucket = [sorted[i]];
    }
  }
  flush();

  return lines.sort((a, b) => a.top - b.top);
}

/**
 * 줄 병합 전에 원본 텍스트 조각에서 문항번호만 찾는다.
 *
 * 수식 페이지는 위·아래첨자와 분수 조각의 top 값이 사다리처럼 이어져
 * buildLines()가 페이지 전체를 한 줄로 합칠 수 있다. 문항번호 검출에는 그 줄을
 * 사용하지 않고, 하나의 원본 조각 또는 바로 오른쪽의 짧은 조각까지만 결합한다.
 */
function findQuestionNumberFragments(items: RawItem[]): Line[] {
  const ordered = [...items].sort((a, b) => a.top - b.top || a.left - b.left);
  const found: Line[] = [];

  for (const seed of ordered) {
    const seedText = seed.text.trim();
    const seedCanStart = QUESTION_NUMBER.test(seedText) || /^\[?\s*\d{1,3}\s*$/.test(seedText);
    if (!seedCanStart) continue;

    let text = seed.text;
    let right = seed.right;
    let top = seed.top;
    let bottom = seed.bottom;
    const heights = [seed.fontHeight];
    const used = new Set<RawItem>([seed]);

    for (let part = 0; part < 3 && !QUESTION_NUMBER.test(text); part += 1) {
      const centerY = (top + bottom) / 2;
      const next = ordered
        .filter((item) => !used.has(item) && item.left >= right - seed.fontHeight * 0.15)
        .filter((item) => item.left - right <= seed.fontHeight * 1.15)
        .filter((item) => {
          const itemCenterY = (item.top + item.bottom) / 2;
          return Math.abs(itemCenterY - centerY) <= Math.max(seed.fontHeight, item.fontHeight) * 0.35;
        })
        .sort((a, b) => a.left - b.left)[0];

      if (!next) break;
      used.add(next);
      text += next.text;
      right = Math.max(right, next.right);
      top = Math.min(top, next.top);
      bottom = Math.max(bottom, next.bottom);
      heights.push(next.fontHeight);
    }

    if (!QUESTION_NUMBER.test(text)) continue;
    found.push({
      text,
      left: seed.left,
      right,
      top,
      bottom,
      fontHeight: median(heights),
    });
  }

  return found;
}

type Candidate = {
  questionNo: number;
  page: number;
  column: number;
  top: number;
  left: number;
  width: number;
};

/**
 * 반복되는 꼬리말(출판사 슬로건, 쪽번호 줄)의 상단 y를 찾는다.
 * 여러 쪽에 같은 문구가 같은 높이로 반복되면 꼬리말로 본다.
 */
function detectFooterTop(pageLines: Array<{ lines: Line[]; height: number }>): number {
  if (pageLines.length < 3) return 0.965;
  const counts = new Map<string, { pages: Set<number>; topPct: number }>();

  pageLines.forEach(({ lines, height }, index) => {
    for (const line of lines) {
      const topPct = line.top / height;
      if (topPct < 0.88) continue;
      const key = line.text.replace(/\d+/g, "#").replace(/\s+/g, "").slice(0, 40);
      if (key.length < 3) continue;
      const entry = counts.get(key) ?? { pages: new Set<number>(), topPct: 1 };
      entry.pages.add(index);
      entry.topPct = Math.min(entry.topPct, topPct);
      counts.set(key, entry);
    }
  });

  let footerTop = 0.965;
  const threshold = Math.max(2, Math.floor(pageLines.length * 0.5));
  for (const entry of counts.values()) {
    if (entry.pages.size >= threshold) footerTop = Math.min(footerTop, entry.topPct - 0.004);
  }
  return Math.max(0.75, footerTop);
}

/**
 * 문서 전체에서 문항 앵커를 만든다.
 *
 * @param pdfDoc            pdfjs getDocument().promise 결과
 * @param expectedNumbers   AI가 찾은 문항번호 목록(있으면 오검출을 크게 줄여줌)
 */
export async function buildDocumentAnchors(
  pdfDoc: any,
  expectedNumbers?: Iterable<number>,
): Promise<DocumentAnchors> {
  const expected = expectedNumbers ? new Set([...expectedNumbers]) : null;
  const pages = new Map<number, PageAnchors>();
  const byQuestionNo = new Map<number, QuestionAnchor>();

  const perPage: Array<{
    page: number;
    lines: Line[];
    /** 줄 병합 전 원본 텍스트 조각. 문항번호 앵커는 반드시 여기서 찾는다. */
    columnItems: RawItem[][];
    /** 단별로 따로 묶은 줄. 2단 편집에서 좌우 단이 한 줄로 합쳐지는 것을 막는다. */
    columnLines: Line[][];
    columns: ColumnBand[];
    width: number;
    height: number;
  }> = [];

  for (let pageNo = 1; pageNo <= pdfDoc.numPages; pageNo += 1) {
    const page = await pdfDoc.getPage(pageNo);
    const { items, width, height } = await readItems(page);
    let columns = detectColumns(items, width, height);

    // SOS321: 단 구분이 맞았는지 문항번호 순서로 검증한다.
    // 시험지는 항상 쪽 → 단 → 위에서 아래 순서로 번호가 붙는다.
    // 그 순서대로 읽었을 때 번호가 커지지 않으면 단 구분이 틀린 것이다.
    // (1단으로 잘못 보면 좌우가 섞여 1 → 3 → 2 → 4 가 된다.)
    columns = pickBetterColumns(items, width, height, columns);

    const columnItems = columns.map((band) => {
      const leftPx = (band.left / 100) * width;
      const rightPx = (band.right / 100) * width;
      return items.filter((item) => {
        const center = (item.left + item.right) / 2;
        return center >= leftPx && center < rightPx;
      });
    });
    const columnLines = columnItems.map((column) => buildLines(column));
    perPage.push({
      page: pageNo,
      lines: columnLines.flat(),
      columnItems,
      columnLines,
      columns,
      width,
      height,
    });
  }

  const totalLines = perPage.reduce((sum, entry) => sum + entry.lines.length, 0);
  if (totalLines < perPage.length * 3) {
    // 텍스트 레이어가 사실상 없음 = 스캔 PDF → 기존 AI 좌표 경로를 그대로 쓴다.
    return { hasTextLayer: false, pages, byQuestionNo };
  }

  const footerTopRatio = detectFooterTop(
    perPage.map((entry) => ({ lines: entry.lines, height: entry.height })),
  );

  // 1) 후보 수집
  const candidates: Candidate[] = [];

  for (const entry of perPage) {
    const bodyFont = median(entry.columnItems.flat().map((item) => item.fontHeight)) || 10;

    for (const column of entry.columns.keys()) {
      const band = entry.columns[column];
      const bandLeftPx = (band.left / 100) * entry.width;
      const bandWidthPx = ((band.right - band.left) / 100) * entry.width;
      const numberFragments = findQuestionNumberFragments(entry.columnItems[column] ?? [])
        .sort((a, b) => a.top - b.top);

      for (const line of numberFragments) {
        const match = line.text.match(QUESTION_NUMBER);
        if (!match) continue;

        const questionNo = Number(match[1]);
        if (!Number.isFinite(questionNo) || questionNo < 1 || questionNo > 200) continue;
        if (expected && !expected.has(questionNo)) continue;

        // 문항번호는 단의 왼쪽 가장자리에서 시작한다. (본문 중간의 "3."은 여기서 걸러짐)
        if (line.left - bandLeftPx > bandWidthPx * (expected ? 0.22 : 0.14)) continue;
        // 쪽번호/제목처럼 본문과 크기가 크게 다른 줄은 제외
        if (line.fontHeight < bodyFont * (expected ? 0.5 : 0.75) || line.fontHeight > bodyFont * (expected ? 3 : 2.1)) continue;
        // 머리말/꼬리말 영역 제외
        const topRatio = line.top / entry.height;
        if (topRatio < 0.03 || topRatio > footerTopRatio) continue;

        candidates.push({
          questionNo,
          page: entry.page,
          column,
          top: line.top,
          left: line.left,
          width: entry.width,
        });
      }
    }
  }

  // 2) 읽는 순서(쪽 → 단 → 위에서 아래)로 정렬한 뒤,
  //    문항번호가 계속 커지는 가장 긴 흐름만 남긴다. (오검출 자동 제거)
  const sortReading = (list: Candidate[]) =>
    [...list].sort((a, b) => a.page - b.page || a.column - b.column || a.top - b.top);

  const firstPass = longestIncreasing(sortReading(candidates));

  // 3) 시험지의 문항번호는 항상 같은 x에 정렬되어 있다.
  //    1차 통과분의 대표 x에서 크게 벗어난 후보는 가짜 번호로 보고 버린다.
  // 기대 문항번호가 명확한 분석 화면에서는 각 문항의 실제 후보를 우선한다.
  // 수식 글꼴 차이로 문항번호 x좌표가 조금 흔들려도 정상 문항을 버리지 않는다.
  const aligned = expected ? candidates : alignByLeftMargin(candidates, firstPass);
  const kept = longestIncreasing(sortReading(aligned));

  // 3) 앵커 확정: 같은 쪽·같은 단의 다음 문항 시작점이 현재 문항의 하한선
  const grouped = new Map<string, Candidate[]>();
  for (const item of kept) {
    const key = `${item.page}:${item.column}`;
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  for (const entry of perPage) {
    const anchors: QuestionAnchor[] = [];

    for (const column of entry.columns.keys()) {
      const list = (grouped.get(`${entry.page}:${column}`) ?? []).sort((a, b) => a.top - b.top);
      const band = entry.columns[column];
      const columnBottomPct = footerTopRatio * 100;

      list.forEach((item, index) => {
        const next = list[index + 1];
        const isLast = !next;
        const topPct = (item.top / entry.height) * 100;
        const nextTopPct = next ? (next.top / entry.height) * 100 : null;
        const bottomPct = nextTopPct === null
          ? columnBottomPct
          : Math.max(topPct + 1, nextTopPct - 0.25);

        const anchor: QuestionAnchor = {
          questionNo: item.questionNo,
          page: entry.page,
          column,
          topPct,
          bottomPct,
          nextTopPct,
          columnLeftPct: band.left,
          columnRightPct: band.right,
          spansColumnEnd: isLast,
        };
        anchors.push(anchor);
        byQuestionNo.set(item.questionNo, anchor);
      });
    }

    pages.set(entry.page, {
      page: entry.page,
      hasTextLayer: true,
      columns: entry.columns,
      anchors,
    });
  }

  return { hasTextLayer: byQuestionNo.size > 0, pages, byQuestionNo };
}

/**
 * 시험지의 문항번호는 단마다 같은 x에 정렬되어 인쇄된다.
 * 1차로 살아남은 후보들의 대표 x를 구해, 거기서 크게 벗어난 후보를 버린다.
 * 수식 안의 "2)" 나 본문 중간의 "3." 같은 가짜 번호가 여기서 걸러진다.
 */
function alignByLeftMargin(all: Candidate[], trusted: Candidate[]): Candidate[] {
  if (trusted.length < 2) return all;

  const baseline = new Map<number, number>();
  for (const column of new Set(trusted.map((item) => item.column))) {
    const lefts = trusted.filter((item) => item.column === column).map((item) => item.left);
    if (lefts.length) baseline.set(column, median(lefts));
  }

  return all.filter((item) => {
    const base = baseline.get(item.column);
    if (base === undefined) return true;
    return Math.abs(item.left - base) <= item.width * 0.02;
  });
}

/** 문항번호가 순증가하는 가장 긴 부분수열만 남긴다. (본문 속 "2." 같은 오검출 제거) */
function longestIncreasing(items: Candidate[]): Candidate[] {
  if (items.length <= 1) return items;
  const length = new Array(items.length).fill(1);
  const previous = new Array(items.length).fill(-1);
  let bestIndex = 0;

  for (let i = 1; i < items.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (items[j].questionNo < items[i].questionNo && length[j] + 1 > length[i]) {
        length[i] = length[j] + 1;
        previous[i] = j;
      }
    }
    if (length[i] > length[bestIndex]) bestIndex = i;
  }

  const result: Candidate[] = [];
  for (let i = bestIndex; i >= 0; i = previous[i]) {
    result.push(items[i]);
    if (previous[i] < 0) break;
  }
  return result.reverse();
}
