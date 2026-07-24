"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseEnv } from "@/lib/supabase";

type MenuKey = "dashboard" | "library" | "students" | "exams" | "recommendations";
type ProblemSet = { id: string; title: string; exam_date: string | null; subject: string; question_count: number; analysis_count: number; created_at: string };
type Problem = { id: string; problem_set_id: string; question_number: number; analysis_status: "pending" | "ready" };
type Student = { id: string; name: string; school: string; grade: string; active: boolean; created_at: string };
type Exam = { id: string; title: string; exam_date: string; status: "planned" | "open" | "closed"; created_at: string };
type Recommendation = { id: string; student_name: string; target_question: number; stage: string; status: string };
type DiagnosticItem = { label: string; ok: boolean; detail: string; code?: string };

const menuLabels: Record<MenuKey, string> = {
  dashboard: "대시보드",
  library: "문제 라이브러리",
  students: "학생 관리",
  exams: "모의고사",
  recommendations: "AI 추천",
};

const demoStudents: Student[] = [];
const demoExams: Exam[] = [];
const demoRecommendations: Recommendation[] = [];

export default function Home() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>("dashboard");
  const [problemSets, setProblemSets] = useState<ProblemSet[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [students, setStudents] = useState<Student[]>(demoStudents);
  const [exams, setExams] = useState<Exam[]>(demoExams);
  const [recommendations] = useState<Recommendation[]>(demoRecommendations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [fatalError, setFatalError] = useState("");
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);

  const connected = Boolean(supabase);
  const selectedSet = problemSets.find((item) => item.id === selectedId) ?? null;
  const selectedProblems = useMemo(() => problems.filter((p) => p.problem_set_id === selectedId).sort((a,b)=>a.question_number-b.question_number), [problems, selectedId]);

  const runDiagnostics = useCallback(async () => {
    const result: DiagnosticItem[] = [
      { label: "환경변수 URL", ok: Boolean(supabaseEnv.url), detail: supabaseEnv.url || "미설정" },
      { label: "환경변수 API Key", ok: supabaseEnv.keyPresent, detail: supabaseEnv.keyPresent ? "설정됨" : "미설정" },
    ];
    if (!supabase) { setDiagnostics(result); return; }
    for (const table of ["problem_sets", "problems", "students", "exams"]) {
      const { error } = await supabase.from(table).select("id").limit(1);
      result.push({ label: table, ok: !error, detail: error?.message ?? "조회 정상", code: error?.code });
    }
    setDiagnostics(result);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setFatalError("");
    if (!supabase) { setLoading(false); return; }
    const [setRes, problemRes, studentRes, examRes] = await Promise.all([
      supabase.from("problem_sets").select("*").order("created_at", { ascending: false }),
      supabase.from("problems").select("*").order("question_number"),
      supabase.from("students").select("*").order("created_at", { ascending: false }),
      supabase.from("exams").select("*").order("created_at", { ascending: false }),
    ]);
    const firstError = setRes.error ?? problemRes.error;
    if (firstError) setFatalError(`${firstError.message}${firstError.code ? ` (${firstError.code})` : ""}`);
    else {
      setProblemSets(setRes.data ?? []); setProblems(problemRes.data ?? []);
      setSelectedId((cur) => cur ?? setRes.data?.[0]?.id ?? null);
    }
    if (!studentRes.error) setStudents(studentRes.data ?? []);
    if (!examRes.error) setExams(examRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  async function createProblemSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const subject = String(form.get("subject") ?? "수학");
    const exam_date = String(form.get("exam_date") ?? "") || null;
    const question_count = Number(form.get("question_count") ?? 30);
    if (!title) return;
    const id = crypto.randomUUID();
    const row: ProblemSet = { id, title, subject, exam_date, question_count, analysis_count: 0, created_at: new Date().toISOString() };
    const childRows: Problem[] = Array.from({ length: question_count }, (_, i) => ({ id: `${id}-${i+1}`, problem_set_id: id, question_number: i+1, analysis_status: "pending" }));
    if (supabase) {
      const { error } = await supabase.from("problem_sets").insert(row);
      if (error) { setFatalError(error.message); return; }
      const { error: childError } = await supabase.from("problems").insert(childRows);
      if (childError) { await supabase.from("problem_sets").delete().eq("id", id); setFatalError(childError.message); return; }
    }
    setProblemSets((v) => [row, ...v]); setProblems((v) => [...v, ...childRows]); setSelectedId(id);
    event.currentTarget.reset(); setMessage(`${question_count}개 문항을 생성했습니다.`);
  }

  async function deleteProblemSet(id: string) {
    if (!confirm("이 시험을 삭제할까요?")) return;
    if (supabase) { const { error } = await supabase.from("problem_sets").delete().eq("id", id); if (error) { setFatalError(error.message); return; } }
    setProblemSets((v)=>v.filter(x=>x.id!==id)); setProblems((v)=>v.filter(x=>x.problem_set_id!==id)); setSelectedId(null);
  }

  async function createStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const row: Student = { id: crypto.randomUUID(), name: String(form.get("name")??"").trim(), school: String(form.get("school")??"").trim(), grade: String(form.get("grade")??"고1"), active: true, created_at: new Date().toISOString() };
    if (!row.name) return;
    if (supabase) { const { error } = await supabase.from("students").insert(row); if (error) { setFatalError(error.message); return; } }
    setStudents(v=>[row,...v]); event.currentTarget.reset(); setMessage("학생을 등록했습니다.");
  }

  async function createExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const row: Exam = { id: crypto.randomUUID(), title: String(form.get("title")??"").trim(), exam_date: String(form.get("exam_date")??""), status: "planned", created_at: new Date().toISOString() };
    if (!row.title || !row.exam_date) return;
    if (supabase) { const { error } = await supabase.from("exams").insert(row); if (error) { setFatalError(error.message); return; } }
    setExams(v=>[row,...v]); event.currentTarget.reset(); setMessage("모의고사를 등록했습니다.");
  }

  const pageDescription: Record<MenuKey, string> = {
    dashboard: "SOS 전체 운영 현황을 한눈에 확인합니다.", library: "시험을 등록하고 문항 구조를 관리합니다.", students: "학생을 등록하고 활성 상태를 관리합니다.", exams: "주간 모의고사 일정을 등록하고 운영합니다.", recommendations: "공략 문항부터 진단·훈련 단계까지 확인합니다.",
  };

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark">S</div><div><strong>SOS</strong><span>Score Optimization System</span></div></div>
      <nav>{(Object.keys(menuLabels) as MenuKey[]).map(menu=><button key={menu} className={`nav-item ${activeMenu===menu?"active":""}`} onClick={()=>setActiveMenu(menu)}>{menuLabels[menu]}</button>)}</nav>
      <div className="sidebar-foot"><span className={connected?"status-dot online":"status-dot"}/>{connected?"Supabase 연결":"로컬 데모 모드"}</div>
    </aside>
    <section className="content">
      <header className="topbar"><div><p className="eyebrow">SOS v0.4</p><h1>{menuLabels[activeMenu]}</h1><p>{pageDescription[activeMenu]}</p></div><div className="top-actions"><button className="developer-button" onClick={()=>{setDeveloperOpen(v=>!v); void runDiagnostics();}}>개발자 진단</button><div className={connected?"connection connected":"connection"}>{connected?"Supabase 연결":"환경변수 미설정"}</div></div></header>
      {developerOpen && <section className="developer-panel"><div className="developer-head"><div><strong>Developer Diagnostics</strong><span>실제 오류 메시지를 표시합니다.</span></div><button onClick={()=>void runDiagnostics()}>다시 확인</button></div><div className="diagnostic-grid">{diagnostics.map(x=><article key={x.label} className={`diagnostic ${x.ok?"ok":"fail"}`}><strong>{x.ok?"✓":"✕"} {x.label}</strong><span>{x.detail}</span>{x.code&&<code>CODE: {x.code}</code>}</article>)}</div></section>}
      {fatalError&&<div className="error-notice"><strong>오류</strong><span>{fatalError}</span></div>}{message&&<div className="notice">{message}</div>}

      {activeMenu==="dashboard" && <><div className="summary-grid"><article className="summary-card"><span>등록 학생</span><strong>{students.length}</strong></article><article className="summary-card"><span>등록 시험</span><strong>{problemSets.length}</strong></article><article className="summary-card"><span>전체 문항</span><strong>{problems.length}</strong></article></div><section className="panel"><div className="panel-heading"><p className="eyebrow">운영 흐름</p><h2>이번 주 SOS</h2></div><div className="flow-grid"><div><b>1</b><strong>모의고사</strong><span>주간 시험 등록</span></div><div><b>2</b><strong>공략 문항</strong><span>목표 문항 선택</span></div><div><b>3</b><strong>진단 3→3</strong><span>부족 원인 확인</span></div><div><b>4</b><strong>훈련 10→10</strong><span>유사 문항 훈련</span></div></div></section></>}

      {activeMenu==="library" && <><div className="summary-grid"><article className="summary-card"><span>등록 시험</span><strong>{problemSets.length}</strong></article><article className="summary-card"><span>전체 문항</span><strong>{problems.length}</strong></article><article className="summary-card"><span>분석 완료</span><strong>{problems.filter(p=>p.analysis_status==="ready").length}</strong></article></div><div className="workspace"><section className="panel"><div className="panel-heading"><p className="eyebrow">시험 등록</p><h2>새 시험 추가</h2></div><form onSubmit={createProblemSet}><label>시험명<input name="title" required placeholder="예: 2026년 6월 모의평가"/></label><div className="form-row"><label>시험일<input name="exam_date" type="date"/></label><label>과목<select name="subject"><option>수학</option><option>공통수학</option><option>미적분</option><option>확률과 통계</option><option>기하</option></select></label></div><label>문항 수<input name="question_count" type="number" min="1" max="100" defaultValue="30"/></label><button className="primary-button">시험 및 문항 생성</button></form></section><section className="panel"><div className="panel-heading"><p className="eyebrow">시험 목록</p><h2>등록된 시험</h2></div>{loading?<div className="empty">불러오는 중...</div>:problemSets.length===0?<div className="empty">등록된 시험이 없습니다.</div>:<div className="set-list">{problemSets.map(x=><button key={x.id} className={`set-card ${selectedId===x.id?"selected":""}`} onClick={()=>setSelectedId(x.id)}><div className="set-card-top"><div><strong>{x.title}</strong><span>{x.subject} · {x.question_count}문항</span></div><span className="progress-number">{x.analysis_count}/{x.question_count}</span></div></button>)}</div>}</section></div><section className="panel problem-panel"><div className="panel-heading horizontal"><div><p className="eyebrow">문항 구조</p><h2>{selectedSet?.title??"시험을 선택하세요"}</h2></div>{selectedSet&&<button className="danger-button" onClick={()=>void deleteProblemSet(selectedSet.id)}>시험 삭제</button>}</div>{selectedSet?<div className="problem-grid">{selectedProblems.map(p=><button className="problem-cell" key={p.id}><strong>{p.question_number}</strong><span>{p.analysis_status==="ready"?"분석 완료":"분석 대기"}</span></button>)}</div>:<div className="empty large">시험을 선택해 주세요.</div>}</section></>}

      {activeMenu==="students" && <div className="workspace"><section className="panel"><div className="panel-heading"><p className="eyebrow">학생 등록</p><h2>새 학생</h2></div><form onSubmit={createStudent}><label>이름<input name="name" required/></label><label>학교<input name="school"/></label><label>학년<select name="grade"><option>중3</option><option>고1</option><option>고2</option><option>고3</option></select></label><button className="primary-button">학생 등록</button></form></section><section className="panel"><div className="panel-heading"><p className="eyebrow">학생 목록</p><h2>{students.length}명</h2></div>{students.length===0?<div className="empty">등록된 학생이 없습니다.</div>:<div className="table-list">{students.map(s=><div className="table-row" key={s.id}><div><strong>{s.name}</strong><span>{s.school||"학교 미입력"} · {s.grade}</span></div><em>{s.active?"재원":"비활성"}</em></div>)}</div>}</section></div>}

      {activeMenu==="exams" && <div className="workspace"><section className="panel"><div className="panel-heading"><p className="eyebrow">모의고사 등록</p><h2>새 일정</h2></div><form onSubmit={createExam}><label>시험명<input name="title" required/></label><label>시험일<input name="exam_date" type="date" required/></label><button className="primary-button">모의고사 등록</button></form></section><section className="panel"><div className="panel-heading"><p className="eyebrow">모의고사 목록</p><h2>{exams.length}회</h2></div>{exams.length===0?<div className="empty">등록된 모의고사가 없습니다.</div>:<div className="table-list">{exams.map(e=><div className="table-row" key={e.id}><div><strong>{e.title}</strong><span>{e.exam_date}</span></div><em>{e.status==="planned"?"예정":e.status}</em></div>)}</div>}</section></div>}

      {activeMenu==="recommendations" && <section className="panel"><div className="panel-heading"><p className="eyebrow">AI 추천 흐름</p><h2>학생별 공략 문항</h2><p>모의고사 결과가 들어오면 진단 3→3, 훈련 10→10 순서로 생성됩니다.</p></div>{recommendations.length===0?<div className="empty large">아직 추천 결과가 없습니다. 모의고사 결과 연결 후 자동 생성됩니다.</div>:null}</section>}
    </section>
  </main>;
}
