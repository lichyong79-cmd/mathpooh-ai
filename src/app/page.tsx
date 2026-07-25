"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

type Mode = "admin" | "student";
type AdminTab = "exams" | "create" | "results";
type StudentTab = "list" | "take" | "sos";
type AnswerType = "choice" | "short";

type Question = {
  id: string;
  number: number;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  type: AnswerType;
  answer: string;
  points: number;
  explanation?: string;
};

type Exam = {
  id: string;
  title: string;
  minutes: number;
  grade: string;
  pdfName: string;
  pdfUrl?: string;
  status: "draft" | "published";
  questions: Question[];
  createdAt: string;
};

type Submission = {
  id: string;
  examId: string;
  studentName: string;
  answers: Record<string, string>;
  score: number;
  total: number;
  wrongNumbers: number[];
  submittedAt: string;
};

const STORAGE_EXAMS = "sos-v1-exams";
const STORAGE_SUBMISSIONS = "sos-v1-submissions";

const demoExam: Exam = {
  id: "demo-exam",
  title: "SOS 실전 진단 모의고사",
  minutes: 30,
  grade: "고2",
  pdfName: "demo.pdf",
  status: "published",
  createdAt: new Date().toISOString(),
  questions: Array.from({ length: 10 }, (_, i) => ({
    id: `demo-q-${i + 1}`,
    number: i + 1,
    page: Math.floor(i / 5) + 1,
    x: 8,
    y: 7 + (i % 5) * 18,
    w: 84,
    h: 15,
    type: i < 7 ? "choice" : "short",
    answer: i < 7 ? String((i % 5) + 1) : String(12 + i),
    points: i < 7 ? 3 : 4,
  })),
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("admin");
  const [adminTab, setAdminTab] = useState<AdminTab>("exams");
  const [studentTab, setStudentTab] = useState<StudentTab>("list");
  const [exams, setExams] = useState<Exam[]>([demoExam]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [activeExamId, setActiveExamId] = useState<string>(demoExam.id);
  const [toast, setToast] = useState("");

  useEffect(() => {
    try {
      const savedExams = localStorage.getItem(STORAGE_EXAMS);
      const savedSubmissions = localStorage.getItem(STORAGE_SUBMISSIONS);
      if (savedExams) setExams(JSON.parse(savedExams));
      if (savedSubmissions) setSubmissions(JSON.parse(savedSubmissions));
    } catch { /* demo fallback */ }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_EXAMS, JSON.stringify(exams.map(e => ({ ...e, pdfUrl: undefined }))));
  }, [exams]);
  useEffect(() => localStorage.setItem(STORAGE_SUBMISSIONS, JSON.stringify(submissions)), [submissions]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  function openStudentExam(id: string) {
    setActiveExamId(id);
    setMode("student");
    setStudentTab("take");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">S</div><div><strong>SOS</strong><span>Score Optimization System</span></div></div>
        <div className="mode-toggle"><button className={mode === "admin" ? "active" : ""} onClick={() => setMode("admin")}>관리자</button><button className={mode === "student" ? "active" : ""} onClick={() => setMode("student")}>학생</button></div>
        {mode === "admin" ? (
          <nav>
            <Nav active={adminTab === "exams"} onClick={() => setAdminTab("exams")} icon="▣">실전 모의고사</Nav>
            <Nav active={adminTab === "create"} onClick={() => setAdminTab("create")} icon="＋">시험 만들기</Nav>
            <Nav active={adminTab === "results"} onClick={() => setAdminTab("results")} icon="◎">응시 결과</Nav>
          </nav>
        ) : (
          <nav>
            <Nav active={studentTab === "list"} onClick={() => setStudentTab("list")} icon="▣">시험 목록</Nav>
            <Nav active={studentTab === "take"} onClick={() => setStudentTab("take")} icon="✎">시험 응시</Nav>
            <Nav active={studentTab === "sos"} onClick={() => setStudentTab("sos")} icon="✦">SOS 분석</Nav>
          </nav>
        )}
        <div className="sidebar-foot"><span className="online-dot" /> V1 로컬 데모 · 자동 저장</div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">SOS V1 · WORKING PROTOTYPE</p><h1>{mode === "admin" ? "실전모의고사 운영" : "학생 응시"}</h1><p>시험 생성 → 학생 응시 → 자동 채점 → SOS 분석까지 한 흐름으로 작동합니다.</p></div>
          <div className="top-summary"><span>시험 <b>{exams.length}</b></span><span>응시 <b>{submissions.length}</b></span></div>
        </header>

        {mode === "admin" && adminTab === "exams" && <ExamList exams={exams} submissions={submissions} onCreate={() => { setActiveExamId(""); setAdminTab("create"); }} onOpenStudent={openStudentExam} onEdit={(id) => { setActiveExamId(id); setAdminTab("create"); }} onDelete={(id) => { setExams(v => v.filter(e => e.id !== id)); notify("시험을 삭제했습니다."); }} />}
        {mode === "admin" && adminTab === "create" && <ExamBuilder initialExam={exams.find(e => e.id === activeExamId)} onSave={(exam) => { setExams(v => v.some(e => e.id === exam.id) ? v.map(e => e.id === exam.id ? exam : e) : [exam, ...v]); setActiveExamId(exam.id); notify("시험을 저장했습니다."); setAdminTab("exams"); }} onNotify={notify} />}
        {mode === "admin" && adminTab === "results" && <ResultsPage exams={exams} submissions={submissions} />}

        {mode === "student" && studentTab === "list" && <StudentExamList exams={exams.filter(e => e.status === "published")} onStart={(id) => { setActiveExamId(id); setStudentTab("take"); }} />}
        {mode === "student" && studentTab === "take" && <ExamRunner exam={exams.find(e => e.id === activeExamId) ?? exams.find(e => e.status === "published")} onSubmit={(submission) => { setSubmissions(v => [submission, ...v]); notify("제출 및 자동 채점이 완료되었습니다."); setStudentTab("sos"); }} />}
        {mode === "student" && studentTab === "sos" && <SosReport exam={exams.find(e => e.id === activeExamId)} submission={submissions.find(s => s.examId === activeExamId)} />}
      </section>
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}

function Nav({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: string; children: React.ReactNode }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><i>{icon}</i>{children}</button>;
}

function ExamList({ exams, submissions, onCreate, onOpenStudent, onEdit, onDelete }: { exams: Exam[]; submissions: Submission[]; onCreate: () => void; onOpenStudent: (id: string) => void; onEdit: (id: string) => void; onDelete: (id: string) => void }) {
  return <>
    <section className="hero"><div><span>실전모의고사</span><h2>학생이 직접 볼 시험지를 만듭니다.</h2><p>PDF와 정답을 등록해 배포하면 학생 화면에서 바로 응시할 수 있습니다.</p></div><button className="primary" onClick={onCreate}>+ 새 시험 만들기</button></section>
    <div className="metric-grid"><Metric label="전체 시험" value={String(exams.length)} /><Metric label="배포 시험" value={String(exams.filter(e => e.status === "published").length)} /><Metric label="누적 응시" value={String(submissions.length)} /><Metric label="분석 완료" value={String(submissions.length)} /></div>
    <section className="panel"><div className="panel-head"><div><h3>등록된 시험</h3><p>배포된 시험은 학생 화면에서 응시할 수 있습니다.</p></div></div>
      <div className="exam-table header"><span>시험명</span><span>대상/시간</span><span>문항</span><span>응시</span><span>상태</span><span>관리</span></div>
      {exams.map(exam => <div className="exam-table" key={exam.id}><div><strong>{exam.title}</strong><small>{exam.pdfName}</small></div><span>{exam.grade} · {exam.minutes}분</span><span>{exam.questions.length}문항</span><span>{submissions.filter(s => s.examId === exam.id).length}명</span><b className={`status ${exam.status}`}>{exam.status === "published" ? "배포중" : "작성중"}</b><div className="row-actions"><button onClick={() => onOpenStudent(exam.id)}>응시보기</button><button onClick={() => onEdit(exam.id)}>수정</button>{exam.id !== "demo-exam" && <button className="danger" onClick={() => onDelete(exam.id)}>삭제</button>}</div></div>)}
    </section>
  </>;
}

function ExamBuilder({ initialExam, onSave, onNotify }: { initialExam?: Exam; onSave: (exam: Exam) => void; onNotify: (m: string) => void }) {
  const [exam, setExam] = useState<Exam>(() => initialExam ? structuredClone(initialExam) : { id: uid("exam"), title: "", minutes: 100, grade: "고2", pdfName: "", status: "draft", questions: [], createdAt: new Date().toISOString() });
  const [selectedId, setSelectedId] = useState<string | null>(exam.questions[0]?.id ?? null);
  const [page, setPage] = useState(1);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [draftRect, setDraftRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    if (initialExam) { setExam(structuredClone(initialExam)); setSelectedId(initialExam.questions[0]?.id ?? null); }
  }, [initialExam?.id]);

  const selected = exam.questions.find(q => q.id === selectedId);
  const pageQuestions = exam.questions.filter(q => q.page === page);
  const totalPoints = exam.questions.reduce((sum, q) => sum + q.points, 0);
  const complete = exam.questions.filter(q => q.answer.trim()).length;

  function uploadPdf(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.type !== "application/pdf") { onNotify("PDF 파일만 등록할 수 있습니다."); return; }
    const url = URL.createObjectURL(file);
    setExam(v => ({ ...v, pdfName: file.name, pdfUrl: url }));
  }

  function pos(event: React.PointerEvent) {
    const rect = boardRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)), y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)) };
  }
  function pointerDown(e: React.PointerEvent) { if (!exam.pdfName) return; dragStart.current = pos(e); setDraftRect({ ...dragStart.current, w: 0, h: 0 }); e.currentTarget.setPointerCapture(e.pointerId); }
  function pointerMove(e: React.PointerEvent) { if (!dragStart.current) return; const p = pos(e); setDraftRect({ x: Math.min(p.x, dragStart.current.x), y: Math.min(p.y, dragStart.current.y), w: Math.abs(p.x - dragStart.current.x), h: Math.abs(p.y - dragStart.current.y) }); }
  function pointerUp() {
    if (!draftRect || draftRect.w < 4 || draftRect.h < 3) { dragStart.current = null; setDraftRect(null); return; }
    const q: Question = { id: uid("q"), number: exam.questions.length + 1, page, ...draftRect, type: "choice", answer: "", points: 4 };
    setExam(v => ({ ...v, questions: [...v.questions, q] })); setSelectedId(q.id); dragStart.current = null; setDraftRect(null);
  }
  function updateQuestion(patch: Partial<Question>) { setExam(v => ({ ...v, questions: v.questions.map(q => q.id === selectedId ? { ...q, ...patch } : q) })); }
  function removeQuestion(id: string) { setExam(v => ({ ...v, questions: v.questions.filter(q => q.id !== id).map((q, i) => ({ ...q, number: i + 1 })) })); setSelectedId(null); }
  function addQuickQuestion() {
    const q: Question = { id: uid("q"), number: exam.questions.length + 1, page, x: 8, y: 8 + (pageQuestions.length % 5) * 18, w: 84, h: 15, type: "choice", answer: "", points: 4 };
    setExam(v => ({ ...v, questions: [...v.questions, q] })); setSelectedId(q.id);
  }
  function save(status: Exam["status"]) {
    if (!exam.title.trim()) return onNotify("시험명을 입력하세요.");
    if (!exam.pdfName) return onNotify("시험지 PDF를 등록하세요.");
    if (!exam.questions.length) return onNotify("문항을 하나 이상 생성하세요.");
    if (status === "published" && complete !== exam.questions.length) return onNotify("정답이 없는 문항을 확인하세요.");
    onSave({ ...exam, status });
  }

  return <div className="builder-page">
    <section className="panel builder-meta"><div className="panel-head"><div><span className="step-label">STEP 1</span><h3>시험 기본정보</h3></div><div className="save-actions"><button onClick={() => save("draft")}>임시저장</button><button className="primary" onClick={() => save("published")}>학생에게 배포</button></div></div>
      <div className="form-grid"><label>시험명<input value={exam.title} onChange={e => setExam(v => ({ ...v, title: e.target.value }))} placeholder="예: 2027학년도 6월 평가원" /></label><label>시험시간<input type="number" value={exam.minutes} onChange={e => setExam(v => ({ ...v, minutes: Number(e.target.value) }))} /></label><label>대상<select value={exam.grade} onChange={e => setExam(v => ({ ...v, grade: e.target.value }))}><option>고1</option><option>고2</option><option>고3</option></select></label><label className="file-label">시험지 PDF<input type="file" accept="application/pdf" onChange={uploadPdf} /><span>{exam.pdfName || "PDF 선택"}</span></label></div>
    </section>

    <div className="builder-layout">
      <section className="panel page-panel"><div className="panel-head compact"><div><span className="step-label">STEP 2</span><h3>문항 영역 지정</h3><p>가운데 시험지 위에서 문항 영역을 드래그하세요.</p></div><button onClick={addQuickQuestion}>+ 빠른 문항 추가</button></div>
        <div className="page-toolbar"><button onClick={() => setPage(Math.max(1, page - 1))}>‹</button><b>Page {page}</b><button onClick={() => setPage(page + 1)}>›</button><span>문항 {pageQuestions.length}개</span></div>
        <div className="pdf-workspace">
          {exam.pdfUrl ? <object className="pdf-object" data={`${exam.pdfUrl}#page=${page}&toolbar=0`} type="application/pdf" /> : <div className="fake-paper"><b>{exam.pdfName ? `PDF: ${exam.pdfName}` : "시험지 PDF를 먼저 등록하세요"}</b><p>브라우저 보안상 PDF 위에 직접 드래그가 제한될 수 있어, 오른쪽 좌표판에서 동일한 페이지의 문항 위치를 지정합니다.</p></div>}
          <div ref={boardRef} className={`crop-board ${exam.pdfName ? "enabled" : ""}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}>
            <span className="board-guide">문항 위치 좌표판 · 드래그하여 영역 추가</span>
            {pageQuestions.map(q => <button key={q.id} className={`crop-box ${selectedId === q.id ? "selected" : ""}`} style={{ left: `${q.x}%`, top: `${q.y}%`, width: `${q.w}%`, height: `${q.h}%` }} onPointerDown={e => e.stopPropagation()} onClick={() => setSelectedId(q.id)}>{q.number}</button>)}
            {draftRect && <div className="crop-box draft" style={{ left: `${draftRect.x}%`, top: `${draftRect.y}%`, width: `${draftRect.w}%`, height: `${draftRect.h}%` }} />}
          </div>
        </div>
      </section>

      <aside className="panel question-panel"><div className="panel-head compact"><div><span className="step-label">STEP 3</span><h3>정답 입력</h3></div><span className="completion">{complete}/{exam.questions.length}</span></div>
        <div className="question-strip">{exam.questions.map(q => <button key={q.id} className={`${selectedId === q.id ? "active" : ""} ${q.answer ? "done" : "missing"}`} onClick={() => { setSelectedId(q.id); setPage(q.page); }}>{q.number}</button>)}</div>
        {selected ? <div className="question-editor"><div className="editor-title"><strong>{selected.number}번 문항</strong><button className="text-danger" onClick={() => removeQuestion(selected.id)}>삭제</button></div>
          <label>문항번호<input type="number" value={selected.number} onChange={e => updateQuestion({ number: Number(e.target.value) })} /></label>
          <label>답안유형<select value={selected.type} onChange={e => updateQuestion({ type: e.target.value as AnswerType, answer: "" })}><option value="choice">객관식</option><option value="short">단답형</option></select></label>
          {selected.type === "choice" ? <div className="choice-answer"><span>정답</span><div>{[1,2,3,4,5].map(n => <button key={n} className={selected.answer === String(n) ? "active" : ""} onClick={() => updateQuestion({ answer: String(n) })}>{n}</button>)}</div></div> : <label>정답<input value={selected.answer} onChange={e => updateQuestion({ answer: e.target.value })} placeholder="숫자 또는 식" /></label>}
          <label>배점<input type="number" value={selected.points} onChange={e => updateQuestion({ points: Number(e.target.value) })} /></label>
          <label>해설 메모<textarea value={selected.explanation ?? ""} onChange={e => updateQuestion({ explanation: e.target.value })} placeholder="선택 입력" /></label>
        </div> : <div className="empty-editor">문항 영역을 만들거나 번호를 선택하세요.</div>}
        <div className="builder-summary"><div><span>총 문항</span><b>{exam.questions.length}</b></div><div><span>총 배점</span><b>{totalPoints}</b></div><div><span>정답 누락</span><b className={complete < exam.questions.length ? "red" : ""}>{exam.questions.length - complete}</b></div></div>
      </aside>
    </div>
  </div>;
}

function StudentExamList({ exams, onStart }: { exams: Exam[]; onStart: (id: string) => void }) {
  return <><section className="student-hero"><div><span>이번 주 실전</span><h2>시험을 선택하고 시작하세요.</h2><p>제출 즉시 자동 채점되고 SOS 분석으로 연결됩니다.</p></div></section><div className="student-exam-grid">{exams.map(e => <article key={e.id}><div className="paper-symbol">▤</div><div><span>{e.grade}</span><h3>{e.title}</h3><p>{e.questions.length}문항 · {e.minutes}분</p></div><button className="primary" onClick={() => onStart(e.id)}>시험 시작</button></article>)}</div></>;
}

function ExamRunner({ exam, onSubmit }: { exam?: Exam; onSubmit: (s: Submission) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState((exam?.minutes ?? 0) * 60);
  useEffect(() => { setAnswers({}); setCurrent(0); setRemaining((exam?.minutes ?? 0) * 60); }, [exam?.id]);
  useEffect(() => { if (!exam || remaining <= 0) return; const timer = window.setInterval(() => setRemaining(v => v - 1), 1000); return () => clearInterval(timer); }, [exam?.id, remaining <= 0]);
  if (!exam) return <section className="panel empty">배포된 시험을 선택하세요.</section>;
  const q = exam.questions[current];
  function submit(e: FormEvent) {
    e.preventDefault();
    let score = 0; const wrongNumbers: number[] = [];
    exam.questions.forEach(question => { if ((answers[question.id] ?? "").trim() === question.answer.trim()) score += question.points; else wrongNumbers.push(question.number); });
    onSubmit({ id: uid("submission"), examId: exam.id, studentName: "김민준", answers, score, total: exam.questions.reduce((s, x) => s + x.points, 0), wrongNumbers, submittedAt: new Date().toISOString() });
  }
  return <form onSubmit={submit} className="runner"><section className="runner-head"><div><span>실전 모의고사</span><h2>{exam.title}</h2><p>{exam.grade} · {exam.questions.length}문항</p></div><div className="timer"><small>남은 시간</small><strong>{String(Math.floor(remaining/60)).padStart(2,"0")}:{String(remaining%60).padStart(2,"0")}</strong></div></section>
    <div className="runner-layout"><section className="panel exam-paper"><div className="exam-paper-top"><b>{current + 1} / {exam.questions.length}</b><span>{q.points}점</span></div><div className="question-placeholder"><strong>{q.number}.</strong><h3>등록된 시험지 PDF의 {q.page}페이지 문항 영역</h3><p>실제 운영에서는 이곳에 지정한 문항 이미지가 표시됩니다.</p><div className="coordinate-note">영역 좌표: X {q.x.toFixed(1)}% · Y {q.y.toFixed(1)}% · W {q.w.toFixed(1)}% · H {q.h.toFixed(1)}%</div></div>
      {q.type === "choice" ? <div className="student-choices">{[1,2,3,4,5].map(n => <button type="button" key={n} className={answers[q.id] === String(n) ? "active" : ""} onClick={() => setAnswers(v => ({ ...v, [q.id]: String(n) }))}>{n}</button>)}</div> : <label className="short-answer">정답 입력<input value={answers[q.id] ?? ""} onChange={e => setAnswers(v => ({ ...v, [q.id]: e.target.value }))} /></label>}
      <div className="runner-nav"><button type="button" disabled={current === 0} onClick={() => setCurrent(v => v - 1)}>이전</button>{current < exam.questions.length - 1 ? <button type="button" className="primary" onClick={() => setCurrent(v => v + 1)}>다음</button> : <button className="primary" type="submit">제출 및 채점</button>}</div></section>
      <aside className="panel answer-sheet"><h3>답안지</h3><p>번호를 눌러 이동할 수 있습니다.</p><div className="answer-grid">{exam.questions.map((question, i) => <button type="button" key={question.id} className={`${i === current ? "current" : ""} ${answers[question.id] ? "answered" : ""}`} onClick={() => setCurrent(i)}><span>{question.number}</span><b>{answers[question.id] || "-"}</b></button>)}</div><div className="answered-count">응답 <b>{Object.values(answers).filter(Boolean).length}</b> / {exam.questions.length}</div></aside>
    </div>
  </form>;
}

function SosReport({ exam, submission }: { exam?: Exam; submission?: Submission }) {
  if (!exam || !submission) return <section className="panel empty"><h3>아직 분석할 결과가 없습니다.</h3><p>실전모의고사를 제출하면 SOS 분석이 생성됩니다.</p></section>;
  const percent = submission.total ? Math.round(submission.score / submission.total * 100) : 0;
  const target = submission.wrongNumbers.slice(0, 3);
  const trainingCount = Math.max(10, target.length * 4);
  return <><section className="report-hero"><div><span>SOS 분석 완료</span><h2>{submission.studentName} 학생의 다음 공부가 정해졌습니다.</h2><p>틀린 문항을 중심으로 공략문항과 진단·훈련 순서를 자동 구성했습니다.</p></div><div className="score-ring"><strong>{percent}</strong><span>점수율</span></div></section>
    <div className="report-flow"><FlowStep no="1" title="공략문항" value={target.length ? `${target.join(", ")}번` : "없음"} active /><FlowStep no="2" title="진단 3" value="개념·해석·계산" /><FlowStep no="3" title="AI 판단" value={percent >= 80 ? "보완훈련" : "추가진단"} /><FlowStep no="4" title="훈련 10" value={`${trainingCount}문항 준비`} /></div>
    <div className="two-col"><section className="panel"><div className="panel-head"><div><h3>실전 결과</h3><p>자동 채점 결과입니다.</p></div></div><div className="result-metrics"><div><span>점수</span><b>{submission.score}/{submission.total}</b></div><div><span>정답률</span><b>{percent}%</b></div><div><span>오답</span><b>{submission.wrongNumbers.length}문항</b></div></div><div className="wrong-list"><span>오답 문항</span><div>{submission.wrongNumbers.length ? submission.wrongNumbers.map(n => <b key={n}>{n}</b>) : <em>전 문항 정답</em>}</div></div></section>
      <section className="panel"><div className="panel-head"><div><h3>AI 추천</h3><p>현재는 규칙 기반 V1 추천입니다.</p></div></div><div className="recommend-card"><span>우선 공략</span><h3>{target.length ? `${target.join(" · ")}번 문항` : "심화 유지 훈련"}</h3><p>{percent >= 80 ? "기본 이해는 안정적입니다. 오답 구조와 유사한 보완 문제 10문항을 추천합니다." : "오답 원인을 구분하기 위해 진단 3문항을 먼저 풀고, 결과에 따라 추가진단 또는 훈련 10문항으로 이동합니다."}</p><button className="primary">진단 3 시작</button></div></section></div>
  </>;
}

function ResultsPage({ exams, submissions }: { exams: Exam[]; submissions: Submission[] }) {
  return <section className="panel"><div className="panel-head"><div><h3>응시 결과</h3><p>제출 즉시 자동 채점된 결과입니다.</p></div></div>{submissions.length === 0 ? <div className="empty">아직 제출된 시험이 없습니다.</div> : <div className="result-table header"><span>학생</span><span>시험</span><span>점수</span><span>오답</span><span>제출일</span></div>}{submissions.map(s => <div className="result-table" key={s.id}><strong>{s.studentName}</strong><span>{exams.find(e => e.id === s.examId)?.title ?? "삭제된 시험"}</span><b>{s.score}/{s.total}</b><span>{s.wrongNumbers.join(", ") || "없음"}</span><span>{new Date(s.submittedAt).toLocaleString("ko-KR")}</span></div>)}</section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="metric"><span>{label}</span><strong>{value}</strong></article>; }
function FlowStep({ no, title, value, active }: { no: string; title: string; value: string; active?: boolean }) { return <div className={active ? "active" : ""}><i>{no}</i><span><b>{title}</b><small>{value}</small></span></div>; }
