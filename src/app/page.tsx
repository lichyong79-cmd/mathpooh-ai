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
import { difficultyLabel } from "@/lib/difficulty-scale";

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
  solution_url?: string;
  solution_open?: boolean;
  solution_registered?: boolean;
  available: boolean;
  download_available: boolean;
  download_available_at?: string | null;
  open_at?: string | null;
  close_at?: string | null;
  paused_at?: string | null;
  paused_remaining_seconds?: number | null;
  official_answers?: string[];
  question_metadata?: QuestionMetadata[];
  application_status: "none" | "requested" | "assigned";
  attempt: Attempt | null;
  percentile?: number | null;
  percentile_basis?: "cohort" | "estimated" | null;
  participants?: number;
  mathpooh_comment?: string;
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
type StudentSection = "home" | "apply" | "exams" | "strategy" | "scores" | "learning";

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
  const [solutionGuideOpen, setSolutionGuideOpen] = useState(false);
  const [solutionAgreed, setSolutionAgreed] = useState(false);
  if (!attempt) return null;

  const questionRows = Array.from({ length: exam.question_count }, (_, index) => {
    const no = index + 1;
    const answer = String(attempt.answers?.[no] ?? attempt.answers?.[String(no)] ?? "");
    const key = String(keys[index] ?? "");
    const info = metadata.get(no);
    const difficulty = Number(info?.difficulty ?? 0) || null;
    const correct = Boolean(answer) && answer === key;
    const unanswered = !answer;
    const rawType = info?.problem_types?.join(", ") || info?.detailed_topic || info?.question_type || "정보 없음";
    const type = rawType.replace(/마코프\s*(체인|상태전이)?/gi, "상태변화 확률").replace(/Markov\s*(Chain|Transition)?/gi, "상태변화 확률").replace(/베이즈\s*(추론|네트워크)?/gi, "조건부확률");
    return { no, answer, key, info, difficulty, correct, unanswered, type };
  });
  const weights: Record<number, number> = {1:1,2:1.08,3:1.16,4:1.28,5:1.42,6:1.6,7:1.82,8:2.1};
  const totalWeight = questionRows.reduce((sum, item) => sum + (weights[item.difficulty ?? 0] ?? 1.2), 0);
  const earnedWeight = questionRows.reduce((sum, item) => sum + (item.correct ? (weights[item.difficulty ?? 0] ?? 1.2) : 0), 0);
  const weightedMastery = totalWeight ? (earnedWeight / totalWeight) * 100 : Number(attempt.score ?? 0);
  const abilityIndex = Math.max(0, Math.min(100, Number(attempt.score ?? 0) * 0.62 + weightedMastery * 0.38));
  const predictedPercentile = Math.max(1, Math.min(99, Math.round(100 / (1 + Math.exp(-(abilityIndex - 55) / 12)))));
  const predictedGrade = predictedPercentile >= 96 ? 1 : predictedPercentile >= 89 ? 2 : predictedPercentile >= 77 ? 3 : predictedPercentile >= 60 ? 4 : predictedPercentile >= 40 ? 5 : predictedPercentile >= 23 ? 6 : predictedPercentile >= 11 ? 7 : predictedPercentile >= 4 ? 8 : 9;
  const displayPercentile = Math.round(exam.percentile ?? predictedPercentile);
  const topRate = Math.max(1, 100 - displayPercentile);
  const recommended = questionRows.filter((item) => !item.correct).sort((a, b) => (a.difficulty ?? 99) - (b.difficulty ?? 99) || a.no - b.no).slice(0, 5);

  const openSolution = () => {
    if (!exam.solution_url || !solutionAgreed) return;
    window.open(exam.solution_url, "_blank", "noopener,noreferrer");
    setSolutionGuideOpen(false);
    setSolutionAgreed(false);
  };

  return (
    <div className="student-result-backdrop" onMouseDown={onClose}>
      <section
        className="student-result-modal premium"
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
        <section className="student-premium-overview">
          <div className="student-premium-score"><small>총점</small><b>{attempt.score ?? 0}</b><span>점</span></div>
          <div><small>전국 예상등급</small><b>{predictedGrade}등급</b><span>백분위 {displayPercentile}</span></div>
          <div><small>전국 예상 위치</small><b>상위 약 {topRate}%</b><span>난이도 보정 추정</span></div>
          <div><small>응시자</small><b>{exam.participants ?? "-"}</b><span>명</span></div>
        </section>
        <section className="student-percentile-card">
          <div><span>전국단위 예상 백분위</span><strong>{displayPercentile}</strong><p>예상 {predictedGrade}등급 · 상위 약 {topRate}%</p></div>
          <i><em style={{ width: `${displayPercentile}%` }} /></i>
          <small>※ 공식 전국 통계가 아닌 총점·문항 난이도 기반 추정치입니다.</small>
        </section>
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
        <section className="student-recommend-card">
          <div><small>NEXT REVIEW</small><h3>우선 복습 추천 5문항</h3><p>오답·미응답 중 쉬운 순서대로 제시합니다.</p></div>
          {recommended.length ? <div className="student-recommend-list">{recommended.map((item, index) => <article key={item.no}><span>{index + 1}</span><b>{item.no}번</b><strong>{item.info?.minor_unit || item.info?.middle_unit || item.info?.major_unit || "단원 미분류"}</strong><small>{item.type}</small><em>{item.difficulty ? difficultyLabel(item.difficulty) : "난이도 미분류"}</em></article>)}</div> : <p className="student-perfect-message">추천할 오답 문항이 없습니다.</p>}
        </section>
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
                    {questionRows[no - 1]?.type || "정보 없음"}
                  </span>
                  <span>
                    <i
                      className={`difficulty difficulty-${info?.difficulty || "none"}`}
                    >
                      {info?.difficulty ? difficultyLabel(info.difficulty) : "-"}
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
        <section className="student-mathpooh-comment"><small>MATHPOOH COMMENT</small><h3>매쓰푸의 코멘트</h3><p>{exam.mathpooh_comment || "아직 등록된 코멘트가 없습니다."}</p></section>
        <footer className="student-result-actions">
          {exam.solution_url && exam.solution_open ? (
            <button
              type="button"
              className="student-solution-button"
              onClick={() => {
                setSolutionAgreed(false);
                setSolutionGuideOpen(true);
              }}
            >
              해설지 보기
            </button>
          ) : (
            <div className="student-solution-locked">
              <button type="button" className="student-solution-button" disabled>해설지 보기</button>
              <span>{exam.solution_registered ? "관리자가 아직 해설을 공개하지 않았습니다." : "등록된 해설지가 없습니다."}</span>
            </div>
          )}
          <button onClick={onClose}>닫기</button>
        </footer>
        {solutionGuideOpen ? (
          <div className="student-consent-backdrop" onMouseDown={() => setSolutionGuideOpen(false)}>
            <section className="student-consent-modal" onMouseDown={(event) => event.stopPropagation()}>
              <div className="student-consent-icon">📖</div>
              <small>해설 확인 안내</small>
              <h3>해설을 보기 전에 스스로 다시 풀어보세요.</h3>
              <p>본 해설은 복습을 위한 자료입니다. 외부 도움이나 자료를 이용하기 전에 자신의 힘으로 다시 한번 해결해 보시기 바랍니다.</p>
              <label className="student-consent-check">
                <input
                  type="checkbox"
                  checked={solutionAgreed}
                  onChange={(event) => setSolutionAgreed(event.target.checked)}
                />
                <span>위 내용을 확인했으며, 스스로 다시 풀어본 후 해설을 확인하겠습니다.</span>
              </label>
              <div className="student-consent-actions">
                <button type="button" className="secondary" onClick={() => setSolutionGuideOpen(false)}>취소</button>
                <button type="button" disabled={!solutionAgreed} onClick={openSolution}>동의하고 해설 보기</button>
              </div>
            </section>
          </div>
        ) : null}
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
  const [examPaused, setExamPaused] = useState(false);
  const [busy, setBusy] = useState("");
  const [saveState, setSaveState] = useState("저장됨");
  const [error, setError] = useState("");
  const [resultExam, setResultExam] = useState<Exam | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedTower, setSelectedTower] = useState<LandmarkSubject | null>(null);
  const [activeSection, setActiveSection] = useState<StudentSection>("home");
  const [profileOpen, setProfileOpen] = useState(false);
  const [examConsent, setExamConsent] = useState<Exam | null>(null);
  const [examConsentChecked, setExamConsentChecked] = useState(false);
  const [waitingExam, setWaitingExam] = useState<Exam | null>(null);
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
    if (saved && ["home", "apply", "exams", "strategy", "scores", "learning"].includes(saved)) setActiveSection(saved);
  }, []);
  const moveSection = (section: StudentSection) => {
    setActiveSection(section);
    setMenuOpen(false);
    window.localStorage.setItem("matspu-student-section", section);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const requestStartExam = (exam: Exam) => {
    if (exam.attempt) {
      void startExam(exam);
      return;
    }
    const consentKey = `mathpooh-exam-consent:${exam.id}`;
    if (window.sessionStorage.getItem(consentKey) === "yes") {
      if (!exam.close_at) setWaitingExam(exam);
      else void startExam(exam);
      return;
    }
    setExamConsentChecked(false);
    setExamConsent(exam);
  };

  const confirmStartExam = async () => {
    if (!examConsent || !examConsentChecked) return;
    const exam = examConsent;
    window.sessionStorage.setItem(`mathpooh-exam-consent:${exam.id}`, "yes");
    await fetch("/api/student/portal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "activity-log", examId: exam.id, eventType: "exam_consent", detail: "응시 안내 동의" }),
      keepalive: true,
    });
    setExamConsent(null);
    setExamConsentChecked(false);
    if (!exam.close_at) {
      await fetch("/api/student/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "activity-log", examId: exam.id, eventType: "exam_waiting", detail: "관리자 시험 시작 대기" }),
        keepalive: true,
      });
      setWaitingExam(exam);
      return;
    }
    void startExam(exam);
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
    setExamPaused(Boolean(exam.paused_at));
    setAttempt(data.attempt);
    setAnswers(data.attempt.answers ?? {});
    const end = exam.close_at
      ? new Date(exam.close_at).getTime()
      : new Date(data.attempt.started_at).getTime() + exam.time_limit * 60_000;
    setRemaining(exam.paused_at
      ? Number(exam.paused_remaining_seconds ?? 0)
      : Math.max(0, Math.ceil((end - Date.now()) / 1000)));
  };

  useEffect(() => {
    if (!waitingExam) return;
    const check = async () => {
      const response = await fetch("/api/student/portal", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const current = (data.exams ?? []).find((item: Exam) => item.id === waitingExam.id);
      if (!current) return;
      setPortal(data);
      if (current.close_at && !current.paused_at && new Date(current.close_at).getTime() > Date.now()) {
        setWaitingExam(null);
        void startExam(current);
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 2000);
    return () => window.clearInterval(timer);
  }, [waitingExam?.id]);

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
      if (!activeExam || !attempt || attempt.status !== "in_progress" || examPaused) return;
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
    [activeExam, answers, attempt, examPaused],
  );

  useEffect(() => {
    if (!activeExam || !attempt) return;
    const timer = window.setInterval(
      () => { if (!examPaused) setRemaining((value) => Math.max(0, value - 1)); },
      1000,
    );
    const autosave = window.setInterval(() => void save(), 10000);
    return () => {
      clearInterval(timer);
      clearInterval(autosave);
    };
  }, [activeExam, attempt, save, examPaused]);

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
    if (!activeExam || !attempt) return;
    const sync = window.setInterval(async () => {
      const response = await fetch("/api/student/portal", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const current = (data.exams ?? []).find((exam: Exam) => exam.id === activeExam.id);
      if (!current) return;
      if (current.attempt?.status === "submitted") {
        window.clearInterval(sync);
        alert("관리자에 의해 시험이 종료되어 현재 답안이 제출되었습니다.");
        setActiveExam(null);
        setAttempt(null);
        setExamPaused(false);
        setPortal(data);
        return;
      }
      const paused = Boolean(current.paused_at);
      setExamPaused(paused);
      setActiveExam(current);
      if (paused) setRemaining(Number(current.paused_remaining_seconds ?? remaining));
      else if (current.close_at) setRemaining(Math.max(0, Math.ceil((new Date(current.close_at).getTime() - Date.now()) / 1000)));
    }, 3000);
    return () => window.clearInterval(sync);
  }, [activeExam?.id, attempt?.id]);

  useEffect(() => {
    if (activeExam && attempt && !examPaused && remaining === 0) void submit(true);
  }, [activeExam, attempt, examPaused, remaining, submit]);

  useEffect(() => {
    if (!activeExam || !attempt || attempt.status !== "in_progress") return;
    let hiddenAt = 0;
    const log = (eventType: string, detail = "") => {
      void fetch("/api/student/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "activity-log", examId: activeExam.id, eventType, detail }),
        keepalive: true,
      });
    };
    const onVisibility = () => {
      if (document.hidden) { hiddenAt = Date.now(); log("page_hidden", "시험 화면 이탈"); }
      else {
        const seconds = hiddenAt ? Math.max(1, Math.round((Date.now() - hiddenAt) / 1000)) : 0;
        log("page_visible", seconds ? `${seconds}초 후 복귀` : "시험 화면 복귀");
        hiddenAt = 0;
      }
    };
    const onBlur = () => log("window_blur", "브라우저 포커스 이탈");
    const onFocus = () => log("window_focus", "브라우저 포커스 복귀");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    log("exam_room_open", "응시 화면 진입");
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [activeExam?.id, attempt?.id]);

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
  const submittedExams = useMemo(() =>
    (portal?.exams ?? [])
      .filter((exam) => exam.attempt?.status === "submitted")
      .sort((a, b) => String(b.attempt?.submitted_at ?? b.exam_date).localeCompare(String(a.attempt?.submitted_at ?? a.exam_date))),
    [portal],
  );
  const scoreAverage = submittedExams.length
    ? Math.round(submittedExams.reduce((sum, exam) => sum + Number(exam.attempt?.score ?? 0), 0) / submittedExams.length)
    : 0;
  const recentScore = Number(submittedExams[0]?.attempt?.score ?? 0);
  const bestScore = submittedExams.length ? Math.max(...submittedExams.map((exam) => Number(exam.attempt?.score ?? 0))) : 0;
  const subjectCards = (["대수", "미적분1", "확률과통계"] as LandmarkSubject[]).map((subject) => ({
    subject,
    floor: landmark.subjects?.[subject]?.floors ?? 0,
    best: landmark.subjects?.[subject]?.best ?? 0,
    attempts: landmark.subjects?.[subject]?.attempts ?? 0,
  }));
  const changeAnswer = (no: number, value: string) => {
    if (examPaused) return;
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
  if (waitingExam)
    return (
      <main className="exam-waiting-room">
        <section>
          <div className="waiting-pulse"><i /><i /><i /></div>
          <small>MATHPOOH SOS · 시험 대기실</small>
          <h1>{waitingExam.title}</h1>
          <strong>시험 시작을 기다리고 있습니다.</strong>
          <p>관리자가 시험을 시작하면 별도의 새로고침 없이 자동으로 시험 화면이 열립니다.</p>
          <div><span>응시 동의 완료</span><b>대기 중</b></div>
          <button type="button" onClick={() => setWaitingExam(null)}>시험 목록으로 돌아가기</button>
        </section>
      </main>
    );
  if (activeExam && attempt)
    return (
      <main className={`exam-room ${examPaused ? "is-paused" : ""}`}>
        {examPaused ? (
          <div className="exam-pause-overlay">
            <section>
              <strong>시험이 일시정지되었습니다.</strong>
              <p>관리자가 시험을 재개할 때까지 기다려 주세요. 남은 시간과 입력한 답안은 그대로 유지됩니다.</p>
            </section>
          </div>
        ) : null}
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
            <button onClick={() => void save(false)} disabled={examPaused}>지금 저장</button>
            <button className="submit-exam" onClick={() => void submit()} disabled={examPaused}>
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
                            disabled={examPaused}
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
                        disabled={examPaused}
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
          <button className={activeSection === "scores" ? "active" : ""} onClick={() => moveSection("scores")}>성적분석</button>
          <button className={activeSection === "learning" ? "active" : ""} onClick={() => moveSection("learning")}>학습분석</button>
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
            <button className={activeSection === "scores" ? "active" : ""} onClick={() => moveSection("scores")}>성적분석</button>
          <button className={activeSection === "learning" ? "active" : ""} onClick={() => moveSection("learning")}>학습분석</button>
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
          <section className="student-home-grid">
            <article className="student-home-card recent-score-card">
              <div><small>RECENT SCORE</small><h3>최근 성적</h3></div>
              {submittedExams.length ? <><strong>{recentScore}<span>점</span></strong><p>평균 {scoreAverage}점 · 최고 {bestScore}점</p><button onClick={() => moveSection("scores")}>성적표 확인</button></> : <><strong>-</strong><p>첫 시험을 완료하면 성적이 표시됩니다.</p><button onClick={() => moveSection("exams")}>시험 확인</button></>}
            </article>
            <article className="student-home-card progress-card">
              <div><small>MY PROGRESS</small><h3>나의 성장</h3></div>
              <strong>{submittedExams.length}<span>회</span></strong><p>완료한 실전모의고사</p><button onClick={() => moveSection("learning")}>성장 리포트</button>
            </article>
            <article className="student-home-card strategy-card">
              <div><small>NEXT MISSION</small><h3>다음 공략</h3></div>
              <strong>{todayTask?.kind === "exam" ? "시험" : todayTask?.kind === "diagnosis" ? "진단" : "훈련"}</strong><p>{todayTask?.title ?? "오늘의 학습을 확인하세요."}</p><button onClick={() => moveSection(todayTask?.section ?? "strategy")}>바로 시작</button>
            </article>
          </section>
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
          <small>{activeSection === "apply" ? "SOS PROGRAM" : activeSection === "exams" ? "PRACTICE EXAM" : activeSection === "strategy" ? "SOS STRATEGY" : activeSection === "scores" ? "SCORE REPORT" : "LEARNING ANALYSIS"}</small>
          <h1>{activeSection === "apply" ? "SOS 신청하기" : activeSection === "exams" ? "실전모의고사" : activeSection === "strategy" ? "SOS 공략" : activeSection === "scores" ? "성적분석" : "학습분석"}</h1>
          <p>
            {activeSection === "apply" ? "필요한 SOS 프로그램과 새로운 안내를 확인하세요." : activeSection === "exams" ? "신청·배정된 실전모의고사를 확인하고 응시하세요." : activeSection === "strategy" ? "시험 결과를 바탕으로 나에게 필요한 공략을 훈련합니다." : activeSection === "scores" ? "시험별 성적표와 예상등급, 추천문항을 확인합니다." : "진단·훈련·시험의 누적 성장 흐름을 확인합니다."}
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
                    onClick={() => requestStartExam(exam)}
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
      {activeSection === "scores" ? <section className="student-score-page student-app-page">
        <div className="student-page-intro"><div><small>PREMIUM SCORE REPORT</small><h2>나의 시험별 성적표</h2><p>시험을 선택하면 총점, 예상등급, 영역별 분석과 추천문항을 확인할 수 있습니다.</p></div><div className="student-kpi"><span>응시 완료</span><b>{submittedExams.length}</b><em>회</em></div></div>
        <div className="student-score-summary">
          <article><span>최근 점수</span><b>{submittedExams.length ? recentScore : "-"}{submittedExams.length ? <small>점</small> : null}</b></article>
          <article><span>전체 평균</span><b>{submittedExams.length ? scoreAverage : "-"}{submittedExams.length ? <small>점</small> : null}</b></article>
          <article><span>최고 점수</span><b>{submittedExams.length ? bestScore : "-"}{submittedExams.length ? <small>점</small> : null}</b></article>
        </div>
        <div className="student-score-cards">{submittedExams.map((exam) => <button key={exam.id} onClick={() => setResultExam(exam)}>
          <div className="score-card-date"><b>{new Date(exam.exam_date).getDate()}</b><span>{new Date(exam.exam_date).toLocaleDateString("ko-KR", { month: "short" })}</span></div>
          <div className="score-card-copy"><small>{exam.exam_code} · {exam.subject}</small><h3>{exam.title}</h3><p>{exam.attempt?.correct_count ?? 0}/{exam.question_count} 정답 · 오답 {(exam.attempt?.wrong_numbers ?? []).length} · 미응답 {(exam.attempt?.unanswered_numbers ?? []).length}</p></div>
          <div className="score-card-score"><strong>{exam.attempt?.score ?? 0}<span>점</span></strong><em>성적표 보기 →</em></div>
        </button>)}</div>
        {!submittedExams.length ? <div className="student-section-empty"><b>아직 성적표가 없습니다.</b><span>실전모의고사를 제출하면 이곳에 시험별 성적표가 생성됩니다.</span><button onClick={() => moveSection("exams")}>시험 확인하기</button></div> : null}
      </section> : null}
      {activeSection === "learning" ? <section className="student-learning-page student-app-page">
        <div className="student-page-intro learning"><div><small>LONG-TERM LEARNING REPORT</small><h2>나의 학습 성장 리포트</h2><p>시험 점수만이 아니라 진단·훈련·완성도의 장기 변화를 확인합니다.</p></div><div className="student-kpi"><span>현재 성장지수</span><b>{Math.round((scoreAverage + Math.min(100, submittedExams.length * 8)) / 2) || 0}</b><em>LV</em></div></div>
        <div className="student-learning-hero">
          <article><small>누적 응시</small><strong>{submittedExams.length}<span>회</span></strong><p>실전 데이터가 쌓일수록 분석이 정교해집니다.</p></article>
          <article><small>최근 변화</small><strong>{submittedExams.length > 1 ? `${recentScore - Number(submittedExams[1]?.attempt?.score ?? 0) >= 0 ? "+" : ""}${recentScore - Number(submittedExams[1]?.attempt?.score ?? 0)}` : "-"}<span>{submittedExams.length > 1 ? "점" : ""}</span></strong><p>직전 시험 대비 변화</p></article>
          <article><small>공략 준비</small><strong>{submittedExams.length ? "READY" : "WAIT"}</strong><p>{submittedExams.length ? "진단 3문항과 훈련 10문항을 연결할 수 있습니다." : "첫 시험 후 SOS 전략이 시작됩니다."}</p></article>
        </div>
        <section className="student-mastery-panel"><div className="panel-title"><div><small>SUBJECT MASTERY</small><h3>과목별 완성도</h3></div><span>랜드마크 데이터 연동</span></div>
          <div className="mastery-list">{subjectCards.map((item) => <article key={item.subject}><div><b>{item.subject}</b><span>{item.attempts}회 응시</span></div><div className="mastery-track"><i style={{ width: `${Math.min(100, item.best)}%` }} /></div><strong>{item.best}<small>%</small></strong></article>)}</div>
        </section>
        <section className="student-growth-panel"><div className="panel-title"><div><small>SCORE HISTORY</small><h3>최근 시험 흐름</h3></div><button onClick={() => moveSection("scores")}>성적표 보기</button></div>
          <div className="growth-bars">{submittedExams.slice(0, 8).reverse().map((exam) => <article key={exam.id}><div><i style={{ height: `${Math.max(8, Number(exam.attempt?.score ?? 0))}%` }} /></div><b>{exam.attempt?.score ?? 0}</b><span>{new Date(exam.exam_date).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</span></article>)}</div>
          {!submittedExams.length ? <p className="empty-growth">시험 결과가 쌓이면 점수 변화 그래프가 표시됩니다.</p> : null}
        </section>
        <section className="student-next-plan"><div><small>NEXT STRATEGY</small><h3>다음 학습 전략</h3><p>{submittedExams.length ? "최근 오답 중 쉬운 문항부터 진단하고, 확인된 취약 유형을 10문항 훈련으로 연결하세요." : "실전모의고사를 먼저 응시해 현재 위치를 확인하세요."}</p></div><button onClick={() => moveSection(submittedExams.length ? "strategy" : "exams")}>{submittedExams.length ? "SOS 공략으로 이동" : "시험 확인"}</button></section>
      </section> : null}
      {examConsent ? (
        <div className="student-consent-backdrop" onMouseDown={() => setExamConsent(null)}>
          <section className="student-consent-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="student-consent-icon">✓</div>
            <small>실전모의고사 응시 안내</small>
            <h3>현재 실력을 정확하게 확인하기 위한 시험입니다.</h3>
            <ul>
              <li>외부 도움이나 자료를 이용하지 않고 본인의 힘으로 응시합니다.</li>
              <li>다른 사람의 도움을 받지 않습니다.</li>
              <li>인터넷 검색이나 참고자료를 이용하지 않습니다.</li>
              <li>현재 자신의 실력을 확인하기 위해 성실하게 응시합니다.</li>
            </ul>
            <p className="student-consent-warning">외부 도움을 이용하거나 응시 과정의 신뢰성이 확보되지 않는 경우, 시험 결과는 무효 처리되거나 재응시 대상이 될 수 있습니다.</p>
            <label className="student-consent-check">
              <input
                type="checkbox"
                checked={examConsentChecked}
                onChange={(event) => setExamConsentChecked(event.target.checked)}
              />
              <span>위 내용을 확인하였으며 이에 동의합니다.</span>
            </label>
            <div className="student-consent-actions">
              <button type="button" className="secondary" onClick={() => setExamConsent(null)}>취소</button>
              <button type="button" disabled={!examConsentChecked} onClick={confirmStartExam}>동의하고 시험 시작</button>
            </div>
          </section>
        </div>
      ) : null}
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
