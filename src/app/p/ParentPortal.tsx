"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import SosUserManual from "@/components/sos-user-manual";

type Tab = "home" | "apply" | "scores" | "sos" | "report" | "guide";
const TABS: [Tab, string][] = [
  ["home", "홈"],
  ["scores", "성적분석"],
  ["sos", "SOS 학습"],
  ["report", "종합리포트"],
  ["guide", "이용안내"],
  ["apply", "SOS 신청"],
];
const done = (s: any) => ["COMPLETED", "PASSED"].includes(String(s?.status));
const active = (s: any) =>
  ["ASSIGNED", "IN_PROGRESS", "RETRAIN"].includes(String(s?.status));
const fmt = (v: string, year = false) =>
  v
    ? new Date(v).toLocaleDateString(
        "ko-KR",
        year
          ? { year: "numeric", month: "short", day: "numeric" }
          : { month: "short", day: "numeric" },
      )
    : "-";
const rate = (c: number, t: number) =>
  Math.round((Number(c || 0) / Math.max(1, Number(t || 0))) * 100);
const stageName = (s: any) =>
  s.phase === "DIAGNOSIS"
    ? Number(s.round_no) === 2
      ? "2차 진단"
      : "1차 진단"
    : s.cycle_kind === "HOMEWORK"
      ? "3제 굳히기"
      : Number(s.round_no) === 2
        ? "2차 훈련"
        : "1차 훈련";
const statusName = (s: string) =>
  (
    ({
      ASSIGNED: "시작 전",
      IN_PROGRESS: "진행 중",
      COMPLETED: "완료",
      PASSED: "통과",
      RETRAIN: "재훈련",
      READY: "준비 완료",
      QUEUED: "생성 대기",
      GENERATING: "문항 생성 중",
      FAILED: "자동 재시도",
    }) as any
  )[s] ?? s;
const stageOrder = (s: any) =>
  s.phase === "DIAGNOSIS"
    ? Number(s.round_no) === 2
      ? 2
      : 0
    : s.cycle_kind === "HOMEWORK"
      ? 4
      : Number(s.round_no) === 2
        ? 3
        : 1;
const stageLabel = ["진단", "1차훈련", "2차진단", "2차훈련", "3제굳히기"];
const snapshotTitle = (s: any) =>
  String(
    s?.target_snapshot?.subunit ??
      s?.target_snapshot?.majorUnit ??
      s?.weakness_snapshot?.weaknessTitle ??
      "개인별 취약영역",
  );
const meter = (s: any) => {
  for (const v of [s?.review_meter, s?.training_meter, s?.baseline_meter])
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const pct = (exam: any) =>
  Math.round(
    (Number(exam?.score ?? 0) / Math.max(1, Number(exam?.totalScore ?? 100))) *
      100,
  );
const itemAnswered = (s: any) =>
  (s?.sos_training_items ?? []).filter(
    (x: any) => x.answered_at || String(x.student_answer ?? "").trim(),
  ).length;

function Bars({
  rows,
  empty = "분석 정보가 아직 없습니다.",
}: {
  rows: any[];
  empty?: string;
}) {
  return (
    <div className="bars">
      {rows?.length ? (
        rows.map((x: any) => (
          <div key={x.name}>
            <label>
              <span>{x.name}</span>
              <b>
                {x.rate}%{" "}
                <small>
                  {x.correct}/{x.total}
                </small>
              </b>
            </label>
            <i>
              <em style={{ width: `${x.rate}%` }} />
            </i>
          </div>
        ))
      ) : (
        <p className="empty-small">{empty}</p>
      )}
    </div>
  );
}

function ScoreTrend({ exams }: { exams: any[] }) {
  const rows = [...(exams ?? [])].slice(0, 8).reverse();
  return (
    <div className="trend">
      {rows.length ? (
        <>
          <div className="trend-grid">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="trend-bars">
            {rows.map((e: any) => (
              <div key={e.id}>
                <span style={{ height: `${Math.max(5, pct(e))}%` }}>
                  <b>{e.score}</b>
                </span>
                <small>{fmt(e.examDate)}</small>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="no-data">시험 기록이 없습니다.</p>
      )}
    </div>
  );
}

export default function ParentPortal() {
  const [data, setData] = useState<any>(null),
    [selected, setSelected] = useState(""),
    [tab, setTab] = useState<Tab>("home"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [applicationBusy, setApplicationBusy] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/parent/portal", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
      setData(j);
      setSelected((x) => x || String(j.children?.[0]?.id ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const report = useMemo(
    () => data?.reports?.find((x: any) => String(x.student.id) === selected),
    [data, selected],
  );
  const exams: any[] = report?.exams ?? [],
    sessions: any[] = report?.sos ?? [],
    jobs: any[] = report?.generationJobs ?? [],
    programBatches: any[] = data?.programBatches ?? [],
    programApplications: any[] = data?.programApplications ?? [];
  const latestExam = exams[0],
    latestSession = sessions[0],
    completed = sessions.filter(done).length,
    unfinished = sessions.filter(active),
    incomplete = unfinished.length;
  const examAverage = exams.length
    ? Math.round(
        exams.reduce((a: number, e: any) => a + pct(e), 0) / exams.length,
      )
    : null;
  const scoreDelta = exams.length > 1 ? pct(exams[0]) - pct(exams[1]) : null;
  const aggregate = (key: "units" | "difficulties") => {
    const map = new Map<
      string,
      { name: string; total: number; correct: number }
    >();
    for (const e of exams)
      for (const x of e[key] ?? []) {
        const v = map.get(x.name) ?? { name: x.name, total: 0, correct: 0 };
        v.total += Number(x.total);
        v.correct += Number(x.correct);
        map.set(x.name, v);
      }
    return [...map.values()]
      .map((v) => ({ ...v, rate: rate(v.correct, v.total) }))
      .sort((a, b) => a.rate - b.rate);
  };
  const unitRows = aggregate("units"),
    difficultyRows = aggregate("difficulties"),
    weakUnit = unitRows[0],
    strongUnit = [...unitRows].sort((a, b) => b.rate - a.rate)[0];
  const rootOf = (s: any) => {
    let cur = s;
    const seen = new Set();
    while (cur?.parent_session_id && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur =
        sessions.find((x) => String(x.id) === String(cur.parent_session_id)) ??
        cur;
      if (!cur.parent_session_id) break;
    }
    return cur;
  };
  const cycles = useMemo(() => {
    const map = new Map<string, any>();
    for (const s of sessions) {
      const root = rootOf(s);
      const snap = root?.target_snapshot ?? s.target_snapshot ?? {};
      const key = String(
        snap.learningCycleId ?? snap.sourceExamId ?? root?.id ?? s.id,
      );
      const c = map.get(key) ?? {
        key,
        title: String(
          snap.learningCycleName ??
            snap.sourceExamTitle ??
            `${fmt(root?.created_at, true)} SOS`,
        ),
        date: root?.created_at ?? s.created_at,
        target: snapshotTitle(root ?? s),
        items: [],
      };
      c.items.push(s);
      map.set(key, c);
    }
    return [...map.values()].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [sessions]);
  const currentCycle = cycles[0];
  const answered = itemAnswered;
  const remaining = (s: any) =>
    Math.max(0, Number(s?.total_count ?? 0) - answered(s));
  const latestActivity = [...sessions].sort(
    (a, b) =>
      new Date(b.updated_at ?? b.created_at).getTime() -
      new Date(a.updated_at ?? a.created_at).getTime(),
  )[0];
  const actionText = jobs.some((j) =>
    ["QUEUED", "GENERATING", "FAILED"].includes(j.status),
  )
    ? "AI가 다음 학습 문항을 준비하고 있습니다."
    : incomplete
      ? `${stageName(sessions.find(active))} 학습을 마무리할 차례입니다.`
      : sessions.length
        ? "현재 배정된 SOS 학습을 모두 완료했습니다."
        : "새 SOS 학습 배정을 기다리고 있습니다.";
  const insight = weakUnit
    ? `${weakUnit.name}의 누적 정답률이 ${weakUnit.rate}%로 가장 낮습니다. 다음 학습에서 이 단원을 우선 보완하는 것이 좋습니다.`
    : sessions.length
      ? "SOS 진단·훈련 결과가 쌓이면 우선 보완 단원을 안내합니다."
      : "첫 진단이 완료되면 개인별 보완 방향을 안내합니다.";
  const signOut = async () => {
    await createClient().auth.signOut();
    location.href = "/parent-login";
  };
  const changePassword = async () => {
    const p = prompt("새 비밀번호를 입력하세요. (6자리 이상)");
    if (!p) return;
    const r = await fetch("/api/parent/portal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: p }),
    });
    const j = await r.json();
    if (!r.ok) return alert(j.message);
    alert("비밀번호를 변경했습니다.");
    await load();
  };
  const changeApplication = async (batch: any) => {
    if (!selected || applicationBusy) return;
    if (!confirm(`${report?.student.name} 학생으로 '${batch.title}' 5회 프로그램을 신청할까요?`)) return;
    setApplicationBusy(String(batch.id));
    try {
      const r = await fetch("/api/program-applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchId: batch.id, studentId: selected, parentName: "학부모", parentPhone: data.parentPhone, studentName: report.student.name, studentPhone: report.student.phone, school: report.student.school, grade: report.student.grade }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "신청을 처리하지 못했습니다.");
      await load();
      alert("5회 프로그램 신청이 접수되었습니다. 입금 확인 후 등록됩니다.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "신청을 처리하지 못했습니다.");
    } finally {
      setApplicationBusy("");
    }
  };
  // SOS305: 초기 비밀번호(전화번호 뒤 4자리)를 바꾸기 전에는 자녀 기록을 열지 않는다.
  // 이 계정 하나로 형제자매 전체의 성적과 진단 결과가 보이므로 학생 화면과 같은 기준을 적용한다.
  if (!loading && !error && data && data.passwordChanged === false)
    return (
      <main className="pw-gate">
        <div>
          <small>MATHPOOH SOS</small>
          <h1>비밀번호를 먼저 변경해 주세요</h1>
          <p>
            처음 안내드린 비밀번호는 전화번호로 쉽게 추측할 수 있습니다.
            <br />
            자녀의 학습 기록을 지키려면 나만 아는 비밀번호로 바꿔야 합니다.
          </p>
          <button onClick={() => void changePassword()}>
            비밀번호 변경하기
          </button>
          <button
            className="ghost"
            onClick={() => {
              location.href = "/auth/signout";
            }}
          >
            로그아웃
          </button>
        </div>
        <style jsx>{`
          :global(body) {
            margin: 0;
          }
          .pw-gate {
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f2f6f3;
            padding: 20px;
            font-family: Arial, "Noto Sans KR", sans-serif;
          }
          .pw-gate > div {
            width: 100%;
            max-width: 430px;
            background: #fff;
            border: 1px solid #dbe6de;
            border-radius: 18px;
            padding: 30px;
            display: grid;
            gap: 13px;
            box-shadow: 0 18px 45px rgba(23, 63, 35, 0.1);
          }
          small {
            color: #4d7d46;
            font-weight: 900;
            font-size: 12px;
          }
          h1 {
            margin: 0;
            color: #285c31;
            font-size: 23px;
          }
          p {
            margin: 0;
            color: #6c7b71;
            font-size: 14px;
            line-height: 1.7;
          }
          button {
            height: 48px;
            border: 0;
            border-radius: 10px;
            background: #2f6937;
            color: #fff;
            font-weight: 900;
            font-size: 15px;
            cursor: pointer;
          }
          .ghost {
            height: 42px;
            border: 1px solid #d4dee6;
            background: #fff;
            color: #7b857f;
            font-size: 13px;
          }
        `}</style>
      </main>
    );

  if (loading)
    return (
      <main className="loading">
        <img src="/mathpooh-logo.png" alt="" />
        <b>자녀의 성장 기록을 불러오고 있습니다.</b>
        <style jsx>{`
          :global(body) {
            margin: 0;
          }
          .loading {
            min-height: 100vh;
            display: grid;
            place-content: center;
            gap: 14px;
            text-align: center;
            background: #f2f6f3;
            color: #285c31;
            font-family: Arial, "Noto Sans KR", sans-serif;
          }
          .loading img {
            width: 72px;
            margin: auto;
          }
        `}</style>
      </main>
    );
  return (
    <main className="portal">
      <header>
        <div className="header-inner">
          <div className="brand">
            <img src="/mathpooh-logo.png" alt="" />
            <div>
              <b>MATHPOOH</b>
              <span>SOS PARENT</span>
            </div>
          </div>
          <nav>
            {TABS.map(([id, name]) => (
              <button
                key={id}
                className={`${tab === id ? "active" : ""} ${id === "apply" ? "apply-nav" : ""}`}
                onClick={() => setTab(id)}
              >
                {name}
              </button>
            ))}
          </nav>
          <div className="tools">
            <button
              onClick={() => {
                setTab("report");
                setTimeout(() => window.print(), 100);
              }}
            >
              리포트 인쇄
            </button>
            <button onClick={changePassword}>비밀번호</button>
            <button onClick={signOut}>로그아웃</button>
          </div>
        </div>
      </header>
      {error ? (
        <section className="state">
          <h1>학부모 페이지를 열지 못했습니다.</h1>
          <p>{error}</p>
          <button onClick={() => void load()}>다시 불러오기</button>
        </section>
      ) : !data?.children?.length ? (
        <section className="state">
          <h1>연결된 자녀가 없습니다.</h1>
          <p>관리자 학생정보의 학부모 전화번호를 확인해 주세요.</p>
        </section>
      ) : (
        <div className="wrap">
          <section className="student-head">
            <div>
              <small>MATHPOOH GROWTH REPORT</small>
              <h1>{report?.student.name} 학생</h1>
              <p>
                {report?.student.school} · {report?.student.grade} ·{" "}
                {fmt(new Date().toISOString(), true)} 기준
              </p>
            </div>
            {data.children.length > 1 ? (
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {data.children.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.school}
                  </option>
                ))}
              </select>
            ) : (
              <span className="one-child">자녀 연결 완료</span>
            )}
          </section>

          {tab === "home" && (
            <>
              <section className="hero">
                <div>
                  <small>이번 학습 안내</small>
                  <h2>{actionText}</h2>
                  <p>{insight}</p>
                </div>
                <b className={incomplete ? "warn" : "good"}>
                  {incomplete ? `${incomplete}개 진행 필요` : "학습 확인 완료"}
                </b>
              </section>
              <section className="unfinished card">
                <div className="unfinished-head">
                  <div>
                    <small>TO DO · 미완료 학습</small>
                    <h2>
                      {unfinished.length
                        ? `${unfinished.length}개의 학습이 남아 있습니다.`
                        : "현재 미완료 학습이 없습니다."}
                    </h2>
                  </div>
                  <button onClick={() => setTab("sos")}>
                    SOS 학습 전체보기 →
                  </button>
                </div>
                {unfinished.length ? (
                  <div className="unfinished-list">
                    {unfinished.slice(0, 4).map((s: any) => (
                      <div key={s.id}>
                        <i
                          className={
                            s.status === "IN_PROGRESS" ? "now" : "wait"
                          }
                        />
                        <section>
                          <b>
                            {stageName(s)} · {snapshotTitle(s)}
                          </b>
                          <span>
                            {statusName(s.status)} · {answered(s)}/
                            {s.total_count ?? 0}문항 진행
                          </span>
                          <div>
                            <em
                              style={{
                                width: `${rate(answered(s), Number(s.total_count ?? 0))}%`,
                              }}
                            />
                          </div>
                        </section>
                        <strong>
                          {remaining(s)}문항
                          <br />
                          <small>남음</small>
                        </strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="all-done">
                    <b>✓</b>
                    <span>
                      이번에 배정된 학습을 모두 마쳤습니다.
                      <small>
                        다음 진단 또는 모의고사 결과가 등록되면 새로운 학습이
                        표시됩니다.
                      </small>
                    </span>
                  </div>
                )}
              </section>
              <section className="stats">
                <article>
                  <span>최근 시험</span>
                  <b>{latestExam ? `${latestExam.score}점` : "응시 전"}</b>
                  <small>{latestExam?.title ?? "시험 기록 없음"}</small>
                </article>
                <article>
                  <span>최근 {exams.length}회 평균</span>
                  <b>{examAverage == null ? "-" : `${examAverage}점`}</b>
                  <small>
                    {scoreDelta == null
                      ? "비교 기록 없음"
                      : scoreDelta >= 0
                        ? `직전보다 ${scoreDelta}점 상승`
                        : `직전보다 ${Math.abs(scoreDelta)}점 하락`}
                  </small>
                </article>
                <article>
                  <span>최근 학습활동</span>
                  <b>
                    {latestActivity
                      ? fmt(
                          latestActivity.updated_at ??
                            latestActivity.created_at,
                        )
                      : "-"}
                  </b>
                  <small>
                    {latestActivity
                      ? `${stageName(latestActivity)} · ${statusName(latestActivity.status)}`
                      : "학습 기록 없음"}
                  </small>
                </article>
                <article>
                  <span>SOS 완료</span>
                  <b>{completed}회</b>
                  <small>진단·훈련 누적 완료</small>
                </article>
              </section>
              <section className="two">
                <article className="card">
                  <Title en="SCORE TREND" ko="점수 변화" />
                  <ScoreTrend exams={exams} />
                  <div className="mini-analysis">
                    <span>
                      최근 평균{" "}
                      <b>{examAverage == null ? "-" : `${examAverage}점`}</b>
                    </span>
                    <span>
                      직전 대비{" "}
                      <b>
                        {scoreDelta == null
                          ? "-"
                          : `${scoreDelta >= 0 ? "+" : ""}${scoreDelta}점`}
                      </b>
                    </span>
                    <span>
                      최근 정답{" "}
                      <b>
                        {latestExam
                          ? `${latestExam.correct}/${latestExam.total}`
                          : "-"}
                      </b>
                    </span>
                  </div>
                </article>
                <article className="card">
                  <Title en="CURRENT SOS" ko="이번 SOS 학습경로" />
                  <CyclePath cycle={currentCycle} />
                  {currentCycle ? (
                    <CycleMetrics cycle={currentCycle} />
                  ) : (
                    <p className="empty-small">배정된 학습경로가 없습니다.</p>
                  )}
                </article>
              </section>
              <section className="two">
                <article className="card">
                  <Title en="STRENGTH & WEAKNESS" ko="강점과 보완점" />
                  <div className="compare">
                    <div className="strong">
                      <span>상대적 강점</span>
                      <b>{strongUnit?.name ?? "분석 대기"}</b>
                      <small>
                        {strongUnit
                          ? `누적 ${strongUnit.correct}/${strongUnit.total} 정답 · ${strongUnit.rate}%`
                          : "시험 분석이 필요합니다."}
                      </small>
                    </div>
                    <div className="weak">
                      <span>우선 보완</span>
                      <b>{weakUnit?.name ?? "분석 대기"}</b>
                      <small>
                        {weakUnit
                          ? `누적 ${weakUnit.correct}/${weakUnit.total} 정답 · ${weakUnit.rate}%`
                          : "시험 분석이 필요합니다."}
                      </small>
                    </div>
                  </div>
                  {difficultyRows[0] ? (
                    <p className="detail-note">
                      <b>난이도 보완:</b> {difficultyRows[0].name} 정답률{" "}
                      {difficultyRows[0].rate}% · 오답 복습과 동일 난이도
                      재검증이 필요합니다.
                    </p>
                  ) : null}
                </article>
                <article className="card">
                  <Title en="TEACHER COMMENT" ko="매쓰푸 코멘트" />
                  <blockquote>{latestExam?.comment || insight}</blockquote>
                  <small className="comment-source">
                    {latestExam?.comment
                      ? `${latestExam.title} 코멘트`
                      : `누적 학습 데이터 자동 요약`}
                  </small>
                  <p className="detail-note">
                    <b>권장 행동:</b>{" "}
                    {unfinished.length
                      ? `${stageName(unfinished[0])}의 남은 ${remaining(unfinished[0])}문항을 먼저 완료해 주세요.`
                      : weakUnit
                        ? `${weakUnit.name} 오답을 다시 확인하고 다음 진단을 준비해 주세요.`
                        : "현재 학습 흐름을 유지해 주세요."}
                  </p>
                </article>
              </section>
            </>
          )}

          {tab === "apply" && (
            <>
              <section className="section-intro apply-intro">
                <div>
                  <small>MATHPOOH SOS PROGRAM</small>
                  <h2>{report?.student.name} 학생 SOS 신청</h2>
                  <p>프로그램 안내를 확인하고 자녀 이름으로 바로 신청할 수 있습니다.</p>
                </div>
                <div><b>{programApplications.filter((x) => x.status === "REQUESTED" && String(x.student_id) === selected).length}</b><span>신청 대기</span></div>
              </section>
              <section className="parent-posters">
                {(data.posters ?? []).map((poster: any) => {
                  const content = <><img src={poster.image_url} alt={poster.title} /><div><b>{poster.title}</b><span>{poster.link_url ? "상세 안내 보기 →" : "프로그램 안내"}</span></div></>;
                  return poster.link_url ? <a key={poster.id} href={poster.link_url} target="_blank" rel="noreferrer">{content}</a> : <article key={poster.id}>{content}</article>;
                })}
                {!data.posters?.length ? <div className="apply-empty">현재 등록된 프로그램 안내 포스터가 없습니다.</div> : null}
              </section>
              <section className="card application-card">
                <Title en="APPLICATION" ko="신청 가능한 SOS 5회 프로그램" />
                <p className="application-help">일정 5개가 한 묶음입니다. 입금 확인 후 5개 회차가 자녀에게 한 번에 등록됩니다.</p>
                <div className="application-list">
                  {programBatches.map((batch: any) => { const applied = programApplications.find((x) => String(x.batch_id) === String(batch.id) && (String(x.student_id) === selected || x.student_name === report?.student.name)); return (
                    <article key={batch.id}>
                      <div className="application-date"><b>5</b><span>회 묶음</span></div>
                      <div className="application-info"><small>MATHPOOH SOS</small><b>{batch.title}</b><span>{batch.cycles.map((c: any) => `${c.slot_no}회 ${fmt(c.start_date)}`).join(" · ")}</span></div>
                      <div className="application-action">
                        {applied ? <><strong className={applied.status === "ENROLLED" ? "assigned" : "requested"}>{applied.status === "ENROLLED" ? "등록 완료" : applied.status === "REQUESTED" ? "신청 접수" : applied.status}</strong></> : <button className="request" disabled={applicationBusy === String(batch.id)} onClick={() => void changeApplication(batch)}>{applicationBusy === String(batch.id) ? "처리 중…" : `${Number(batch.price ?? 0).toLocaleString("ko-KR")}원 · 신청하기`}</button>}
                      </div>
                    </article>
                  )})}
                  {!programBatches.length ? <div className="apply-empty">현재 신청 가능한 5회 프로그램이 없습니다.</div> : null}
                </div>
              </section>
            </>
          )}

          {tab === "scores" && (
            <>
              <section className="section-intro">
                <div>
                  <small>PERFORMANCE ANALYSIS</small>
                  <h2>성적분석</h2>
                  <p>점수 한 번보다 변화의 방향과 취약 단원을 함께 봅니다.</p>
                </div>
                <div>
                  <b>{examAverage == null ? "-" : examAverage}</b>
                  <span>최근 평균</span>
                </div>
              </section>
              <section className="card wide">
                <Title en="SCORE HISTORY" ko="시험별 점수 추이" />
                <ScoreTrend exams={exams} />
              </section>
              <section className="two">
                <article className="card">
                  <Title en="UNIT ACHIEVEMENT" ko="단원별 누적 성취도" />
                  <Bars rows={unitRows} />
                </article>
                <article className="card">
                  <Title
                    en="DIFFICULTY ACHIEVEMENT"
                    ko="난이도별 누적 성취도"
                  />
                  <Bars rows={difficultyRows} />
                </article>
              </section>
              <section className="card wide">
                <Title en="EXAM RECORDS" ko="시험별 상세 기록" />
                <div className="exam-table">
                  <div className="thead">
                    <span>시험</span>
                    <span>응시일</span>
                    <span>점수</span>
                    <span>정답</span>
                    <span>오답 문항</span>
                  </div>
                  {exams.length ? (
                    exams.map((e) => (
                      <div key={e.id}>
                        <span>
                          <b>{e.title}</b>
                          <small>{e.subject}</small>
                        </span>
                        <span>{fmt(e.submittedAt || e.examDate, true)}</span>
                        <strong>
                          {e.score}/{e.totalScore}
                        </strong>
                        <span>
                          {e.correct}/{e.total}
                        </span>
                        <span>
                          {e.wrong?.length ? e.wrong.join(", ") : "없음"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="no-data">시험 기록이 없습니다.</p>
                  )}
                </div>
              </section>
            </>
          )}

          {tab === "sos" && (
            <>
              <section className="section-intro">
                <div>
                  <small>PERSONALIZED LEARNING</small>
                  <h2>SOS 학습과정</h2>
                  <p>
                    주차별 진단에서 훈련·재검증까지 개인별 경로와 성장 변화를
                    확인합니다.
                  </p>
                </div>
                <div>
                  <b>
                    {
                      cycles.filter(
                        (c) => c.items.length > 0 && c.items.every(done),
                      ).length
                    }
                  </b>
                  <span>완료 주차</span>
                </div>
              </section>
              {jobs.some((j) =>
                ["QUEUED", "GENERATING", "FAILED"].includes(j.status),
              ) ? (
                <section className="generation">
                  <i />
                  <div>
                    <b>AI 개별문항 준비 중</b>
                    <span>
                      {jobs.find((j) =>
                        ["QUEUED", "GENERATING", "FAILED"].includes(j.status),
                      )?.stage_message ||
                        "통과 문항은 보존하며 다음 문항을 생성하고 있습니다."}
                    </span>
                  </div>
                </section>
              ) : null}
              <section className="cycle-list">
                {cycles.length ? (
                  cycles.map((c: any) => {
                    const ids = new Set(c.items.map((x: any) => String(x.id)));
                    const pendingJob = jobs.some(
                      (j) =>
                        ids.has(String(j.source_training_session_id)) &&
                        ["QUEUED", "GENERATING", "FAILED"].includes(j.status),
                    );
                    const cycleDone =
                      c.items.length > 0 && c.items.every(done) && !pendingJob;
                    return (
                      <article
                        className={`card cycle ${cycleDone ? "cycle-complete" : ""}`}
                        key={c.key}
                      >
                        {cycleDone ? (
                          <div className="completion-stamp">
                            <small>MATHPOOH SOS</small>
                            <b>학습완료</b>
                            <em>COMPLETE</em>
                          </div>
                        ) : null}
                        <div className="cycle-head">
                          <div>
                            <small>{fmt(c.date, true)} · 주차별 SOS</small>
                            <h3>{c.title}</h3>
                            <p>집중 공략: {c.target}</p>
                          </div>
                          <b>
                            {c.items.filter(done).length}/{c.items.length} 단계
                            완료
                          </b>
                        </div>
                        <CyclePath cycle={c} />
                        <CycleMetrics cycle={c} />
                        <div className="session-list">
                          {[...c.items]
                            .sort((a, b) => stageOrder(a) - stageOrder(b))
                            .map((s: any) => (
                              <div key={s.id}>
                                <i
                                  className={
                                    done(s) ? "done" : active(s) ? "now" : ""
                                  }
                                />
                                <span>
                                  <b>{stageName(s)}</b>
                                  <small>
                                    {statusName(s.status)} · {answered(s)}/
                                    {s.total_count ?? 0}문항 응답 ·{" "}
                                    {s.correct_count ?? 0}문항 정답 · 정답률{" "}
                                    {rate(
                                      Number(s.correct_count ?? 0),
                                      Number(s.total_count ?? 0),
                                    )}
                                    %
                                  </small>
                                </span>
                                <em>
                                  {meter(s) == null
                                    ? "바로미터 -"
                                    : `바로미터 ${meter(s)!.toFixed(1)}`}
                                  <small>
                                    {fmt(s.updated_at ?? s.created_at)} 갱신
                                  </small>
                                </em>
                              </div>
                            ))}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <section className="card no-data">
                    SOS 학습 기록이 없습니다.
                  </section>
                )}
              </section>
            </>
          )}

          {tab === "report" && (
            <>
              <section className="report-cover">
                <img src="/mathpooh-logo.png" alt="" />
                <small>MATHPOOH SOS · PERSONAL GROWTH REPORT</small>
                <h2>{report?.student.name} 학생 종합 학습리포트</h2>
                <p>
                  {report?.student.school} · {report?.student.grade} ·{" "}
                  {fmt(new Date().toISOString(), true)}
                </p>
              </section>
              <section className="report-grid">
                <article>
                  <span>최근 성적</span>
                  <b>
                    {latestExam
                      ? `${latestExam.score}/${latestExam.totalScore}`
                      : "-"}
                  </b>
                </article>
                <article>
                  <span>최근 평균</span>
                  <b>{examAverage == null ? "-" : `${examAverage}점`}</b>
                </article>
                <article>
                  <span>우선 보완</span>
                  <b>{weakUnit?.name ?? "분석 대기"}</b>
                </article>
                <article>
                  <span>SOS 완료</span>
                  <b>{completed}단계</b>
                </article>
              </section>
              <section className="card narrative">
                <Title en="MATHPOOH ANALYSIS" ko="종합 분석" />
                <h3>현재 학습상태</h3>
                <p>
                  {latestExam
                    ? `최근 ${latestExam.title}에서 ${latestExam.score}점을 기록했고, 최근 ${exams.length}회 평균은 ${examAverage}점입니다.`
                    : "아직 제출된 시험이 없어 첫 성적 데이터를 기다리고 있습니다."}{" "}
                  {scoreDelta != null
                    ? scoreDelta >= 0
                      ? `직전 시험보다 ${scoreDelta}점 상승했습니다.`
                      : `직전 시험보다 ${Math.abs(scoreDelta)}점 낮아져 오답 원인 확인이 필요합니다.`
                    : ""}
                </p>
                <h3>개인별 보완방향</h3>
                <p>
                  {insight}{" "}
                  {difficultyRows[0]
                    ? `${difficultyRows[0].name} 난이도의 누적 정답률은 ${difficultyRows[0].rate}%입니다.`
                    : ""}
                </p>
                <h3>SOS 진행상태</h3>
                <p>
                  {actionText} 현재까지 진단·훈련 ${completed}단계를
                  완료했습니다.
                </p>
                {latestExam?.comment ? (
                  <>
                    <h3>교사 코멘트</h3>
                    <blockquote>{latestExam.comment}</blockquote>
                  </>
                ) : null}
              </section>
              <section className="two report-detail">
                <article className="card">
                  <Title en="SCORE TREND" ko="점수 변화" />
                  <ScoreTrend exams={exams} />
                </article>
                <article className="card">
                  <Title en="LEARNING PATH" ko="최근 SOS 경로" />
                  <CyclePath cycle={currentCycle} />
                </article>
              </section>
            </>
          )}
          {tab === "guide" && <SosUserManual audience="parent" />}
        </div>
      )}
      <footer>
        <span>
          개별화는 무엇을 공부할지 다르게 하고, 개인화는 어떻게 이해할지까지
          다르게 합니다.
        </span>
        <b>MATHPOOH SOS</b>
      </footer>
      <PortalStyle />
      <DetailStyle />
    </main>
  );
}

function Title({ en, ko }: { en: string; ko: string }) {
  return (
    <div className="title">
      <div>
        <small>{en}</small>
        <h2>{ko}</h2>
      </div>
    </div>
  );
}
function CyclePath({ cycle }: { cycle: any }) {
  const items = cycle?.items ?? [];
  return (
    <div className="path">
      {stageLabel.map((name, index) => {
        const s = items.find((x: any) => stageOrder(x) === index);
        return (
          <div
            key={name}
            className={
              s ? (done(s) ? "done" : active(s) ? "now" : "wait") : "off"
            }
          >
            <i>{s ? (done(s) ? "✓" : index + 1) : "·"}</i>
            <b>{name}</b>
            <small>{s ? statusName(s.status) : "해당 없음"}</small>
          </div>
        );
      })}
    </div>
  );
}
function CycleMetrics({ cycle }: { cycle: any }) {
  const items: any[] = cycle?.items ?? [];
  const sorted = [...items].sort((a, b) => stageOrder(a) - stageOrder(b));
  const base = sorted.map((s) => s.baseline_meter).find((v) => v != null);
  const current = [...sorted]
    .reverse()
    .map(meter)
    .find((v) => v != null);
  const delta = base != null && current != null ? current - Number(base) : null;
  const total = items.reduce((a, s) => a + Number(s.total_count ?? 0), 0),
    correct = items.reduce((a, s) => a + Number(s.correct_count ?? 0), 0),
    answered = items.reduce((a, s) => a + itemAnswered(s), 0);
  return (
    <div className="cycle-metrics">
      <div>
        <span>전체 진행</span>
        <b>
          {answered}/{total}문항
        </b>
        <small>{rate(answered, total)}%</small>
      </div>
      <div>
        <span>누적 정답률</span>
        <b>
          {correct}/{total}
        </b>
        <small>{rate(correct, total)}%</small>
      </div>
      <div>
        <span>시작 바로미터</span>
        <b>{base == null ? "-" : Number(base).toFixed(1)}</b>
        <small>진단 기준</small>
      </div>
      <div>
        <span>현재 바로미터</span>
        <b>{current == null ? "-" : Number(current).toFixed(1)}</b>
        <small>
          {delta == null
            ? "변화 측정 중"
            : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} 변화`}
        </small>
      </div>
    </div>
  );
}

function DetailStyle() {
  return (
    <style jsx global>{`
      .parent-posters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:14px 0}.parent-posters>a,.parent-posters>article{overflow:hidden;border:1px solid #dbe5dd;border-radius:16px;background:#fff;color:#17251b;text-decoration:none}.parent-posters img{display:block;width:100%;max-height:520px;object-fit:contain;background:#f6f8f6}.parent-posters>a>div,.parent-posters>article>div{display:flex;justify-content:space-between;gap:10px;padding:14px}.parent-posters span{color:#39704b;font-size:11px;font-weight:900}.application-card{margin-top:14px}.application-help{margin:-6px 0 16px;color:#6f7d73;font-size:12px}.application-list{display:grid;gap:9px}.application-list>article{display:grid;grid-template-columns:68px 1fr auto;align-items:center;gap:14px;padding:13px;border:1px solid #e1e8e3;border-radius:12px}.application-date{display:grid;place-items:center;padding:8px;border-radius:10px;background:#eef6ef}.application-date b{font-size:22px;color:#2f6937}.application-date span{font-size:10px}.application-info>*{display:block}.application-info small{color:#78907d;font-size:9px;font-weight:900}.application-info b{margin:4px 0}.application-info span{color:#718078;font-size:11px}.application-action{display:flex;align-items:center;gap:7px}.application-action button{height:42px;padding:0 14px;border:1px solid #d5dfd7;border-radius:9px;background:#fff;font-weight:900;cursor:pointer}.application-action button.request{border-color:#2f6937;background:#2f6937;color:#fff}.application-action strong{padding:9px 11px;border-radius:9px;font-size:11px}.application-action .requested{background:#fff3dc;color:#a46212}.application-action .assigned{background:#eaf6ec;color:#28703c}.apply-empty{grid-column:1/-1;padding:25px;text-align:center;border:1px dashed #ccd9cf;border-radius:12px;color:#728078;background:#fff}
      .unfinished {
        margin-top: 13px;
      }
      @media(max-width:700px){.parent-posters{grid-template-columns:1fr}.application-list>article{grid-template-columns:55px 1fr}.application-action{grid-column:2}.application-action button{width:100%}}
      .unfinished-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .unfinished-head small {
        color: #b56d19;
        font-size: 9px;
        font-weight: 1000;
        letter-spacing: 0.12em;
      }
      .unfinished-head h2 {
        margin: 5px 0 0;
        font-size: 18px;
      }
      .unfinished-head button {
        border: 0;
        background: #f3f7f4;
        color: #39704b;
        border-radius: 9px;
        padding: 9px 11px;
        font-size: 10px;
        font-weight: 900;
        cursor: pointer;
      }
      .unfinished-list {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 16px;
      }
      .unfinished-list > div {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 13px;
        border: 1px solid #e7ebe8;
        border-radius: 12px;
        background: #fafcfb;
      }
      .unfinished-list > div > i {
        width: 11px;
        height: 11px;
        flex: 0 0 11px;
        border-radius: 50%;
        background: #d4ddd6;
      }
      .unfinished-list > div > i.now {
        background: #e4a037;
        box-shadow: 0 0 0 4px #fff0d6;
      }
      .unfinished-list section {
        flex: 1;
      }
      .unfinished-list section > b,
      .unfinished-list section > span {
        display: block;
      }
      .unfinished-list section > b {
        font-size: 12px;
      }
      .unfinished-list section > span {
        margin: 4px 0 7px;
        color: #7c8880;
        font-size: 9px;
      }
      .unfinished-list section > div {
        height: 5px;
        border-radius: 6px;
        background: #e9eeeb;
        overflow: hidden;
      }
      .unfinished-list section > div em {
        display: block;
        height: 100%;
        background: #4b9463;
      }
      .unfinished-list strong {
        text-align: center;
        color: #a9661b;
        font-size: 15px;
      }
      .unfinished-list strong small {
        font-size: 8px;
      }
      .all-done {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 15px;
        padding: 15px;
        border-radius: 12px;
        background: #eef8f1;
        color: #2f7047;
      }
      .all-done > b {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: #3d8455;
        color: #fff;
      }
      .all-done span,
      .all-done small {
        display: block;
      }
      .all-done span {
        font-weight: 900;
        font-size: 12px;
      }
      .all-done small {
        margin-top: 4px;
        font-weight: 400;
        color: #6f7e74;
      }
      .mini-analysis {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        margin-top: 8px;
      }
      .mini-analysis span {
        padding: 9px;
        border-radius: 9px;
        background: #f5f8f6;
        color: #7b877f;
        font-size: 9px;
      }
      .mini-analysis b {
        display: block;
        margin-top: 4px;
        color: #285c31;
        font-size: 12px;
      }
      .detail-note {
        margin: 12px 0 0;
        padding: 11px;
        border-radius: 9px;
        background: #f7f8f5;
        color: #69756d;
        font-size: 10px;
        line-height: 1.6;
      }
      .detail-note b {
        color: #355f43;
      }
      .cycle {
        position: relative !important;
        overflow: hidden;
      }
      .cycle-complete {
        border-color: #bad8c3 !important;
        background: linear-gradient(
          145deg,
          #fff 0%,
          #fff 72%,
          #f0f8f2 100%
        ) !important;
      }
      .cycle-complete .cycle-head {
        padding-right: 145px;
      }
      .completion-stamp {
        position: absolute;
        right: 28px;
        top: 21px;
        width: 116px;
        height: 116px;
        border: 4px double rgba(38, 125, 71, 0.7);
        border-radius: 50%;
        display: grid;
        place-content: center;
        text-align: center;
        color: rgba(30, 111, 60, 0.76);
        transform: rotate(-11deg);
        box-shadow:
          inset 0 0 0 4px #fff,
          inset 0 0 0 6px rgba(38, 125, 71, 0.42);
        z-index: 3;
        pointer-events: none;
      }
      .completion-stamp small,
      .completion-stamp b,
      .completion-stamp em {
        display: block;
      }
      .completion-stamp small {
        font-size: 7px;
        letter-spacing: 0.13em;
        font-weight: 1000;
      }
      .completion-stamp b {
        font-size: 23px;
        letter-spacing: -0.06em;
        line-height: 1.15;
        border-top: 1px solid rgba(38, 125, 71, 0.5);
        border-bottom: 1px solid rgba(38, 125, 71, 0.5);
        margin: 5px 0;
        padding: 3px 0;
      }
      .completion-stamp em {
        font-size: 8px;
        letter-spacing: 0.16em;
        font-style: normal;
        font-weight: 1000;
      }
      .cycle-metrics {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 7px;
        margin-top: 22px;
      }
      .cycle-metrics > div {
        padding: 11px;
        border-radius: 10px;
        background: #f5f8f6;
        border: 1px solid #e7ece8;
      }
      .cycle-metrics span,
      .cycle-metrics b,
      .cycle-metrics small {
        display: block;
      }
      .cycle-metrics span {
        color: #7c8880;
        font-size: 8px;
      }
      .cycle-metrics b {
        margin: 5px 0;
        color: #285c31;
        font-size: 14px;
      }
      .cycle-metrics small {
        color: #7d8981;
        font-size: 8px;
      }
      .session-list em small {
        display: block;
        margin-top: 3px;
        color: #929b95;
        font-size: 8px;
        font-style: normal;
      }
      @media (max-width: 650px) {
        .unfinished-head {
          align-items: start;
        }
        .unfinished-head button {
          font-size: 0;
        }
        .unfinished-head button:after {
          content: "전체보기";
          font-size: 9px;
        }
        .unfinished-list {
          grid-template-columns: 1fr;
        }
        .mini-analysis {
          grid-template-columns: 1fr 1fr 1fr;
        }
        .cycle-complete .cycle-head {
          padding-right: 87px;
        }
        .completion-stamp {
          right: 10px;
          top: 13px;
          width: 76px;
          height: 76px;
          border-width: 3px;
        }
        .completion-stamp small {
          font-size: 4px;
        }
        .completion-stamp b {
          font-size: 15px;
          margin: 3px 0;
          padding: 2px 0;
        }
        .completion-stamp em {
          font-size: 5px;
        }
        .cycle-metrics {
          grid-template-columns: 1fr 1fr;
        }
        .session-list em {
          max-width: 90px;
          text-align: right;
        }
      }
    `}</style>
  );
}

function PortalStyle() {
  return (
    <style jsx global>{`
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: #f2f6f3;
        color: #18221c;
        font-family: Arial, "Noto Sans KR", sans-serif;
      }
      .portal {
        min-height: 100vh;
      }
      .portal > header {
        position: sticky;
        top: 0;
        z-index: 20;
        background: rgba(255, 255, 255, 0.96);
        border-bottom: 1px solid #dfe7e1;
        backdrop-filter: blur(12px);
      }
      .header-inner {
        max-width: 1240px;
        height: 76px;
        margin: auto;
        display: flex;
        align-items: center;
        gap: 30px;
        padding: 0 20px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 165px;
      }
      .brand img {
        width: 42px;
      }
      .brand b,
      .brand span {
        display: block;
      }
      .brand b {
        color: #285c31;
        font-size: 18px;
      }
      .brand span {
        font-size: 9px;
        letter-spacing: 0.15em;
        color: #89948d;
      }
      .header-inner nav {
        display: flex;
        align-self: stretch;
      }
      .header-inner nav button {
        border: 0;
        border-radius: 0;
        background: transparent;
        padding: 0 18px;
        color: #6e7972;
        font-weight: 900;
        cursor: pointer;
        border-bottom: 3px solid transparent;
      }
      .header-inner nav button.active {
        color: #285c31;
        border-bottom-color: #3c8656;
      }
      .header-inner nav button.apply-nav {
        align-self: center;
        height: 38px;
        margin-left: 5px;
        padding: 0 15px;
        border: 1px solid #c9ab5e;
        border-radius: 10px;
        background: #fff8e7;
        color: #755513;
      }
      .header-inner nav button.apply-nav.active {
        border-color: #2f6937;
        background: #2f6937;
        color: #fff;
      }
      .tools {
        margin-left: auto;
        display: flex;
        gap: 6px;
      }
      .tools button,
      .state button {
        border: 1px solid #d9e3dc;
        border-radius: 9px;
        background: #fff;
        padding: 9px 11px;
        color: #657168;
        font-weight: 800;
        cursor: pointer;
      }
      .wrap {
        max-width: 1180px;
        margin: auto;
        padding: 0 0 40px;
      }
      .student-head {
        display: flex;
        justify-content: space-between;
        align-items: end;
        padding: 34px 2px 20px;
      }
      .student-head small,
      .section-intro small,
      .report-cover small {
        font-weight: 1000;
        color: #318052;
        letter-spacing: 0.11em;
      }
      .student-head h1 {
        margin: 5px 0;
        font-size: 30px;
      }
      .student-head p {
        margin: 0;
        color: #79847d;
      }
      .student-head select {
        min-width: 220px;
        border: 1px solid #d8e3db;
        border-radius: 10px;
        background: #fff;
        padding: 11px;
        font-weight: 900;
      }
      .one-child {
        padding: 8px 12px;
        border-radius: 99px;
        background: #eaf5ed;
        color: #33724a;
        font-size: 11px;
        font-weight: 900;
      }
      .hero {
        display: flex;
        justify-content: space-between;
        gap: 25px;
        align-items: center;
        padding: 24px 27px;
        border-radius: 19px;
        color: #fff;
        background: linear-gradient(120deg, #204f35, #347a4d 68%, #4c9362);
        box-shadow: 0 14px 32px rgba(34, 92, 55, 0.18);
      }
      .hero small {
        color: #bddbc7;
        font-weight: 900;
      }
      .hero h2 {
        margin: 7px 0;
        font-size: 22px;
      }
      .hero p {
        margin: 0;
        color: #dcebe1;
        font-size: 13px;
        line-height: 1.65;
      }
      .hero > b {
        white-space: nowrap;
        padding: 10px 14px;
        border-radius: 99px;
        font-size: 12px;
      }
      .hero .good {
        background: #fff;
        color: #28623e;
      }
      .hero .warn {
        background: #fff2d7;
        color: #925a10;
      }
      .stats,
      .report-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 11px;
        margin-top: 13px;
      }
      .stats article,
      .report-grid article,
      .card {
        background: #fff;
        border: 1px solid #dfe7e1;
        border-radius: 17px;
        box-shadow: 0 8px 25px rgba(27, 71, 42, 0.045);
      }
      .stats article {
        padding: 18px;
      }
      .stats span,
      .stats small {
        display: block;
        color: #77837b;
        font-size: 11px;
      }
      .stats b {
        display: block;
        margin: 8px 0;
        color: #285c31;
        font-size: 24px;
      }
      .two {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 13px;
        margin-top: 13px;
      }
      .card {
        padding: 22px;
      }
      .wide {
        margin-top: 13px;
      }
      .title small {
        color: #378155;
        font-size: 9px;
        font-weight: 1000;
        letter-spacing: 0.12em;
      }
      .title h2 {
        margin: 4px 0 17px;
        font-size: 18px;
      }
      .trend {
        height: 230px;
        position: relative;
        padding: 22px 8px 0;
      }
      .trend-grid {
        position: absolute;
        inset: 20px 8px 36px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .trend-grid i {
        border-top: 1px dashed #e3e8e5;
      }
      .trend-bars {
        position: relative;
        height: 100%;
        display: flex;
        align-items: end;
        gap: 12px;
      }
      .trend-bars > div {
        height: 100%;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: end;
        align-items: center;
        min-width: 0;
      }
      .trend-bars > div > span {
        position: relative;
        width: min(34px, 70%);
        min-height: 6px;
        border-radius: 7px 7px 2px 2px;
        background: linear-gradient(#62ac79, #2d7249);
      }
      .trend-bars b {
        position: absolute;
        top: -18px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 10px;
        color: #285c31;
      }
      .trend-bars small {
        margin-top: 7px;
        color: #839087;
        font-size: 9px;
        white-space: nowrap;
      }
      .path {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 5px;
        position: relative;
        margin-top: 25px;
      }
      .path:before {
        content: "";
        position: absolute;
        top: 17px;
        left: 10%;
        right: 10%;
        height: 2px;
        background: #e2e9e4;
      }
      .path > div {
        text-align: center;
        position: relative;
        z-index: 1;
      }
      .path i {
        display: grid;
        place-items: center;
        width: 35px;
        height: 35px;
        margin: auto;
        border-radius: 50%;
        background: #eef2ef;
        color: #879188;
        font-style: normal;
        font-size: 11px;
        font-weight: 1000;
      }
      .path b,
      .path small {
        display: block;
      }
      .path b {
        font-size: 10px;
        margin-top: 8px;
      }
      .path small {
        font-size: 8px;
        color: #909a94;
        margin-top: 3px;
      }
      .path .done i {
        background: #347d50;
        color: #fff;
      }
      .path .now i {
        background: #e6a337;
        color: #fff;
        box-shadow: 0 0 0 5px #fff3dc;
      }
      .path .off {
        opacity: 0.45;
      }
      .compare {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .compare > div {
        padding: 17px;
        border-radius: 13px;
      }
      .compare span,
      .compare b,
      .compare small {
        display: block;
      }
      .compare span {
        font-size: 10px;
        font-weight: 900;
      }
      .compare b {
        font-size: 17px;
        margin: 8px 0;
      }
      .compare small {
        font-size: 11px;
      }
      .compare .strong {
        background: #edf7f0;
        color: #286642;
      }
      .compare .weak {
        background: #fff3e6;
        color: #935a1b;
      }
      blockquote {
        margin: 10px 0;
        padding: 17px;
        border: 0;
        border-left: 4px solid #6a9d73;
        border-radius: 0 12px 12px 0;
        background: #f5f8f5;
        color: #4f5d54;
        line-height: 1.8;
        font-size: 13px;
      }
      .comment-source {
        color: #8c9690;
        font-size: 10px;
      }
      .section-intro {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 3px 7px;
      }
      .section-intro h2 {
        font-size: 27px;
        margin: 5px 0;
      }
      .section-intro p {
        margin: 0;
        color: #77837b;
      }
      .section-intro > div:last-child {
        text-align: center;
        padding: 12px 20px;
        border-radius: 14px;
        background: #fff;
        border: 1px solid #dfe7e1;
      }
      .section-intro > div:last-child b,
      .section-intro > div:last-child span {
        display: block;
      }
      .section-intro > div:last-child b {
        font-size: 25px;
        color: #285c31;
      }
      .section-intro > div:last-child span {
        font-size: 9px;
        color: #839087;
      }
      .bars > div {
        margin: 13px 0;
      }
      .bars label {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        margin-bottom: 6px;
      }
      .bars label small {
        color: #929b95;
        font-weight: 400;
      }
      .bars i {
        display: block;
        height: 8px;
        border-radius: 9px;
        background: #edf1ee;
        overflow: hidden;
      }
      .bars i em {
        display: block;
        height: 100%;
        border-radius: 9px;
        background: linear-gradient(90deg, #69b17e, #2f754a);
      }
      .empty-small,
      .no-data {
        text-align: center;
        padding: 30px;
        color: #8a958e;
        font-size: 12px;
      }
      .exam-table {
        overflow: auto;
      }
      .exam-table > div {
        min-width: 760px;
        display: grid;
        grid-template-columns: minmax(240px, 1fr) 145px 90px 90px 1fr;
        align-items: center;
        padding: 13px;
        border-top: 1px solid #edf0ee;
        font-size: 12px;
      }
      .exam-table .thead {
        background: #f5f8f6;
        border: 0;
        border-radius: 9px;
        color: #79857d;
        font-size: 10px;
        font-weight: 900;
      }
      .exam-table b,
      .exam-table small {
        display: block;
      }
      .exam-table small {
        margin-top: 3px;
        color: #8c9690;
      }
      .exam-table strong {
        font-size: 15px;
        color: #285c31;
      }
      .generation {
        margin-top: 13px;
        padding: 15px 18px;
        border: 1px solid #edd5a6;
        background: #fff9ed;
        border-radius: 13px;
        display: flex;
        gap: 12px;
        align-items: center;
      }
      .generation > i {
        width: 11px;
        height: 11px;
        border-radius: 50%;
        background: #df941f;
        box-shadow: 0 0 0 5px #ffedc7;
      }
      .generation b,
      .generation span {
        display: block;
      }
      .generation b {
        color: #8a5713;
      }
      .generation span {
        margin-top: 3px;
        color: #92734a;
        font-size: 11px;
      }
      .cycle-list {
        display: grid;
        gap: 13px;
        margin-top: 13px;
      }
      .cycle {
        padding: 24px;
      }
      .cycle-head {
        display: flex;
        justify-content: space-between;
      }
      .cycle-head small {
        color: #87928b;
        font-size: 10px;
      }
      .cycle-head h3 {
        margin: 5px 0;
      }
      .cycle-head p {
        margin: 0;
        color: #78847c;
        font-size: 12px;
      }
      .cycle-head > b {
        height: max-content;
        padding: 8px 11px;
        border-radius: 99px;
        background: #edf6ef;
        color: #347149;
        font-size: 10px;
      }
      .session-list {
        margin-top: 24px;
        border-top: 1px solid #e8ede9;
      }
      .session-list > div {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 4px;
        border-bottom: 1px solid #eef1ef;
      }
      .session-list > div > i {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #d6ded8;
      }
      .session-list > div > i.done {
        background: #3e8858;
      }
      .session-list > div > i.now {
        background: #e4a037;
      }
      .session-list span {
        flex: 1;
      }
      .session-list b,
      .session-list small {
        display: block;
      }
      .session-list b {
        font-size: 12px;
      }
      .session-list small {
        color: #89948d;
        margin-top: 3px;
        font-size: 9px;
      }
      .session-list em {
        font-style: normal;
        font-size: 10px;
        color: #637068;
      }
      .report-cover {
        text-align: center;
        padding: 35px 20px 25px;
        background: #fff;
        border: 1px solid #dfe7e1;
        border-radius: 18px;
      }
      .report-cover img {
        display: block;
        width: 55px;
        margin: 0 auto 10px;
      }
      .report-cover h2 {
        margin: 8px 0;
        font-size: 27px;
        color: #285c31;
      }
      .report-cover p {
        margin: 0;
        color: #7f8a83;
      }
      .report-grid article {
        padding: 17px;
        text-align: center;
      }
      .report-grid span,
      .report-grid b {
        display: block;
      }
      .report-grid span {
        font-size: 10px;
        color: #818d85;
      }
      .report-grid b {
        margin-top: 8px;
        color: #285c31;
        font-size: 19px;
      }
      .narrative {
        margin-top: 13px;
      }
      .narrative h3 {
        font-size: 13px;
        color: #285c31;
        margin: 20px 0 6px;
      }
      .narrative p {
        color: #5e6a62;
        font-size: 12px;
        line-height: 1.85;
      }
      .state {
        max-width: 800px;
        margin: 60px auto;
        padding: 50px;
        text-align: center;
        background: #fff;
        border-radius: 18px;
      }
      .state button {
        background: #285c31;
        color: #fff;
      }
      footer {
        max-width: 1180px;
        margin: 20px auto 0;
        padding: 23px 0 40px;
        border-top: 1px solid #dbe3dd;
        display: flex;
        justify-content: space-between;
        color: #7a867e;
        font-size: 10px;
      }
      footer b {
        color: #285c31;
      }
      @media (max-width: 980px) {
        .header-inner {
          gap: 10px;
        }
        .brand {
          min-width: auto;
        }
        .header-inner nav button {
          padding: 0 10px;
        }
        .tools button:not(:last-child) {
          display: none;
        }
        .wrap {
          padding-left: 14px;
          padding-right: 14px;
        }
        .stats,
        .report-grid {
          grid-template-columns: 1fr 1fr;
        }
        .two {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 650px) {
        .header-inner {
          height: 66px;
          padding: 0 12px;
        }
        .brand span {
          display: none;
        }
        .brand img {
          width: 35px;
        }
        .brand b {
          font-size: 14px;
        }
        .header-inner nav {
          flex: 1;
          justify-content: center;
        }
        .header-inner nav button {
          padding: 0 7px;
          font-size: 10px;
        }
        .header-inner nav button.apply-nav {
          height: 34px;
          margin-left: 2px;
          padding: 0 7px;
        }
        .tools {
          margin-left: 0;
        }
        .tools button {
          font-size: 0;
          padding: 8px;
        }
        .tools button:last-child:after {
          content: "나가기";
          font-size: 10px;
        }
        .student-head {
          padding-top: 22px;
          align-items: start;
        }
        .student-head h1 {
          font-size: 24px;
        }
        .student-head select {
          min-width: 150px;
          max-width: 48%;
        }
        .one-child {
          display: none;
        }
        .hero {
          align-items: start;
          flex-direction: column;
          padding: 20px;
        }
        .hero h2 {
          font-size: 18px;
        }
        .stats {
          gap: 8px;
        }
        .stats article {
          padding: 14px;
        }
        .stats b {
          font-size: 20px;
        }
        .card {
          padding: 17px;
        }
        .path {
          overflow: auto;
        }
        .path > div {
          min-width: 58px;
        }
        .section-intro h2 {
          font-size: 23px;
        }
        .section-intro > div:last-child {
          display: none;
        }
        .exam-table > div {
          min-width: 650px;
        }
        .report-cover h2 {
          font-size: 22px;
        }
        .report-grid {
          gap: 8px;
        }
        footer {
          margin: 15px 14px;
          display: block;
          line-height: 1.7;
        }
        footer b {
          display: block;
          margin-top: 7px;
        }
      }
      @media print {
        body {
          background: #fff;
        }
        .portal > header,
        .student-head select,
        .one-child,
        .tools,
        footer {
          display: none !important;
        }
        .wrap {
          max-width: none;
          padding: 0;
        }
        .student-head {
          padding-top: 0;
        }
        .card,
        .stats article,
        .report-cover,
        .report-grid article {
          box-shadow: none;
          break-inside: avoid;
        }
        .hero {
          print-color-adjust: exact;
        }
        .two {
          break-inside: avoid;
        }
        .portal .wrap > * {
          display: none !important;
        }
        .portal .wrap > .student-head,
        .portal .wrap > .report-cover,
        .portal .wrap > .report-grid,
        .portal .wrap > .narrative,
        .portal .wrap > .report-detail {
          display: flex !important;
        }
        .portal .wrap > .report-cover,
        .portal .wrap > .narrative {
          display: block !important;
        }
        .portal .wrap > .report-grid {
          display: grid !important;
        }
        .portal .wrap > .report-detail {
          display: grid !important;
        }
      }
    `}</style>
  );
}
