"use client";

import { useEffect, useMemo, useState } from "react";

type Student = { id: string; name: string; school: string; grade: string; score: number; target: number };
type Exam = { id: string; title: string; date: string; questions: number; status: "draft" | "ready" | "closed" };
type Problem = { id: string; source: string; no: number; level: "쉬움" | "유사" | "어려움"; concept: string; confidence: number };

type Tab = "dashboard" | "students" | "exams" | "library" | "recommend" | "student";

const seedStudents: Student[] = [
  { id: "s1", name: "김민수", school: "보성고", grade: "고3", score: 76, target: 13 },
  { id: "s2", name: "박서연", school: "잠실여고", grade: "고3", score: 84, target: 15 },
  { id: "s3", name: "이도윤", school: "영동일고", grade: "고2", score: 68, target: 12 },
  { id: "s4", name: "최지우", school: "정신여고", grade: "고3", score: 88, target: 20 },
  { id: "s5", name: "정현우", school: "배명고", grade: "고2", score: 72, target: 14 },
];

const seedExams: Exam[] = [
  { id: "e1", title: "7월 4주차 수능형 모의고사", date: "2026-07-25", questions: 30, status: "ready" },
  { id: "e2", title: "8월 1주차 수능형 모의고사", date: "2026-08-01", questions: 30, status: "draft" },
];

const seedProblems: Problem[] = [
  { id: "p1", source: "2024년 7월 학평", no: 10, level: "쉬움", concept: "함수의 극한·그래프 해석", confidence: 94 },
  { id: "p2", source: "2023년 9월 모평", no: 13, level: "유사", concept: "함수의 극한·조건 해석", confidence: 97 },
  { id: "p3", source: "2025년 6월 모평", no: 15, level: "어려움", concept: "함수의 극한·복합 조건", confidence: 91 },
];

function StatusBadge({ status }: { status: Exam["status"] }) {
  const text = status === "ready" ? "응시 가능" : status === "draft" ? "준비 중" : "종료";
  return <span className={`badge badge-${status}`}>{text}</span>;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [students, setStudents] = useState<Student[]>(seedStudents);
  const [exams, setExams] = useState<Exam[]>(seedExams);
  const [selectedStudent, setSelectedStudent] = useState("s1");
  const [uploadName, setUploadName] = useState("");
  const [analysisDone, setAnalysisDone] = useState(false);
  const [examRunning, setExamRunning] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("mathpooh-demo");
    if (!saved) return;
    try {
      const data = JSON.parse(saved);
      if (data.students) setStudents(data.students);
      if (data.exams) setExams(data.exams);
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem("mathpooh-demo", JSON.stringify({ students, exams }));
  }, [students, exams]);

  const student = (students.find((s) => s.id === selectedStudent) ?? students[0])!;
  const avg = useMemo(() => Math.round(students.reduce((a, b) => a + b.score, 0) / students.length), [students]);

  const addStudent = () => {
    const name = prompt("학생 이름");
    if (!name) return;
    setStudents((prev) => [...prev, { id: crypto.randomUUID(), name, school: "학교 미입력", grade: "고3", score: 0, target: 0 }]);
  };

  const addExam = () => {
    const title = prompt("모의고사 이름");
    if (!title) return;
    setExams((prev) => [...prev, { id: crypto.randomUUID(), title, date: new Date().toISOString().slice(0, 10), questions: 30, status: "draft" }]);
  };

  const nav: { id: Tab; label: string; icon: string }[] = [
    { id: "dashboard", label: "대시보드", icon: "⌂" },
    { id: "students", label: "학생 관리", icon: "◎" },
    { id: "exams", label: "모의고사 관리", icon: "▤" },
    { id: "library", label: "문제 라이브러리", icon: "▱" },
    { id: "recommend", label: "AI 추천", icon: "✦" },
    { id: "student", label: "학생 시험 화면", icon: "▶" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">M</div><div><b>MathPooh AI</b><span>Adaptive Math Lab</span></div></div>
        <nav>{nav.map((n) => <button key={n.id} className={tab === n.id ? "active" : ""} onClick={() => setTab(n.id)}><span>{n.icon}</span>{n.label}</button>)}</nav>
        <div className="sidebar-foot"><div className="avatar">이</div><div><b>이철용 원장</b><span>관리자</span></div></div>
      </aside>

      <main className="main">
        <header><div><p className="eyebrow">MATHPOOH PILOT</p><h1>{nav.find((n) => n.id === tab)?.label}</h1></div><div className="header-actions"><span className="connection"><i /> Supabase 연결 대기</span><button className="ghost" onClick={() => location.reload()}>새로고침</button></div></header>

        {tab === "dashboard" && <>
          <section className="hero"><div><span className="hero-chip">이번 주 운영</span><h2>학생의 다음 1문제를<br />AI가 찾아냅니다.</h2><p>원장님은 공략 문항을 확인하고 승인만 하면 됩니다.</p><div className="hero-actions"><button className="primary" onClick={() => setTab("recommend")}>AI 추천 확인</button><button className="secondary" onClick={() => setTab("exams")}>모의고사 관리</button></div></div><div className="score-ring"><div><strong>{avg}</strong><span>파일럿 평균</span></div></div></section>
          <section className="stats"><article><span>파일럿 학생</span><strong>{students.length}명</strong><small>목표 5~7명</small></article><article><span>이번 주 모의고사</span><strong>{exams.filter(e => e.status === "ready").length}회</strong><small>30문항 수능형</small></article><article><span>AI 추천 대기</span><strong>3명</strong><small>승인만 필요</small></article><article><span>예상 절약 시간</span><strong>87분</strong><small>문항 선별 자동화</small></article></section>
          <section className="two-col"><div className="panel"><div className="panel-title"><div><p>최근 학생 현황</p><h3>다음 점수를 만들 학생</h3></div><button onClick={() => setTab("students")}>전체 보기</button></div><div className="student-list">{students.slice(0,4).map(s => <div className="student-row" key={s.id}><div className="avatar small">{s.name[0]}</div><div className="grow"><b>{s.name}</b><span>{s.school} · {s.grade}</span></div><strong>{s.score}점</strong><span className="target">공략 {s.target}번</span></div>)}</div></div><div className="panel"><div className="panel-title"><div><p>AI 작업 흐름</p><h3>원장님 개입 최소화</h3></div></div><div className="flow"><div><span>1</span><b>문제 자동 읽기</b><small>PDF·이미지 분석</small></div><div><span>2</span><b>진단 3문항 추천</b><small>쉬움·유사·어려움</small></div><div><span>3</span><b>훈련 10문항 구성</b><small>결과에 따라 추가 10문항</small></div><div><span>4</span><b>다음 주 검증</b><small>모의고사가 재진단</small></div></div></div></section>
        </>}

        {tab === "students" && <section className="panel large"><div className="panel-title"><div><p>STUDENTS</p><h3>파일럿 학생 관리</h3></div><button className="primary compact" onClick={addStudent}>학생 추가</button></div><table><thead><tr><th>학생</th><th>학교</th><th>학년</th><th>최근 점수</th><th>공략 문항</th><th>상태</th></tr></thead><tbody>{students.map(s => <tr key={s.id}><td><b>{s.name}</b></td><td>{s.school}</td><td>{s.grade}</td><td>{s.score}점</td><td>{s.target ? `${s.target}번` : "미정"}</td><td><span className="badge badge-ready">분석 완료</span></td></tr>)}</tbody></table></section>}

        {tab === "exams" && <section className="panel large"><div className="panel-title"><div><p>MOCK EXAMS</p><h3>주간 모의고사 관리</h3></div><button className="primary compact" onClick={addExam}>모의고사 추가</button></div><div className="exam-grid">{exams.map(e => <article key={e.id}><div className="exam-top"><span className="exam-icon">▤</span><StatusBadge status={e.status} /></div><h3>{e.title}</h3><p>{e.date} · {e.questions}문항 · 100분</p><div className="exam-actions"><button onClick={() => setExams(prev => prev.map(x => x.id === e.id ? {...x, status: x.status === "draft" ? "ready" : "closed"} : x))}>{e.status === "draft" ? "응시 오픈" : "상태 변경"}</button><button>문항 보기</button></div></article>)}</div></section>}

        {tab === "library" && <section className="two-col library"><div className="panel upload"><p className="eyebrow">PROBLEM INGESTION</p><h3>시험지·해설지를 올리세요</h3><p className="muted">문항 분리, 정답 연결, 핵심 개념 분석과 검색용 구조화를 자동 처리하도록 연결할 화면입니다.</p><label className="drop"><input type="file" accept=".pdf,image/*" onChange={e => { setUploadName(e.target.files?.[0]?.name ?? ""); setAnalysisDone(false); }} /><span>＋</span><b>{uploadName || "PDF 또는 이미지 선택"}</b><small>시험지, 정답표, 해설지</small></label><button className="primary full" disabled={!uploadName} onClick={() => { setAnalysisDone(false); setTimeout(() => setAnalysisDone(true), 900); }}>AI 분석 시작</button></div><div className="panel"><p className="eyebrow">ANALYSIS PREVIEW</p><h3>{analysisDone ? "30문항 분석 완료" : "분석 결과 미리보기"}</h3>{analysisDone ? <div className="analysis-result"><div><span>문항 분리</span><strong>30 / 30</strong></div><div><span>정답 연결</span><strong>30 / 30</strong></div><div><span>수식·도형 감지</span><strong>27 / 30</strong></div><div><span>추천 검색 준비</span><strong>완료</strong></div><button className="secondary full" onClick={() => setTab("recommend")}>추천 화면으로 이동</button></div> : <div className="empty"><span>✦</span><p>파일을 선택하고 분석을 시작하면<br/>문항별 분석 결과가 표시됩니다.</p></div>}</div></section>}

        {tab === "recommend" && <section className="recommend-layout"><div className="panel selector"><p className="eyebrow">TARGET STUDENT</p><h3>공략 학생 선택</h3><select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}>{students.map(s => <option key={s.id} value={s.id}>{s.name} · {s.score}점</option>)}</select><div className="target-card"><span>이번 주 공략 문항</span><strong>{student.target}번</strong><p>맞힐 가능성이 가장 높은 다음 점수</p></div><div className="student-meta"><span>학교<b>{student.school}</b></span><span>최근 점수<b>{student.score}점</b></span><span>목표 점수<b>{Math.min(100, student.score + 4)}점</b></span></div></div><div className="panel recommendation"><div className="panel-title"><div><p>AI DIAGNOSTIC SET</p><h3>{student.name} 진단 3문항</h3></div><span className="confidence">평균 신뢰도 94%</span></div><div className="problem-cards">{seedProblems.map(p => <article key={p.id}><span className={`level level-${p.level}`}>{p.level}</span><div><h4>{p.source} {p.no}번</h4><p>{p.concept}</p></div><strong>{p.confidence}%</strong><button>교체</button></article>)}</div><div className="ai-note"><span>✦</span><p><b>AI 판단</b><br/>13번의 핵심은 조건을 그래프로 전환하고 극한값을 비교하는 과정입니다. 세 문항으로 개념 이해, 구조 전이, 고난도 적용을 순서대로 확인합니다.</p></div><div className="approve"><button className="secondary">전체 미리보기</button><button className="primary" onClick={() => alert("진단 3문항이 승인되었습니다.")}>3문항 승인</button></div></div><div className="panel training"><p className="eyebrow">NEXT TRAINING</p><h3>진단 후 자동 구성</h3><div className="training-number">10<span>문항</span></div><p>부족하면 다음 10문항을 이어서 배정합니다.</p><div className="progress"><i style={{width:"68%"}} /></div><small>개념 3 · 구조 4 · 실전 3</small></div></section>}

        {tab === "student" && <section className="student-exam"><div className="panel exam-intro"><p className="eyebrow">STUDENT MODE</p><h2>{student.name} 학생</h2><h3>7월 4주차 수능형 모의고사</h3><div className="exam-info"><span><b>30</b>문항</span><span><b>100</b>분</span><span><b>100</b>점</span></div>{!examRunning ? <button className="primary full" onClick={() => {setExamRunning(true); setSubmitted(false);}}>모의고사 시작</button> : <button className="secondary full" onClick={() => setExamRunning(false)}>시험 종료</button>}</div>{examRunning && <div className="panel answer-sheet"><div className="panel-title"><div><p>ANSWER SHEET</p><h3>답안 입력</h3></div><span className="timer">99:42</span></div><div className="answers">{Array.from({length:30},(_,i)=>i+1).map(n => <label key={n}><span>{n}</span><input value={answers[n] ?? ""} onChange={e => setAnswers({...answers,[n]:e.target.value})} placeholder="답" /></label>)}</div><button className="primary full" onClick={() => setSubmitted(true)}>답안 제출 및 채점</button>{submitted && <div className="result-box"><strong>84점</strong><span>오답 13, 15, 20, 28번</span><p>다음 공략 문항: <b>13번</b></p></div>}</div>}</section>}
      </main>
    </div>
  );
}
