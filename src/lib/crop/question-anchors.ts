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

/** 검출이 어긋났을 때 화면에서 바로 원인을 볼 수 있게 하는 진단 정보 */
export type AnchorDiagnostics = {
  pageCount: number;
  columnsPerPage: number[];
  /** 필터를 통과한 후보 개수 */
  candidateCount: number;
  /** 최종 확정된 문항번호 */
  detected: number[];
  /** 후보였다가 순서/정렬 검사에서 탈락한 번호 */
  rejected: number[];
};

export type DocumentAnchors = {
  hasTextLayer: boolean;
  pages: Map<number, PageAnchors>;
  byQuestionNo: Map<number, QuestionAnchor>;
  diagnostics: AnchorDiagnostics;
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

  // 빈 띠가 페이지 폭의 1.5% 이상이어야 진짜 단 구분으로 본다.
  if (!best || best.end - best.start + 1 < 3) return [{ left: 0, right: 100 }];

  const gutterCenter = ((best.start + best.end + 1) / 2) / 2; // 0~100 %
  return [
    { left: 0, right: gutterCenter },
    { left: gutterCenter, right: 100 },
  ];
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
/**
 * 같은 줄(기준선)에서 이 조각보다 왼쪽에 다른 글자가 있는지 본다.
 *
 * 시험지에서 문항번호는 항상 그 줄의 첫 글자다. 반대로 선택지의 숫자는
 * 앞에 ①②③ 같은 기호가 붙어 있어 결코 첫 글자가 될 수 없다.
 * 이 한 가지 규칙으로 선택지 숫자가 문항번호로 오인되는 것을 막는다.
 */
function hasNeighbourOnLeft(ordered: RawItem[], seed: RawItem): boolean {
  const seedCenter = (seed.top + seed.bottom) / 2;
  for (const other of ordered) {
    if (other === seed) continue;
    if (other.left >= seed.left) continue;
    // 겹쳐 있으면 같은 글자 조각으로 보고 넘어간다.
    if (other.right > seed.left + seed.fontHeight * 0.15) continue;
    const otherCenter = (other.top + other.bottom) / 2;
    const tolerance = Math.max(seed.fontHeight, other.fontHeight) * 0.45;
    if (Math.abs(otherCenter - seedCenter) <= tolerance) return true;
  }
  return false;
}

function findQuestionNumberFragments(items: RawItem[]): Line[] {
  const ordered = [...items].sort((a, b) => a.top - b.top || a.left - b.left);
  const found: Line[] = [];

  for (const seed of ordered) {
    const seedText = seed.text.trim();
    const seedCanStart = QUESTION_NUMBER.test(seedText) || /^\[?\s*\d{1,3}\s*$/.test(seedText);
    if (!seedCanStart) continue;

    // 문항번호는 그 줄에서 가장 왼쪽에 있는 글자다.
    // 선택지 "① 3" 의 "3", "② 74" 의 "74" 처럼 왼쪽에 기호가 있는 숫자는 여기서 걸러진다.
    if (hasNeighbourOnLeft(ordered, seed)) continue;

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
    const columns = detectColumns(items, width, height);
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

  const diagnostics: AnchorDiagnostics = {
    pageCount: perPage.length,
    columnsPerPage: perPage.map((entry) => entry.columns.length),
    candidateCount: 0,
    detected: [],
    rejected: [],
  };

  const totalLines = perPage.reduce((sum, entry) => sum + entry.lines.length, 0);
  if (totalLines < perPage.length * 3) {
    // 텍스트 레이어가 사실상 없음 = 스캔 PDF → 기존 AI 좌표 경로를 그대로 쓴다.
    return { hasTextLayer: false, pages, byQuestionNo, diagnostics };
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
        if (line.left - bandLeftPx > bandWidthPx * 0.14) continue;
        // 쪽번호/제목처럼 본문과 크기가 크게 다른 줄은 제외
        if (line.fontHeight < bodyFont * 0.75 || line.fontHeight > bodyFont * 2.1) continue;
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
  const aligned = alignByLeftMargin(candidates, firstPass);
  const kept = longestIncreasing(sortReading(aligned));

  diagnostics.candidateCount = candidates.length;
  diagnostics.detected = kept.map((item) => item.questionNo);
  const keptSet = new Set(kept);
  diagnostics.rejected = [
    ...new Set(candidates.filter((item) => !keptSet.has(item)).map((item) => item.questionNo)),
  ].sort((a, b) => a - b);

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

  return { hasTextLayer: byQuestionNo.size > 0, pages, byQuestionNo, diagnostics };
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
