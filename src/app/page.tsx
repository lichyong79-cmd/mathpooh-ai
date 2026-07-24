"use client";

import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  school: string;
  grade: string;
  score: number;
  target: number;
};

type Exam = {
  id: string;
  title: string;
  date: string;
  questions: number;
  status: "draft" | "ready" | "closed";
};

type ProblemSource = {
  id: string;
  title: string;
  year: number | null;
  examType: string;
  questionFilePath: string | null;
  answerFilePath: string | null;
  solutionFilePath: string | null;
  status: "uploaded" | "analyzing" | "ready" | "error";
  problemCount: number;
  createdAt: string;
};

type Problem = {
  id: string;
  source: string;
  no: number;
  level: "쉬움" | "유사" | "어려움";
  concept: string;
  confidence: number;
};

type Tab = "dashboard" | "students" | "exams" | "library" | "recommend" | "student";
type ConnectionState = "checking" | "connected" | "demo" | "error";
type LearningStep = "diagnostic1" | "diagnostic2" | "training1" | "training2" | "nextExam";

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

const firstDiagnostic: Problem[] = [
  { id: "p1", source: "2024년 7월 학평", no: 10, level: "쉬움", concept: "함수의 극한·그래프 해석", confidence: 94 },
  { id: "p2", source: "2023년 9월 모평", no: 13, level: "유사", concept: "함수의 극한·조건 해석", confidence: 97 },
  { id: "p3", source: "2025년 6월 모평", no: 15, level: "어려움", concept: "함수의 극한·복합 조건", confidence: 91 },
];

const secondDiagnostic: Problem[] = [
  { id: "p4", source: "2022년 10월 학평", no: 12, level: "쉬움", concept: "함수값과 좌우극한 비교", confidence: 93 },
  { id: "p5", source: "2024년 6월 모평", no: 14, level: "유사", concept: "구간별 함수·조건 전환", confidence: 96 },
  { id: "p6", source: "2025년 9월 모평", no: 16, level: "어려움", concept: "매개변수·극한 조건 종합", confidence: 90 },
];

function StatusBadge({ status }: { status: Exam["status"] }) {
  const text = status === "ready" ? "응시 가능" : status === "draft" ? "준비 중" : "종료";
  return <span className={`badge badge-${status}`}>{text}</span>;
}

const stepOrder: LearningStep[] = ["diagnostic1", "diagnostic2", "training1", "training2", "nextExam"];
const stepLabel: Record<LearningStep, string> = {
  diagnostic1: "진단 3문항",
  diagnostic2: "추가 진단 3문항",
  training1: "훈련 10문항",
  training2: "추가 훈련 10문항",
  nextExam: "다음 주 모의고사",
};

export default function Home() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [students, setStudents] = useState<Student[]>(seedStudents);
  const [exams, setExams] = useState<Exam[]>(seedExams);
  const [selectedStudent, setSelectedStudent] = useState("s1");
  const [problemSources, setProblemSources] = useState<ProblemSource[]>([]);
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceYear, setSourceYear] = useState(String(new Date().getFullYear()));
  const [sourceExamType, setSourceExamType] = useState("주간 모의고사");
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [solutionFile, setSolutionFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [examRunning, setExamRunning] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [learningStep, setLearningStep] = useState<LearningStep>("diagnostic1");

  useEffect(() => {
    void loadInitialData();
  }, []);

  async function loadInitialData() {
    if (!supabase || !isSupabaseConfigured) {
      setConnection("demo");
      setLoading(false);
      return;
    }

    try {
      const [{ data: studentRows, error: studentError }, { data: examRows, error: examError }, { data: sourceRows, error: sourceError }] = await Promise.all([
        supabase.from("students").select("id,name,school,grade").eq("active", true).order("created_at"),
        supabase.from("mock_exams").select("id,title,exam_date,duration_minutes,status").order("created_at"),
        supabase.from("problem_sources").select("id,title,year,exam_type,question_file_path,answer_file_path,solution_file_path,status,problem_count,created_at").order("created_at", { ascending: false }),
      ]);

      if (studentError || examError || sourceError) throw studentError ?? examError ?? sourceError;

      if (studentRows && studentRows.length > 0) {
        setStudents(
          studentRows.map((row, index) => ({
            id: row.id,
            name: row.name,
            school: row.school || "학교 미입력",
            grade: row.grade || "학년 미입력",
            score: seedStudents[index]?.score ?? 0,
            target: seedStudents[index]?.target ?? 0,
          })),
        );
        setSelectedStudent(studentRows[0].id);
      }

      if (examRows && examRows.length > 0) {
        setExams(
          examRows.map((row) => ({
            id: row.id,
            title: row.title,
            date: row.exam_date || "날짜 미정",
            questions: 30,
            status: row.status,
          })),
        );
      }


      if (sourceRows) {
        setProblemSources(sourceRows.map((row) => ({
          id: row.id,
          title: row.title,
          year: row.year,
          examType: row.exam_type || "기타",
          questionFilePath: row.question_file_path,
          answerFilePath: row.answer_file_path,
          solutionFilePath: row.solution_file_path,
          status: row.status,
          problemCount: row.problem_count || 0,
          createdAt: row.created_at,
        })));
      }

      setConnection("connected");
    } catch (error) {
      console.error(error);
      setConnection("error");
      setNotice("Supabase 연결에 실패해 데모 데이터로 실행 중입니다.");
    } finally {
      setLoading(false);
    }
  }

  const student = students.find((item) => item.id === selectedStudent) ?? students[0];
  const avg = useMemo(() => {
    if (students.length === 0) return 0;
    return Math.round(students.reduce((sum, item) => sum + item.score, 0) / students.length);
  }, [students]);

  async function addStudent() {
    const name = prompt("학생 이름");
    if (!name?.trim()) return;
    const school = prompt("학교", "학교 미입력")?.trim() || "학교 미입력";
    const grade = prompt("학년", "고3")?.trim() || "고3";

    if (supabase && connection === "connected") {
      const { data, error } = await supabase
        .from("students")
        .insert({ name: name.trim(), school, grade })
        .select("id,name,school,grade")
        .single();
      if (error) {
        setNotice(`학생 저장 실패: ${error.message}`);
        return;
      }
      const next = { id: data.id, name: data.name, school: data.school || school, grade: data.grade || grade, score: 0, target: 0 };
      setStudents((prev) => [...prev, next]);
      setNotice(`${name} 학생이 Supabase에 저장되었습니다.`);
      return;
    }

    setStudents((prev) => [...prev, { id: crypto.randomUUID(), name: name.trim(), school, grade, score: 0, target: 0 }]);
    setNotice(`${name} 학생이 데모 화면에 추가되었습니다.`);
  }

  async function addExam() {
    const title = prompt("모의고사 이름");
    if (!title?.trim()) return;
    const date = new Date().toISOString().slice(0, 10);

    if (supabase && connection === "connected") {
      const { data, error } = await supabase
        .from("mock_exams")
        .insert({ title: title.trim(), exam_date: date, duration_minutes: 100, status: "draft" })
        .select("id,title,exam_date,status")
        .single();
      if (error) {
        setNotice(`모의고사 저장 실패: ${error.message}`);
        return;
      }
      setExams((prev) => [...prev, { id: data.id, title: data.title, date: data.exam_date, questions: 30, status: data.status }]);
      setNotice(`${title} 모의고사가 Supabase에 저장되었습니다.`);
      return;
    }

    setExams((prev) => [...prev, { id: crypto.randomUUID(), title: title.trim(), date, questions: 30, status: "draft" }]);
    setNotice(`${title} 모의고사가 데모 화면에 추가되었습니다.`);
  }

  async function uploadProblemSource() {
    if (!supabase || connection !== "connected") {
      setNotice("Supabase 연결 후 사용할 수 있습니다.");
      return;
    }
    if (!sourceTitle.trim() || !questionFile) {
      setNotice("자료 이름과 시험지 파일은 필수입니다.");
      return;
    }

    setUploading(true);
    try {
      const sourceId = crypto.randomUUID();
      const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const uploadOne = async (file: File | null, kind: string) => {
        if (!file) return null;
        const path = `${sourceId}/${kind}-${safeName(file.name)}`;
        const { error } = await supabase.storage.from("problem-files").upload(path, file, { upsert: false });
        if (error) throw error;
        return path;
      };

      const [questionPath, answerPath, solutionPath] = await Promise.all([
        uploadOne(questionFile, "questions"),
        uploadOne(answerFile, "answers"),
        uploadOne(solutionFile, "solutions"),
      ]);

      const { data, error } = await supabase.from("problem_sources").insert({
        id: sourceId,
        title: sourceTitle.trim(),
        year: Number(sourceYear) || null,
        exam_type: sourceExamType,
        question_file_path: questionPath,
        answer_file_path: answerPath,
        solution_file_path: solutionPath,
        status: "uploaded",
      }).select("id,title,year,exam_type,question_file_path,answer_file_path,solution_file_path,status,problem_count,created_at").single();
      if (error) throw error;

      setProblemSources((prev) => [{
        id: data.id, title: data.title, year: data.year, examType: data.exam_type,
        questionFilePath: data.question_file_path, answerFilePath: data.answer_file_path,
        solutionFilePath: data.solution_file_path, status: data.status,
        problemCount: data.problem_count || 0, createdAt: data.created_at,
      }, ...prev]);
      setSourceTitle("");
      setQuestionFile(null);
      setAnswerFile(null);
      setSolutionFile(null);
      setNotice("문제 자료가 Supabase에 저장되었습니다. 다음 단계에서 AI 문항 분리를 연결합니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      setNotice(`자료 업로드 실패: ${message}`);
    } finally {
      setUploading(false);
    }
  }

  async function cycleExamStatus(exam: Exam) {
    const nextStatus: Exam["status"] = exam.status === "draft" ? "ready" : exam.status === "ready" ? "closed" : "draft";
    if (supabase && connection === "connected") {
      const { error } = await supabase.from("mock_exams").update({ status: nextStatus }).eq("id", exam.id);
      if (error) {
        setNotice(`상태 변경 실패: ${error.message}`);
        return;
      }
    }
    setExams((prev) => prev.map((item) => (item.id === exam.id ? { ...item, status: nextStatus } : item)));
  }

  function advanceLearningStep() {
    const currentIndex = stepOrder.indexOf(learningStep);
    const next = stepOrder[Math.min(currentIndex + 1, stepOrder.length - 1)];
    setLearningStep(next);
    setNotice(`${stepLabel[learningStep]} 승인이 완료되었습니다.`);
  }

  const nav: { id: Tab; label: string; icon: string }[] = [
    { id: "dashboard", label: "대시보드", icon: "⌂" },
    { id: "students", label: "학생 관리", icon: "◎" },
    { id: "exams", label: "모의고사 관리", icon: "▤" },
    { id: "library", label: "문제 라이브러리", icon: "▱" },
    { id: "recommend", label: "AI 추천", icon: "✦" },
    { id: "student", label: "학생 시험 화면", icon: "▶" },
  ];

  const connectionText =
    connection === "connected"
      ? "Supabase 연결 완료"
      : connection === "demo"
        ? "환경변수 미설정 · 데모 모드"
        : connection === "error"
          ? "Supabase 연결 오류"
          : "Supabase 확인 중";

  if (loading) {
    return <div className="loading-screen">MathPooh AI 연결 확인 중...</div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">M</div><div><b>MathPooh AI</b><span>Adaptive Math Lab</span></div></div>
        <nav>{nav.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
        <div className="sidebar-foot"><div className="avatar">이</div><div><b>이철용 원장</b><span>관리자</span></div></div>
      </aside>

      <main className="main">
        <header>
          <div><p className="eyebrow">MATHPOOH PILOT v0.3</p><h1>{nav.find((item) => item.id === tab)?.label}</h1></div>
          <div className="header-actions"><span className={`connection connection-${connection}`}><i /> {connectionText}</span><button className="ghost" onClick={() => void loadInitialData()}>새로고침</button></div>
        </header>

        {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}

        {tab === "dashboard" && <>
          <section className="hero"><div><span className="hero-chip">이번 주 운영</span><h2>학생의 다음 1문제를<br />AI가 찾아냅니다.</h2><p>공략 문항만 확인하면 진단 3 → 3, 훈련 10 → 10을 자동 구성합니다.</p><div className="hero-actions"><button className="primary" onClick={() => setTab("recommend")}>AI 추천 확인</button><button className="secondary" onClick={() => setTab("exams")}>모의고사 관리</button></div></div><div className="score-ring"><div><strong>{avg}</strong><span>파일럿 평균</span></div></div></section>
          <section className="stats"><article><span>파일럿 학생</span><strong>{students.length}명</strong><small>목표 5~7명</small></article><article><span>이번 주 모의고사</span><strong>{exams.filter((exam) => exam.status === "ready").length}회</strong><small>30문항 수능형</small></article><article><span>현재 추천 단계</span><strong>{stepLabel[learningStep]}</strong><small>3 → 3 → 10 → 10</small></article><article><span>데이터 저장</span><strong>{connection === "connected" ? "DB" : "Demo"}</strong><small>{connectionText}</small></article></section>
          <section className="two-col"><div className="panel"><div className="panel-title"><div><p>최근 학생 현황</p><h3>다음 점수를 만들 학생</h3></div><button onClick={() => setTab("students")}>전체 보기</button></div><div className="student-list">{students.slice(0, 4).map((item) => <div className="student-row" key={item.id}><div className="avatar small">{item.name[0]}</div><div className="grow"><b>{item.name}</b><span>{item.school} · {item.grade}</span></div><strong>{item.score}점</strong><span className="target">공략 {item.target || "-"}번</span></div>)}</div></div><div className="panel"><div className="panel-title"><div><p>AI 작업 흐름</p><h3>3 · 3 · 10 · 10</h3></div></div><div className="flow"><div><span>1</span><b>진단 3문항</b><small>쉬움·유사·어려움</small></div><div><span>2</span><b>추가 진단 3문항</b><small>학생 위치 정밀화</small></div><div><span>3</span><b>훈련 10문항</b><small>개념·구조·실전</small></div><div><span>4</span><b>추가 훈련 10문항</b><small>부족할 때만 자동 배정</small></div><div><span>5</span><b>다음 주 모의고사</b><small>별도 재진단 없이 검증</small></div></div></div></section>
        </>}

        {tab === "students" && <section className="panel large"><div className="panel-title"><div><p>STUDENTS</p><h3>파일럿 학생 관리</h3></div><button className="primary compact" onClick={() => void addStudent()}>학생 추가</button></div><table><thead><tr><th>학생</th><th>학교</th><th>학년</th><th>최근 점수</th><th>공략 문항</th><th>저장</th></tr></thead><tbody>{students.map((item) => <tr key={item.id}><td><b>{item.name}</b></td><td>{item.school}</td><td>{item.grade}</td><td>{item.score}점</td><td>{item.target ? `${item.target}번` : "미정"}</td><td><span className={`badge ${connection === "connected" ? "badge-ready" : "badge-draft"}`}>{connection === "connected" ? "Supabase" : "Demo"}</span></td></tr>)}</tbody></table></section>}

        {tab === "exams" && <section className="panel large"><div className="panel-title"><div><p>MOCK EXAMS</p><h3>주간 모의고사 관리</h3></div><button className="primary compact" onClick={() => void addExam()}>모의고사 추가</button></div><div className="exam-grid">{exams.map((exam) => <article key={exam.id}><div className="exam-top"><span className="exam-icon">▤</span><StatusBadge status={exam.status} /></div><h3>{exam.title}</h3><p>{exam.date} · {exam.questions}문항 · 100분</p><div className="exam-actions"><button onClick={() => void cycleExamStatus(exam)}>{exam.status === "draft" ? "응시 오픈" : exam.status === "ready" ? "시험 종료" : "초안 복귀"}</button><button>문항 보기</button></div></article>)}</div></section>}

        {tab === "library" && <section className="library-v03">
          <div className="panel upload-source">
            <p className="eyebrow">PROBLEM LIBRARY</p>
            <h3>문제 자료 등록</h3>
            <p className="muted">시험지 1개는 필수, 정답표와 해설지는 선택입니다. 파일은 Supabase Storage에 실제 저장됩니다.</p>
            <div className="source-form">
              <label><span>자료 이름</span><input value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} placeholder="예: 2026년 7월 4주차 수능형 모의고사" /></label>
              <div className="form-row"><label><span>연도</span><input value={sourceYear} onChange={(e) => setSourceYear(e.target.value)} /></label><label><span>자료 종류</span><select value={sourceExamType} onChange={(e) => setSourceExamType(e.target.value)}><option>주간 모의고사</option><option>교육청 학평</option><option>평가원 모평</option><option>수능</option><option>시중 교재</option><option>자체 제작</option></select></label></div>
              <label className="file-line"><span>시험지 PDF <b>필수</b></span><input type="file" accept=".pdf,image/*" onChange={(e) => setQuestionFile(e.target.files?.[0] ?? null)} /><small>{questionFile?.name || "선택된 파일 없음"}</small></label>
              <label className="file-line"><span>정답표 <em>선택</em></span><input type="file" accept=".pdf,image/*,.xlsx,.csv" onChange={(e) => setAnswerFile(e.target.files?.[0] ?? null)} /><small>{answerFile?.name || "선택된 파일 없음"}</small></label>
              <label className="file-line"><span>해설지 <em>선택</em></span><input type="file" accept=".pdf,image/*" onChange={(e) => setSolutionFile(e.target.files?.[0] ?? null)} /><small>{solutionFile?.name || "선택된 파일 없음"}</small></label>
              <button className="primary full" disabled={uploading || !sourceTitle.trim() || !questionFile} onClick={() => void uploadProblemSource()}>{uploading ? "업로드 중..." : "문제 자료 저장"}</button>
            </div>
          </div>
          <div className="panel source-list-panel">
            <div className="panel-title"><div><p>REGISTERED SOURCES</p><h3>등록된 문제 자료</h3></div><span className="confidence">{problemSources.length}개</span></div>
            {problemSources.length === 0 ? <div className="empty"><span>▱</span><p>아직 등록된 문제 자료가 없습니다.</p></div> : <div className="source-list">{problemSources.map((source) => <article key={source.id}><div><span className={`source-status source-${source.status}`}>{source.status === "uploaded" ? "업로드 완료" : source.status === "analyzing" ? "분석 중" : source.status === "ready" ? "분석 완료" : "오류"}</span><h4>{source.title}</h4><p>{source.year || "연도 미정"} · {source.examType}</p></div><div className="source-files"><span className={source.questionFilePath ? "ok" : ""}>시험지</span><span className={source.answerFilePath ? "ok" : ""}>정답</span><span className={source.solutionFilePath ? "ok" : ""}>해설</span></div><button disabled>AI 분석 대기</button></article>)}</div>}
          </div>
        </section>}

        {tab === "recommend" && student && <section className="recommend-layout">
          <div className="panel selector"><p className="eyebrow">TARGET STUDENT</p><h3>공략 학생 선택</h3><select value={selectedStudent} onChange={(event) => { setSelectedStudent(event.target.value); setLearningStep("diagnostic1"); }}>{students.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.score}점</option>)}</select><div className="target-card"><span>이번 주 공략 문항</span><strong>{student.target || "-"}번</strong><p>맞힐 가능성이 가장 높은 다음 점수</p></div><div className="student-meta"><span>학교<b>{student.school}</b></span><span>최근 점수<b>{student.score}점</b></span><span>목표 점수<b>{Math.min(100, student.score + 4)}점</b></span></div></div>

          <div className="panel recommendation"><div className="panel-title"><div><p>ADAPTIVE PATH</p><h3>{student.name} · {stepLabel[learningStep]}</h3></div><span className="confidence">AI 자동 구성</span></div>
            <div className="stepper">{stepOrder.map((step, index) => { const current = stepOrder.indexOf(learningStep); return <div key={step} className={index < current ? "done" : index === current ? "current" : ""}><span>{index + 1}</span><b>{stepLabel[step]}</b></div>; })}</div>

            {(learningStep === "diagnostic1" || learningStep === "diagnostic2") && <>
              <div className="problem-cards">{(learningStep === "diagnostic1" ? firstDiagnostic : secondDiagnostic).map((problem) => <article key={problem.id}><span className={`level level-${problem.level}`}>{problem.level}</span><div><h4>{problem.source} {problem.no}번</h4><p>{problem.concept}</p></div><strong>{problem.confidence}%</strong><button>교체</button></article>)}</div>
              <div className="ai-note"><span>✦</span><p><b>AI 판단</b><br />정답 여부와 풀이시간을 함께 보아 학생의 위치를 좁힙니다. 첫 3문항으로 충분하지 않으면 다음 3문항이 자동 제안됩니다.</p></div>
              <div className="approve"><button className="secondary">전체 미리보기</button><button className="primary" onClick={advanceLearningStep}>{learningStep === "diagnostic1" ? "첫 진단 3문항 승인" : "추가 진단 3문항 승인"}</button></div>
            </>}

            {(learningStep === "training1" || learningStep === "training2") && <div className="training-stage"><div className="training-number">10<span>문항</span></div><h4>{learningStep === "training1" ? "1차 훈련 세트" : "2차 추가 훈련 세트"}</h4><p>개념 3문항 · 구조 전이 4문항 · 실전 3문항</p><div className="progress"><i style={{ width: learningStep === "training1" ? "52%" : "82%" }} /></div><div className="approve"><button className="secondary">10문항 미리보기</button><button className="primary" onClick={advanceLearningStep}>{learningStep === "training1" ? "훈련 10문항 승인" : "추가 10문항 승인"}</button></div></div>}

            {learningStep === "nextExam" && <div className="next-exam-card"><span>✓</span><h3>이번 주 학습 경로 완료</h3><p>별도의 재진단 시험은 만들지 않습니다. 다음 주 모의고사가 실제 점수 상승을 검증합니다.</p><button className="primary" onClick={() => { setTab("exams"); setLearningStep("diagnostic1"); }}>다음 모의고사 관리</button></div>}
          </div>
        </section>}

        {tab === "student" && student && <section className="student-exam"><div className="panel exam-intro"><p className="eyebrow">STUDENT MODE</p><h2>{student.name} 학생</h2><h3>7월 4주차 수능형 모의고사</h3><div className="exam-info"><span><b>30</b>문항</span><span><b>100</b>분</span><span><b>100</b>점</span></div>{!examRunning ? <button className="primary full" onClick={() => { setExamRunning(true); setSubmitted(false); }}>모의고사 시작</button> : <button className="secondary full" onClick={() => setExamRunning(false)}>시험 종료</button>}</div>{examRunning && <div className="panel answer-sheet"><div className="panel-title"><div><p>ANSWER SHEET</p><h3>답안 입력</h3></div><span className="timer">99:42</span></div><div className="answers">{Array.from({ length: 30 }, (_, index) => index + 1).map((number) => <label key={number}><span>{number}</span><input value={answers[number] ?? ""} onChange={(event) => setAnswers({ ...answers, [number]: event.target.value })} placeholder="답" /></label>)}</div><button className="primary full" onClick={() => setSubmitted(true)}>답안 제출 및 채점</button>{submitted && <div className="result-box"><strong>84점</strong><span>오답 13, 15, 20, 28번</span><p>다음 공략 문항: <b>13번</b></p></div>}</div>}</section>}
      </main>
    </div>
  );
}
