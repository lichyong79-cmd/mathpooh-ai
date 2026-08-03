"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import "./student.css";
import "./exam-updates.css";
import "./sos-landmark.css";
import ExamResultDiagnosis from "@/components/exam-result-diagnosis";
import MATHPOOHLoader from "@/components/math-pooh-loader";
import SosLandmarkMap from "@/components/sos-landmark-map";
import {
  summarizeExamsForLandmark,
  type LandmarkSubject,
  type LandmarkSummary,
} from "@/lib/landmark";

type Attempt = {
  id: string;
  status: string;
  answers: Record<string, string>;
  started_at: string;
  score?: number;
  correct_count?: number;
  wrong_numbers?: number[];
  unanswered_numbers?: number[];
  submitted_at?: string;
};
type Exam = {
  id: string;
  title: string;
  exam_code: string;
  exam_date: string;
  grade: string;
  subject: string;
  exam_range: string;
  question_count: number;
  time_limit: number;
  total_score: number;
  objective_count: number;
  short_answer_count: number;
  test_url: string;
  available: boolean;
  download_available: boolean;
  download_available_at?: string | null;
  open_at?: string | null;
  close_at?: string | null;
  official_answers?: string[];
  question_metadata?: QuestionMetadata[];
  application_status: "none" | "requested" | "assigned";
  attempt: Attempt | null;
  percentile?: number | null;
  percentile_basis?: "cohort" | "estimated" | null;
  participants?: number;
};
type QuestionMetadata = {
  question_no: number;
  major_unit?: string;
  middle_unit?: string;
  minor_unit?: string;
  detailed_topic?: string;
  question_type?: string;
  problem_types?: string[];
  difficulty?: string;
};
type Portal = {
  student: {
    name: string;
    school: string;
    grade: string;
    passwordChanged: boolean;
  };
  exams: Exam[];
  landmark?: LandmarkSummary;
  posters: { id: string; title: string; image_url: string; link_url: string; sort_order: number }[];
};
type StudentSection = "home" | "apply" | "exams" | "strategy" | "analysis";

function StudentResultModal({
  exam,
  onClose,
}: {
  exam: Exam;
  onClose: () => void;
}) {
  const attempt = exam.attempt;
  const keys = exam.official_answers ?? [];
  const metadata = new Map(
    (exam.question_metadata ?? []).map((item) => [
      Number(item.question_no),
      item,
    ]),
  );
  if (!attempt) return null;
  return (
    <div className="student-result-backdrop" onMouseDown={onClose}>
      <section
        className="student-result-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <small>SOS 시험 결과</small>
            <h2>{exam.title}</h2>
            <p>
              {attempt.submitted_at
                ? `${new Date(attempt.submitted_at).toLocaleString("ko-KR")} 제출`
                : "제출 완료"}
            </p>
          </div>
          <div className="student-result-score">
            <b>{attempt.score ?? 0}</b>
            <span>점</span>
          </div>
          <button onClick={onClose}>×</button>
        </header>
        <div className="student-result-summary">
          <div>
            <span>정답</span>
            <b>{attempt.correct_count ?? 0}문항</b>
          </div>
          <div>
            <span>오답</span>
            <b>{attempt.wrong_numbers?.length ?? 0}문항</b>
          </div>
          <div>
            <span>미응답</span>
            <b>{attempt.unanswered_numbers?.length ?? 0}문항</b>
          </div>
        </div>
        <ExamResultDiagnosis
          questionCount={exam.question_count}
          answers={attempt.answers ?? {}}
          keys={keys}
          metadata={exam.question_metadata ?? []}
        />
        <div className="student-result-table-wrap">
          <div className="student-result-table">
            <div className="student-result-table-head">
              <span>문항</span>
              <span>단원</span>
              <span>문항 유형</span>
              <span>난이도</span>
              <span>내 답</span>
              <span>정답</span>
              <span>결과</span>
            </div>
            {Array.from({ length: exam.question_count }, (_, index) => {
              const no = index + 1;
              const answer = String(
                attempt.answers?.[no] ?? attempt.answers?.[String(no)] ?? "",
              );
              const key = String(keys[index] ?? "");
              const info = metadata.get(no);
              const state = !answer
                ? "blank"
                : answer === key
                  ? "correct"
                  : "wrong";
              return (
                <div className={`student-result-table-row ${state}`} key={no}>
                  <b>{no}번</b>
                  <span
                    title={[
                      info?.major_unit,
                      info?.middle_unit,
                      info?.minor_unit,
                    ]
                      .filter(Boolean)
                      .join(" > ")}
                  >
                    {info?.minor_unit ||
                      info?.middle_unit ||
                      info?.major_unit ||
                      "정보 없음"}
                  </span>
                  <span
                    title={
                      info?.problem_types?.join(", ") ||
                      info?.detailed_topic ||
                      info?.question_type
                    }
                  >
                    {info?.problem_types?.join(", ") ||
                      info?.detailed_topic ||
                      info?.question_type ||
                      "정보 없음"}
                  </span>
                  <span>
                    <i
                      className={`difficulty difficulty-${info?.difficulty || "none"}`}
                    >
                      {info?.difficulty ? `${info.difficulty}단계` : "-"}
                    </i>
                  </span>
                  <strong>{answer || "-"}</strong>
                  <strong>{key || "-"}</strong>
                  <em>
                    {state === "correct"
                      ? "정답"
                      : state === "wrong"
                        ? "오답"
                        : "미응답"}
                  </em>
                </div>
              );
            })}
          </div>
        </div>
        <footer>
          <button onClick={onClose}>닫기</button>
        </footer>
      </section>
    </div>
  );
}

export default function StudentHome() {
  const [portal, setPortal] = useState<Portal | null>(null);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState("");
  const [saveState, setSaveState] = useState("저장됨");
  const [error, setError] = useState("");
  const [resultExam, setResultExam] = useState<Exam | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedTower, setSelectedTower] = useState<LandmarkSubject | null>(null);
  const [activeSection, setActiveSection] = useState<StudentSection>("home");
  const [profileOpen, setProfileOpen] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/student/portal", { cache: "no-store" });
    if (response.status === 403) return window.location.replace("/admin");
    const data = await response.json();
    if (!response.ok)
      return setError(data.message || "학생 정보를 불러오지 못했습니다.");
    setPortal(data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const saved = window.localStorage.getItem("matspu-student-section") as StudentSection | null;
    if (saved && ["home", "apply", "exams", "strategy", "analysis"].includes(saved)) setActiveSection(saved);
  }, []);
  const moveSection = (section: StudentSection) => {
    setActiveSection(section);
    setMenuOpen(false);
    window.localStorage.setItem("matspu-student-section", section);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startExam = async (exam: Exam) => {
    if (!exam.available || !exam.test_url) return;
    setBusy("시험을 준비하고 있습니다...");
    const response = await fetch("/api/student/portal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start", examId: exam.id }),
    });
    const data = await response.json();
    setBusy("");
    if (!response.ok)
      return alert(data.message || "시험을 시작하지 못했습니다.");
    setActiveExam(exam);
    setAttempt(data.attempt);
    setAnswers(data.attempt.answers ?? {});
    const end = exam.close_at
      ? new Date(exam.close_at).getTime()
      : new Date(data.attempt.started_at).getTime() + exam.time_limit * 60_000;
    setRemaining(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
  };

  const changeApplication = async (
    exam: Exam,
    action: "request" | "cancel-request",
  ) => {
    if (busy) return;
    if (
      action === "cancel-request" &&
      !window.confirm("이 시험 신청을 취소할까요?")
    )
      return;
    setBusy(
      action === "request"
        ? "시험을 신청하고 있습니다..."
        : "시험 신청을 취소하고 있습니다...",
    );
    const response = await fetch("/api/student/portal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, examId: exam.id }),
    });
    const data = await response.json();
    setBusy("");
    if (!response.ok)
      return alert(data.message || "시험 신청을 처리하지 못했습니다.");
    await load();
  };

  const save = useCallback(
    async (silent = true) => {
      if (!activeExam || !attempt || attempt.status !== "in_progress") return;
      setSaveState("저장 중...");
      const response = await fetch("/api/student/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save",
          examId: activeExam.id,
          answers,
        }),
      });
      setSaveState(response.ok ? "자동 저장됨" : "저장 실패 · 다시 시도");
      if (!response.ok && !silent) alert("답안 저장에 실패했습니다.");
    },
    [activeExam, answers, attempt],
  );

  useEffect(() => {
    if (!activeExam || !attempt) return;
    const timer = window.setInterval(
      () => setRemaining((value) => Math.max(0, value - 1)),
      1000,
    );
    const autosave = window.setInterval(() => void save(), 10000);
    return () => {
      clearInterval(timer);
      clearInterval(autosave);
    };
  }, [activeExam, attempt, save]);

  const submit = useCallback(
    async (forced = false) => {
      if (!activeExam || !attempt || busy) return;
      const missing = Array.from(
        { length: activeExam.question_count },
        (_, index) => index + 1,
      ).filter((no) => !String(answers[no] ?? "").trim());
      if (
        !forced &&
        !window.confirm(
          missing.length
            ? `미입력 ${missing.length}문항이 있습니다. 그래도 최종 제출할까요?`
            : "답안을 최종 제출할까요? 제출 후에는 수정할 수 없습니다.",
        )
      )
        return;
      setBusy("답안을 제출하고 채점 중입니다...");
      const response = await fetch("/api/student/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          examId: activeExam.id,
          answers,
        }),
      });
      const data = await response.json();
      setBusy("");
      if (!response.ok) return alert(data.message || "제출에 실패했습니다.");
      alert(`제출 완료 · ${data.score}점`);
      setActiveExam(null);
      setAttempt(null);
      await load();
    },
    [activeExam, answers, attempt, busy, load],
  );
  useEffect(() => {
    if (activeExam && attempt && remaining === 0) void submit(true);
  }, [activeExam, attempt, remaining, submit]);

  const answered = useMemo(
    () =>
      activeExam
        ? Array.from(
            { length: activeExam.question_count },
            (_, i) => i + 1,
          ).filter((no) => String(answers[no] ?? "").trim()).length
        : 0,
    [activeExam, answers],
  );
  // SOS LANDMARK: 서버가 계산한 백분위 요약을 그대로 쓰고,
  // 아직 없으면 원점수 환산 추정값으로 화면을 만듭니다.
  const landmark = useMemo(
    () => portal?.landmark ?? summarizeExamsForLandmark(portal?.exams ?? []),
    [portal],
  );
  const todayTask = useMemo(() => {
    if (!portal) return null;
    const seoulDate = (value: Date | string) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value));
    const today = seoulDate(new Date());
    const todaysExam = portal.exams.find(
      (exam) =>
        seoulDate(exam.exam_date) === today &&
        exam.application_status === "assigned" &&
        exam.attempt?.status !== "submitted",
    );
    if (todaysExam) {
      return {
        kind: "exam",
        eyebrow: "TODAY'S MISSION",
        title: "오늘은 실전모의고사 보는 날이에요.",
        description: `${todaysExam.title} 응시 가능 시간을 확인하고 시험을 완료하세요.`,
        action: "실전모의고사 보기",
        section: "exams" as StudentSection,
      };
    }
    const submitted = portal.exams
      .filter((exam) => exam.attempt?.status === "submitted")
      .sort((a, b) =>
        String(b.attempt?.submitted_at ?? b.exam_date).localeCompare(
          String(a.attempt?.submitted_at ?? a.exam_date),
        ),
      );
    if (!submitted.length) {
      return {
        kind: "diagnosis",
        eyebrow: "NEXT STEP",
        title: "SOS 진단을 받으시기 바랍니다.",
        description: "진단을 통해 현재 부족한 개념과 문제 유형을 먼저 확인합니다.",
        action: "SOS 공략 확인",
        section: "strategy" as StudentSection,
      };
    }
    const latest = submitted[0];
    const submittedDate = new Date(latest.attempt?.submitted_at ?? latest.exam_date);
    const todayDate = new Date(`${today}T00:00:00+09:00`);
    const latestDate = new Date(`${seoulDate(submittedDate)}T00:00:00+09:00`);
    const daysSince = Math.max(0, Math.floor((todayDate.getTime() - latestDate.getTime()) / 86400000));
    if (daysSince <= 2) {
      return {
        kind: "diagnosis",
        eyebrow: "RESULT CHECK",
        title: "SOS 진단을 받으시기 바랍니다.",
        description: `${latest.title} 결과를 바탕으로 부족한 영역을 진단할 차례입니다.`,
        action: "진단 확인",
        section: "strategy" as StudentSection,
      };
    }
    return {
      kind: "training",
      eyebrow: "TRAINING DAY",
      title: "SOS 훈련을 하시기 바랍니다.",
      description: "진단 결과에 맞춰 배정된 훈련을 진행하고 취약 유형을 보완하세요.",
      action: "훈련 시작",
      section: "strategy" as StudentSection,
    };
  }, [portal]);
  const changeAnswer = (no: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [no]: value }));
    setSaveState("저장 대기");
  };
  const signOut = async () => {
    await createClient().auth.signOut();
    window.location.href = "/";
  };

  if (error)
    return (
      <main className="student-loading">
        <strong>{error}</strong>
        <button onClick={() => void signOut()}>다시 로그인</button>
      </main>
    );
  if (!portal)
    return (
      <main className="student-loading">
        <MATHPOOHLoader title="학생 페이지를 준비하고 있습니다..." kind="loading" compact />
      </main>
    );
  if (activeExam && attempt)
    return (
      <main className="exam-room">
        {busy ? (
          <MATHPOOHLoader
            title={busy}
            kind={busy.includes("채점") || busy.includes("성적") ? "grading" : "exam"}
            compact
          />
        ) : null}
        <header className="exam-room-head">
          <div>
            <b>MATHPOOH SOS</b>
            <strong>{activeExam.title}</strong>
          </div>
          <div className={`exam-timer ${remaining < 300 ? "danger" : ""}`}>
            <span>남은 시간</span>
            <b>
              {String(Math.floor(remaining / 60)).padStart(2, "0")}:
              {String(remaining % 60).padStart(2, "0")}
            </b>
          </div>
          <div className="save-box">
            <span>{saveState}</span>
            <button onClick={() => void save(false)}>지금 저장</button>
            <button className="submit-exam" onClick={() => void submit()}>
              최종 제출
            </button>
          </div>
        </header>
        <section className="exam-split">
          <div className="exam-paper">
            <iframe src={activeExam.test_url} title="시험지" />
          </div>
          <aside className="web-omr">
            <div className="omr-head">
              <div>
                <small>WEB OMR</small>
                <h2>답안 입력</h2>
              </div>
              <b>
                {answered}/{activeExam.question_count}
              </b>
            </div>
            <p className="omr-help">
              답안은 10초마다 자동 저장됩니다. 시험지를 보면서 오른쪽에 답을
              입력하세요.
            </p>
            <div className="omr-grid">
              {Array.from({ length: activeExam.question_count }, (_, index) => {
                const no = index + 1;
                const objective = no <= activeExam.objective_count;
                return (
                  <div
                    key={no}
                    className={`omr-row ${answers[no] ? "done" : "missing"}`}
                  >
                    <b>{no}</b>
                    {objective ? (
                      <div className="choice-row">
                        {[1, 2, 3, 4, 5].map((choice) => (
                          <button
                            key={choice}
                            className={
                              answers[no] === String(choice) ? "selected" : ""
                            }
                            onClick={() => changeAnswer(no, String(choice))}
                          >
                            {choice}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        inputMode="numeric"
                        value={answers[no] ?? ""}
                        onChange={(event) =>
                          changeAnswer(
                            no,
                            event.target.value
                              .replace(/[^0-9-]/g, "")
                              .slice(0, 5),
                          )
                        }
                        placeholder="정답"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        </section>
      </main>
    );
  return (
    <main className="student-portal">
      {busy ? (
        <MATHPOOHLoader
          title={busy}
          kind={busy.includes("채점") || busy.includes("성적") ? "grading" : "exam"}
          compact
        />
      ) : null}
      <header className="mp-site-header">
        <button className="mp-menu-button" onClick={() => setMenuOpen(true)} aria-label="메뉴 열기">
          <span /><span /><span />
        </button>
        <div className="mp-site-brand">
          <img src="/mathpooh-logo.png" alt="MATHPOOH" />
          <strong>MATHPOOH</strong>
        </div>
        <nav className="mp-main-nav" aria-label="학생 메뉴">
          <button className={activeSection === "home" ? "active" : ""} onClick={() => moveSection("home")}>나의SOS</button>
          <button className={activeSection === "exams" ? "active" : ""} onClick={() => moveSection("exams")}>실전모의고사</button>
          <button className={activeSection === "strategy" ? "active" : ""} onClick={() => moveSection("strategy")}>SOS 공략</button>
          <button className={activeSection === "analysis" ? "active" : ""} onClick={() => moveSection("analysis")}>학습분석</button>
        </nav>
        <div className="mp-header-actions">
          <button className="mp-apply-button" onClick={() => moveSection("apply")}><span aria-hidden="true">＋</span>SOS 신청</button>
          <div className="mp-profile-wrap">
            <button className="mp-profile-button" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen}>
              <span className="mp-user-mark" aria-hidden="true"><span className="mp-user-head" /><span className="mp-user-body" /></span>
              <strong>{portal.student.name}</strong>
              <i>⌄</i>
            </button>
            {profileOpen ? (
              <div className="mp-profile-menu">
                <button onClick={() => { setProfileOpen(false); window.location.href = "/password"; }}>비밀번호 변경</button>
                <button className="logout" onClick={() => void signOut()}>로그아웃</button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      {menuOpen ? <div className="mp-menu-backdrop" onClick={() => setMenuOpen(false)}>
        <aside className="mp-side-menu" onClick={(event) => event.stopPropagation()}>
          <div className="mp-side-menu-head">
            <div className="mp-site-brand"><img src="/mathpooh-logo.png" alt="" /><strong>MATHPOOH</strong></div>
            <button onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기">×</button>
          </div>
          <nav>
            <button className={activeSection === "home" ? "active" : ""} onClick={() => moveSection("home")}>나의SOS</button>
            <button className={activeSection === "exams" ? "active" : ""} onClick={() => moveSection("exams")}>실전모의고사</button>
            <button className={activeSection === "strategy" ? "active" : ""} onClick={() => moveSection("strategy")}>SOS 공략</button>
            <button className={activeSection === "analysis" ? "active" : ""} onClick={() => moveSection("analysis")}>학습분석</button>
            <button onClick={() => { setMenuOpen(false); window.location.href = "/password"; }}>비밀번호 변경</button>
          </nav>
          <button className="mp-menu-logout" onClick={() => void signOut()}>로그아웃</button>
        </aside>
      </div> : null}
      {activeSection === "home" ? (
        <>
          {todayTask ? (
            <section className={`student-today-task task-${todayTask.kind}`}>
              <div className="student-task-icon" aria-hidden="true">
                {todayTask.kind === "exam" ? "01" : todayTask.kind === "diagnosis" ? "02" : "03"}
              </div>
              <div className="student-task-copy">
                <small>{todayTask.eyebrow}</small>
                <h2>{todayTask.title}</h2>
                <p>{todayTask.description}</p>
              </div>
              <button onClick={() => moveSection(todayTask.section)}>{todayTask.action}</button>
            </section>
          ) : null}
          <SosLandmarkMap
            data={landmark}
            studentName={portal.student.name}
            onSelect={setSelectedTower}
          />
        </>
      ) : null}
      {selectedTower ? (
        <div className="sos-tower-modal-backdrop" onMouseDown={() => setSelectedTower(null)}>
          <section className="sos-tower-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <small>SOS LANDMARK</small>
                <h2>{selectedTower}</h2>
              </div>
              <button onClick={() => setSelectedTower(null)}>×</button>
            </header>
            <div className="sos-floor-grid">
              {Array.from({ length: 10 }, (_, index) => index + 1).map((floor) => {
                const active = floor <= landmark.subjects[selectedTower].floors;
                return (
                  <button
                    key={floor}
                    className={active ? "conquered" : "locked"}
                    onClick={() => moveSection("exams")}
                  >
                    <b>{floor}층</b>
                    <span>{active ? "완성" : `백분위 ${floor * 10 - 5} 필요`}</span>
                  </button>
                );
              })}
            </div>
            <p>
              {landmark.subjects[selectedTower].attempts
                ? `최고 백분위 ${landmark.subjects[selectedTower].best} · 최근 ${landmark.subjects[selectedTower].recent} · 응시 ${landmark.subjects[selectedTower].attempts}회 (${landmark.subjects[selectedTower].basis === "cohort" ? "응시자 기준 백분위" : "원점수 환산 백분위"})`
                : "아직 이 과목 실전모의고사 기록이 없습니다. 첫 응시부터 건물이 올라갑니다."}
            </p>
          </section>
        </div>
      ) : null}
      {activeSection !== "home" ? <header className={`student-hero section-${activeSection}`}>
        <div>
          <small>{activeSection === "apply" ? "SOS PROGRAM" : activeSection === "exams" ? "PRACTICE EXAM" : activeSection === "strategy" ? "SOS STRATEGY" : "LEARNING ANALYSIS"}</small>
          <h1>{activeSection === "apply" ? "SOS 신청하기" : activeSection === "exams" ? "실전모의고사" : activeSection === "strategy" ? "SOS 공략" : "학습분석"}</h1>
          <p>
            {activeSection === "apply" ? "필요한 SOS 프로그램과 새로운 안내를 확인하세요." : activeSection === "exams" ? "신청·배정된 실전모의고사를 확인하고 응시하세요." : activeSection === "strategy" ? "시험 결과를 바탕으로 나에게 필요한 공략을 훈련합니다." : "시험별 결과와 취약 단원, 성장 흐름을 확인합니다."}
          </p>
        </div>
      </header> : null}
      {activeSection === "exams" ? <section className="student-welcome">
        <div>
          <span>이번 주 목표</span>
          <h2>아래 점수부터 하나씩 확보합니다.</h2>
          <p>시험을 신청하고 배정이 완료되면 온라인으로 응시할 수 있습니다.</p>
        </div>
        <b>
          {
            portal.exams.filter(
              (exam) =>
                exam.application_status === "assigned" &&
                exam.attempt?.status !== "submitted",
            ).length
          }
          <small>배정 완료</small>
        </b>
      </section> : null}
      {activeSection === "apply" ? <section className="student-poster-section">
        <div className="student-list-heading"><div><i /><div><small>MATHPOOH SOS</small><h2>SOS 프로그램 신청·안내</h2></div></div><span>{portal.posters?.length ?? 0}개 안내</span></div>
        <div className="student-poster-grid">{portal.posters.map((poster) => {
          const content = <><img src={poster.image_url} alt={poster.title} /><div><strong>{poster.title}</strong><span>자세히 보기　→</span></div></>;
          return poster.link_url ? <a key={poster.id} href={poster.link_url} target="_blank" rel="noreferrer">{content}</a> : <article key={poster.id}>{content}</article>;
        })}</div>
        {!portal.posters?.length ? <div className="student-section-empty"><b>현재 신청 가능한 SOS 프로그램이 없습니다.</b><span>새 프로그램이 열리면 이곳에 표시됩니다.</span></div> : null}
      </section> : null}
      {activeSection === "exams" ? <section className="student-exam-list">
        <div className="student-list-heading"><div><i /> <div><small>MATHEMATICS PROGRAM</small><h2>실전모의고사 신청·응시</h2></div></div><span>{portal.exams.length}개 시험</span></div>
        {portal.exams.map((exam) => (
          <article key={exam.id}>
            <div className="exam-date">
              <b>{new Date(exam.exam_date).getDate()}</b>
              <span>
                {new Date(exam.exam_date).toLocaleDateString("ko-KR", {
                  month: "short",
                })}
              </span>
            </div>
            <div className="exam-info">
              <small>{exam.exam_code}</small>
              <h3>{exam.title}</h3>
              <p>
                {exam.subject} · {exam.question_count}문항 · {exam.time_limit}분
                {exam.open_at
                  ? ` · ${new Date(exam.open_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 시작`
                  : ""}
              </p>
            </div>
            <div className="exam-state">
              {exam.attempt?.status === "submitted" ? (
                <>
                  <b className="complete">제출 완료</b>
                  <strong>{exam.attempt.score}점</strong>
                  <button
                    className="student-result-button"
                    onClick={() => setResultExam(exam)}
                  >
                    결과 보기
                  </button>
                </>
              ) : exam.application_status === "none" ? (
                <>
                  <b>신청 가능</b>
                  <button
                    onClick={() => void changeApplication(exam, "request")}
                  >
                    시험 신청
                  </button>
                </>
              ) : exam.application_status === "requested" ? (
                <>
                  <b>배정 대기</b>
                  <button
                    onClick={() =>
                      void changeApplication(exam, "cancel-request")
                    }
                  >
                    신청 취소
                  </button>
                </>
              ) : (
                <>
                  <b>{exam.attempt ? "응시 중" : "배정 완료"}</b>
                  {exam.download_available && exam.test_url && !exam.attempt ? (
                    <a
                      className="exam-download"
                      href={exam.test_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      시험지 받기
                    </a>
                  ) : null}
                  <button
                    disabled={!exam.available || !exam.test_url}
                    onClick={() => void startExam(exam)}
                  >
                    {exam.attempt
                      ? "이어서 풀기"
                      : exam.available
                        ? "시험 시작"
                        : "응시시간 대기"}
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
        {portal.exams.length === 0 ? (
          <div className="student-empty">현재 신청 가능한 시험이 없습니다.</div>
        ) : null}
      </section> : null}
      {activeSection === "strategy" ? <section className="student-strategy-page">
        <div className="student-list-heading"><div><i /><div><small>PERSONALIZED TRAINING</small><h2>나의 SOS 공략</h2></div></div></div>
        <div className="strategy-summary">
          <article><span>분석 완료 시험</span><b>{portal.exams.filter((exam) => exam.attempt?.status === "submitted").length}회</b><small>제출한 시험 기준</small></article>
          <article><span>공략 준비 상태</span><b>{portal.exams.some((exam) => exam.attempt?.status === "submitted") ? "분석 가능" : "시험 필요"}</b><small>{portal.exams.some((exam) => exam.attempt?.status === "submitted") ? "진단·훈련 매칭을 준비합니다." : "실전모의고사 응시 후 생성됩니다."}</small></article>
        </div>
        <div className="student-section-empty strategy"><b>진단 3문항 → 부족하면 추가 3문항 → 훈련 10문항</b><span>관리자가 공략 문항을 배정하면 이곳에 문항과 진행률이 표시됩니다.</span><button onClick={() => moveSection("exams")}>실전모의고사 확인</button></div>
      </section> : null}
      {activeSection === "analysis" ? <section className="student-analysis-page">
        <div className="student-list-heading"><div><i /><div><small>SOS RESULT</small><h2>학습분석</h2></div></div><span>{portal.exams.filter((exam) => exam.attempt?.status === "submitted").length}회 응시</span></div>
        <div className="analysis-overview"><article><span>응시 완료</span><b>{portal.exams.filter((exam) => exam.attempt?.status === "submitted").length}회</b></article><article><span>평균 점수</span><b>{(() => { const done = portal.exams.filter((exam) => exam.attempt?.status === "submitted"); return done.length ? `${Math.round(done.reduce((sum, exam) => sum + Number(exam.attempt?.score ?? 0), 0) / done.length)}점` : "-"; })()}</b></article><article><span>최근 점수</span><b>{portal.exams.find((exam) => exam.attempt?.status === "submitted")?.attempt?.score ?? "-"}{portal.exams.some((exam) => exam.attempt?.status === "submitted") ? "점" : ""}</b></article></div>
        <div className="analysis-exam-list">{portal.exams.filter((exam) => exam.attempt?.status === "submitted").map((exam) => <button key={exam.id} onClick={() => setResultExam(exam)}><div><small>{exam.exam_date} · {exam.subject}</small><strong>{exam.title}</strong><span>{exam.attempt?.correct_count ?? 0}/{exam.question_count}문항 정답</span></div><b>{exam.attempt?.score ?? 0}점</b><i>상세 분석 →</i></button>)}</div>
        {!portal.exams.some((exam) => exam.attempt?.status === "submitted") ? <div className="student-section-empty"><b>아직 분석할 시험 결과가 없습니다.</b><span>실전모의고사를 제출하면 결과와 취약 영역이 자동으로 표시됩니다.</span><button onClick={() => moveSection("exams")}>시험 보러 가기</button></div> : null}
      </section> : null}
      {resultExam ? (
        <StudentResultModal
          exam={resultExam}
          onClose={() => setResultExam(null)}
        />
      ) : null}
      <footer className="mp-site-footer">
        <div><div className="mp-site-brand"><img src="/mathpooh-logo.png" alt="" /><strong>MATHPOOH</strong></div><b>© 2026 MATHPOOH</b></div>
        <p>MATHPOOH 수학연구소 · 학생용 SOS 학습 시스템</p>
        <span>이용약관　 개인정보처리방침</span>
      </footer>
    </main>
  );
}
