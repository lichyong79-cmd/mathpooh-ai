
"use client";
import { difficultyLabel } from "@/lib/difficulty-scale";

type Metadata = {
  question_no: number;
  major_unit?: string;
  middle_unit?: string;
  minor_unit?: string;
  detailed_topic?: string;
  question_type?: string;
  problem_types?: string[];
  difficulty?: string | number;
};

type Props = {
  questionCount: number;
  answers: Record<string, string>;
  keys: string[];
  metadata: Metadata[];
};

type Stat = {
  label: string;
  total: number;
  correct: number;
  wrong: number;
  rate: number;
};

function groupStats(
  rows: Array<{ correct: boolean; answered: boolean; info?: Metadata }>,
  label: (info?: Metadata) => string,
) {
  const map = new Map<
    string,
    { total: number; correct: number; wrong: number }
  >();
  rows.forEach((row) => {
    const key = label(row.info) || "미분류";
    const saved = map.get(key) ?? { total: 0, correct: 0, wrong: 0 };
    saved.total += 1;
    if (row.correct) saved.correct += 1;
    else saved.wrong += 1;
    map.set(key, saved);
  });
  return [...map.entries()]
    .map(([name, value]) => ({
      label: name,
      ...value,
      rate: Math.round((value.correct / value.total) * 100),
    }))
    .sort((a, b) => a.rate - b.rate || b.total - a.total) as Stat[];
}

function Bars({
  title,
  stats,
  tone,
}: {
  title: string;
  stats: Stat[];
  tone: string;
}) {
  return (
    <section className="diagnosis-bars">
      <h4>{title}</h4>
      <div>
        {stats.map((stat) => (
          <article key={stat.label}>
            <header>
              <b title={stat.label}>{stat.label}</b>
              <strong>
                {stat.correct}/{stat.total} · {stat.rate}%
              </strong>
            </header>
            <div>
              <i className={tone} style={{ width: `${stat.rate}%` }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function ExamResultDiagnosis({
  questionCount,
  answers,
  keys,
  metadata,
}: Props) {
  const infoMap = new Map(
    metadata.map((item) => [Number(item.question_no), item]),
  );
  const rows = Array.from({ length: questionCount }, (_, index) => {
    const no = index + 1;
    const answer = String(answers?.[no] ?? answers?.[String(no)] ?? "").trim();
    const key = String(keys[index] ?? "").trim();
    return {
      no,
      answer,
      key,
      answered: Boolean(answer),
      correct: Boolean(answer && key && answer === key),
      info: infoMap.get(no),
    };
  });
  const correct = rows.filter((row) => row.correct).length;
  const wrong = rows.filter((row) => row.answered && !row.correct).length;
  const blank = rows.filter((row) => !row.answered).length;
  const rate = Math.round((correct / Math.max(1, questionCount)) * 100);
  const units = groupStats(
    rows,
    (info) =>
      info?.middle_unit || info?.major_unit || info?.minor_unit || "미분류",
  );
  const types = groupStats(
    rows,
    (info) =>
      info?.problem_types?.[0] ||
      info?.detailed_topic ||
      info?.question_type ||
      "미분류",
  );
  const difficulties = groupStats(rows, (info) =>
    info?.difficulty ? difficultyLabel(info.difficulty) : "미분류",
  ).sort((a, b) => Number(a.label[0]) - Number(b.label[0]));
  const classifiedUnits = units.filter((item) => item.label !== "미분류");
  const classifiedTypes = types.filter((item) => item.label !== "미분류");
  const weakUnit = classifiedUnits[0];
  const weakType = classifiedTypes[0];
  const hardWrong = rows.filter(
    (row) => !row.correct && Number(row.info?.difficulty ?? 0) >= 6,
  ).length;
  const guidance = blank
    ? `미응답 ${blank}문항을 먼저 줄이고, 시간 배분과 마지막 답안 확인 습관을 점검하세요.`
    : hardWrong >= 2
      ? `어4 이상 오답 ${hardWrong}문항은 핵심 진입점과 조건 번역 과정을 중심으로 다시 풀어보세요.`
      : weakUnit
        ? `${weakUnit.label} 단원의 개념 확인 후 같은 유형을 2~3문항 연속 훈련하는 것이 좋습니다.`
        : "오답 문항의 풀이 과정을 다시 적고 정답 근거를 확인하세요.";

  return (
    <section className="result-diagnosis">
      <div className="diagnosis-title">
        <div>
          <small>SOS RESULT DIAGNOSIS</small>
          <h3>시험 결과 종합진단</h3>
        </div>
        <span>문항분석 데이터 기준</span>
      </div>
      <div className="diagnosis-summary">
        <div className="score">
          <span>정답률</span>
          <b>{rate}%</b>
          <small>
            {correct}/{questionCount}문항
          </small>
        </div>
        <div>
          <span>정답</span>
          <b>{correct}</b>
          <small>안정적으로 해결</small>
        </div>
        <div>
          <span>오답</span>
          <b>{wrong}</b>
          <small>재학습 필요</small>
        </div>
        <div>
          <span>미응답</span>
          <b>{blank}</b>
          <small>시간·검토 확인</small>
        </div>
      </div>
      <div className="diagnosis-focus">
        <article>
          <span>취약 단원</span>
          <b>{weakUnit?.label ?? "분석자료 부족"}</b>
          <small>
            {weakUnit
              ? `정답률 ${weakUnit.rate}%`
              : "문항분석을 완료해 주세요."}
          </small>
        </article>
        <article>
          <span>취약 유형</span>
          <b>{weakType?.label ?? "분석자료 부족"}</b>
          <small>
            {weakType
              ? `정답률 ${weakType.rate}%`
              : "문항분석을 완료해 주세요."}
          </small>
        </article>
        <article className="guide">
          <span>지도 포인트</span>
          <b>{guidance}</b>
        </article>
      </div>
      <div className="diagnosis-chart-grid">
        <Bars title="단원별 정답률" stats={units.slice(0, 6)} tone="unit" />
        <Bars title="유형별 정답률" stats={types.slice(0, 6)} tone="type" />
        <Bars title="난이도별 정답률" stats={difficulties} tone="difficulty" />
      </div>
    </section>
  );
}
