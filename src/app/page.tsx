"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import "./student.css";

type Attempt = { id: string; status: string; answers: Record<string, string>; started_at: string; score?: number; correct_count?: number };
type Exam = { id: string; title: string; exam_code: string; exam_date: string; grade: string; subject: string; exam_range: string; question_count: number; time_limit: number; total_score: number; objective_count: number; short_answer_count: number; test_url: string; available: boolean; attempt: Attempt | null };
type Portal = { student: { name: string; school: string; grade: string; passwordChanged: boolean }; exams: Exam[] };

export default function StudentHome() {
  const [portal, setPortal] = useState<Portal | null>(null);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState("");
  const [saveState, setSaveState] = useState("저장됨");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/student/portal", { cache: "no-store" });
    if (response.status === 403) return window.location.replace("/admin");
    const data = await response.json();
    if (!response.ok) return setError(data.message || "학생 정보를 불러오지 못했습니다.");
    setPortal(data);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const startExam = async (exam: Exam) => {
    if (!exam.available || !exam.test_url) return;
    setBusy("시험을 준비하고 있습니다...");
    const response = await fetch("/api/student/portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", examId: exam.id }) });
    const data = await response.json();
    setBusy("");
    if (!response.ok) return alert(data.message || "시험을 시작하지 못했습니다.");
    setActiveExam(exam); setAttempt(data.attempt); setAnswers(data.attempt.answers ?? {});
    const end = new Date(data.attempt.started_at).getTime() + exam.time_limit * 60_000;
    setRemaining(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
  };

  const save = useCallback(async (silent = true) => {
    if (!activeExam || !attempt || attempt.status !== "in_progress") return;
    setSaveState("저장 중...");
    const response = await fetch("/api/student/portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", examId: activeExam.id, answers }) });
    setSaveState(response.ok ? "자동 저장됨" : "저장 실패 · 다시 시도");
    if (!response.ok && !silent) alert("답안 저장에 실패했습니다.");
  }, [activeExam, answers, attempt]);

  useEffect(() => {
    if (!activeExam || !attempt) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    const autosave = window.setInterval(() => void save(), 10000);
    return () => { clearInterval(timer); clearInterval(autosave); };
  }, [activeExam, attempt, save]);

  const submit = useCallback(async (forced = false) => {
    if (!activeExam || !attempt || busy) return;
    const missing = Array.from({ length: activeExam.question_count }, (_, index) => index + 1).filter((no) => !String(answers[no] ?? "").trim());
    if (!forced && !window.confirm(missing.length ? `미입력 ${missing.length}문항이 있습니다. 그래도 최종 제출할까요?` : "답안을 최종 제출할까요? 제출 후에는 수정할 수 없습니다.")) return;
    setBusy("답안을 제출하고 채점 중입니다...");
    const response = await fetch("/api/student/portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "submit", examId: activeExam.id, answers }) });
    const data = await response.json(); setBusy("");
    if (!response.ok) return alert(data.message || "제출에 실패했습니다.");
    alert(`제출 완료 · ${data.score}점`); setActiveExam(null); setAttempt(null); await load();
  }, [activeExam, answers, attempt, busy, load]);
  useEffect(() => { if (activeExam && attempt && remaining === 0) void submit(true); }, [activeExam, attempt, remaining, submit]);

  const answered = useMemo(() => activeExam ? Array.from({ length: activeExam.question_count }, (_, i) => i + 1).filter((no) => String(answers[no] ?? "").trim()).length : 0, [activeExam, answers]);
  const changeAnswer = (no: number, value: string) => { setAnswers((prev) => ({ ...prev, [no]: value })); setSaveState("저장 대기"); };
  const signOut = async () => { await createClient().auth.signOut(); window.location.href = "/login"; };

  if (error) return <main className="student-loading"><strong>{error}</strong><button onClick={() => void signOut()}>다시 로그인</button></main>;
  if (!portal) return <main className="student-loading"><strong>SOS 학생 페이지를 불러오는 중...</strong></main>;
  if (activeExam && attempt) return <main className="exam-room">
    {busy ? <div className="student-busy"><div><b>{busy}</b><span>화면을 닫지 말고 잠시 기다려 주세요.</span></div></div> : null}
    <header className="exam-room-head"><div><b>MATSPU SOS</b><strong>{activeExam.title}</strong></div><div className={`exam-timer ${remaining < 300 ? "danger" : ""}`}><span>남은 시간</span><b>{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</b></div><div className="save-box"><span>{saveState}</span><button onClick={() => void save(false)}>지금 저장</button><button className="submit-exam" onClick={() => void submit()}>최종 제출</button></div></header>
    <section className="exam-split"><div className="exam-paper"><iframe src={activeExam.test_url} title="시험지" /></div><aside className="web-omr"><div className="omr-head"><div><small>WEB OMR</small><h2>답안 입력</h2></div><b>{answered}/{activeExam.question_count}</b></div><p className="omr-help">답안은 10초마다 자동 저장됩니다. 시험지를 보면서 오른쪽에 답을 입력하세요.</p><div className="omr-grid">{Array.from({ length: activeExam.question_count }, (_, index) => {
      const no = index + 1; const objective = no <= activeExam.objective_count;
      return <div key={no} className={`omr-row ${answers[no] ? "done" : "missing"}`}><b>{no}</b>{objective ? <div className="choice-row">{[1,2,3,4,5].map((choice) => <button key={choice} className={answers[no] === String(choice) ? "selected" : ""} onClick={() => changeAnswer(no, String(choice))}>{choice}</button>)}</div> : <input inputMode="numeric" value={answers[no] ?? ""} onChange={(event) => changeAnswer(no, event.target.value.replace(/[^0-9-]/g, "").slice(0, 5))} placeholder="정답" />}</div>;
    })}</div></aside></section>
  </main>;
  return <main className="student-portal"><header className="student-hero"><div><small>MATSPU SOS</small><h1>{portal.student.name} 학생</h1><p>{portal.student.school} · {portal.student.grade}</p></div><div><button onClick={() => window.location.href = "/password"}>비밀번호 변경</button><button onClick={() => void signOut()}>로그아웃</button></div></header><section className="student-welcome"><div><span>이번 주 목표</span><h2>아래 점수부터 하나씩 확보합니다.</h2><p>응시 가능한 실전모의고사를 확인하고 제한시간 안에 답안을 제출하세요.</p></div><b>{portal.exams.filter((exam) => exam.attempt?.status !== "submitted").length}<small>응시 가능</small></b></section><section className="student-exam-list"><h2>실전모의고사</h2>{portal.exams.map((exam) => <article key={exam.id}><div className="exam-date"><b>{new Date(exam.exam_date).getDate()}</b><span>{new Date(exam.exam_date).toLocaleDateString("ko-KR", { month: "short" })}</span></div><div className="exam-info"><small>{exam.exam_code}</small><h3>{exam.title}</h3><p>{exam.subject} · {exam.question_count}문항 · {exam.time_limit}분</p></div><div className="exam-state">{exam.attempt?.status === "submitted" ? <><b className="complete">제출 완료</b><strong>{exam.attempt.score}점</strong></> : <><b>{exam.attempt ? "응시 중" : "응시 대기"}</b><button disabled={!exam.available || !exam.test_url} onClick={() => void startExam(exam)}>{exam.attempt ? "이어서 풀기" : "시험 시작"}</button></>}</div></article>)}{portal.exams.length === 0 ? <div className="student-empty">현재 응시 가능한 시험이 없습니다.</div> : null}</section></main>;
}
