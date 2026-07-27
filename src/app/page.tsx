"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseConfig } from "@/lib/supabase";

type AdminMenu = "dashboard" | "students" | "exams" | "problems" | "analysis" | "bank" | "recommend" | "results" | "settings";
type StudentStatus = "정상" | "휴원" | "퇴원";
type SosStatus = "분석완료" | "훈련중" | "진단대기" | "미응시";
type StudentTab = "students" | "registration";
type ExamRound = { id: number; name: string; date: string; grade: string; status: "등록중" | "마감" };
type ExamStatus = "작성중" | "등록완료" | "마감";
type PracticeExam = {
  id: string;
  round: number;
  title: string;
  examCode: string;
  examDate: string;
  grade: string;
  subject: string;
  range: string;
  questionCount: number;
  timeLimit: number;
  totalScore: number;
  objectiveCount: number;
  shortAnswerCount: number;
  status: ExamStatus;
  testFile: string;
  solutionFile: string;
  originalFile: string;
  memo: string;
  testFilePath?: string;
  solutionFilePath?: string;
  originalFilePath?: string;
  answers: string[];
  answerVerified: boolean;
  coverVerified: boolean;
  regionVerified: boolean;
};

type ExamFileBundle = { test?: File; solution?: File; original?: File };
type Student = {
  id: number;
  name: string;
  school: string;
  grade: string;
  phone: string;
  parentPhone: string;
  status: StudentStatus;
  sosStatus: SosStatus;
  lastScore: number | null;
  lastExam: string;
  joinedAt: string;
  memo: string;
};

type MenuItem = { id: AdminMenu; label: string; icon: string; badge?: number };

const menus: MenuItem[] = [
  { id: "dashboard", label: "대시보드", icon: "⌂" },
  { id: "students", label: "학생 관리", icon: "♙" },
  { id: "exams", label: "실전 모의고사", icon: "▤" },
  { id: "problems", label: "AI 문제등록", icon: "▦" },
  { id: "analysis", label: "AI 분석 관리", icon: "✦", badge: 12 },
  { id: "bank", label: "문제은행", icon: "▣" },
  { id: "recommend", label: "SOS 추천", icon: "◎", badge: 7 },
  { id: "results", label: "결과 · 이력", icon: "↗" },
  { id: "settings", label: "환경 설정", icon: "⚙" },
];

const initialStudents: Student[] = [
  { id: 1, name: "김민준", school: "보성고", grade: "고2", phone: "010-2451-7812", parentPhone: "010-9345-1208", status: "정상", sosStatus: "분석완료", lastScore: 82, lastExam: "2026.07.24", joinedAt: "2026.03.02", memo: "미적분 준킬러 보완 필요" },
  { id: 2, name: "문예진", school: "잠실여고", grade: "고1", phone: "010-5287-1194", parentPhone: "010-7741-2506", status: "정상", sosStatus: "훈련중", lastScore: 76, lastExam: "2026.07.24", joinedAt: "2026.02.26", memo: "공통수학2 계산 속도 훈련 중" },
  { id: 3, name: "김가연B", school: "영동일고", grade: "고1", phone: "010-3198-4421", parentPhone: "010-8842-3190", status: "정상", sosStatus: "진단대기", lastScore: 68, lastExam: "2026.07.23", joinedAt: "2026.04.01", memo: "첫 진단 결과 확인 필요" },
  { id: 4, name: "송연우", school: "배명고", grade: "고2", phone: "010-6683-2071", parentPhone: "010-9210-6675", status: "정상", sosStatus: "분석완료", lastScore: 91, lastExam: "2026.07.22", joinedAt: "2025.12.18", memo: "상위권 실전 훈련 유지" },
  { id: 5, name: "이도윤", school: "정신여고", grade: "고3", phone: "010-4720-1386", parentPhone: "010-3165-8021", status: "휴원", sosStatus: "미응시", lastScore: null, lastExam: "-", joinedAt: "2026.01.08", memo: "8월 복귀 예정" },
  { id: 6, name: "박서준", school: "잠신고", grade: "중3", phone: "010-9074-5312", parentPhone: "010-2764-9160", status: "정상", sosStatus: "훈련중", lastScore: 88, lastExam: "2026.07.20", joinedAt: "2026.06.10", memo: "고등 선행 진단 진행" },
];


const examRounds: ExamRound[] = [
  { id: 1, name: "2026 SOS 1회", date: "2026.08.02", grade: "고1", status: "등록중" },
  { id: 2, name: "2026 SOS 2회", date: "2026.08.09", grade: "고2", status: "등록중" },
  { id: 3, name: "2026 SOS 3회", date: "2026.08.16", grade: "고3", status: "등록중" },
  { id: 4, name: "2026 SOS 4회", date: "2026.07.19", grade: "전체", status: "마감" },
];


const initialPracticeExams: PracticeExam[] = [
  { id: "demo-1", round: 1, title: "2026 SOS 고1 실전모의고사 1회", examCode: "SOS-H1-2026-01", examDate: "2026-08-02", grade: "고1", subject: "공통수학2", range: "도형의 방정식 ~ 집합과 명제", questionCount: 30, timeLimit: 80, totalScore: 100, objectiveCount: 21, shortAnswerCount: 9, status: "등록완료", testFile: "SOS_H1_01_시험지.pdf", solutionFile: "SOS_H1_01_해설지.pdf", originalFile: "", answers: Array(30).fill(""), answerVerified: false, coverVerified: false, regionVerified: false, memo: "고1 여름방학 진단용" },
  { id: "demo-2", round: 2, title: "2026 SOS 고2 실전모의고사 2회", examCode: "SOS-H2-2026-02", examDate: "2026-08-09", grade: "고2", subject: "수학Ⅱ", range: "함수의 극한 ~ 미분", questionCount: 30, timeLimit: 80, totalScore: 100, objectiveCount: 21, shortAnswerCount: 9, status: "작성중", testFile: "", solutionFile: "", originalFile: "", answers: Array(30).fill(""), answerVerified: false, coverVerified: false, regionVerified: false, memo: "문항 검토 중" },
];

const emptyStudent: Omit<Student, "id"> = {
  name: "", school: "", grade: "고1", phone: "", parentPhone: "", status: "정상", sosStatus: "진단대기", lastScore: null, lastExam: "-", joinedAt: new Date().toISOString().slice(0, 10), memo: "",
};

export default function Home() {
  const [active, setActive] = useState<AdminMenu>("students");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("matspu-admin-menu") as AdminMenu | null;
    if (saved && menus.some((menu) => menu.id === saved)) setActive(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("matspu-admin-menu", active);
  }, [active]);
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [practiceExams, setPracticeExams] = useState<PracticeExam[]>(initialPracticeExams);
  const [examFiles, setExamFiles] = useState<Record<string, ExamFileBundle>>({});

  useEffect(() => {
    const config = getSupabaseConfig();
    if (!config) return;
    (async () => {
      try {
        const response = await fetch(`${config.url}/rest/v1/exams?select=*&order=round.asc`, {
          headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
          cache: "no-store",
        });
        if (!response.ok) throw new Error(await response.text());
        const rows = await response.json();
        setPracticeExams(rows.map(examFromRow));
      } catch (error) {
        console.error("Supabase 시험 목록 불러오기 실패", error);
      }
    })();
  }, []);

  const title = menus.find((menu) => menu.id === active)?.label ?? "대시보드";

  return (
    <main className={`admin-app ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-symbol">M</div>
          <div className="brand-copy"><strong>MATSPU SOS</strong><span>Score Optimization System</span></div>
          <button className="collapse-button" onClick={() => setCollapsed((v) => !v)} aria-label="사이드바 접기">‹</button>
        </div>
        <div className="workspace-card">
          <div className="workspace-logo">M</div>
          <div><strong>매쓰푸</strong><span>관리자 워크스페이스</span></div>
          <b>⌄</b>
        </div>
        <nav className="side-nav">
          <p>운영 메뉴</p>
          {menus.filter((menu) => menu.id !== "settings").map((menu) => (
            <button key={menu.id} className={active === menu.id ? "active" : ""} onClick={() => {
              if (menu.id === "bank") {
                window.location.href = "/problem-bank";
                return;
              }
              setActive(menu.id);
            }}>
              <i>{menu.icon}</i><span>{menu.label}</span>{menu.badge ? <b>{menu.badge}</b> : null}
            </button>
          ))}
          <p className="system-title">시스템</p>
          {menus.filter((menu) => menu.id === "settings").map((menu) => (
            <button key={menu.id} className={active === menu.id ? "active" : ""} onClick={() => setActive(menu.id)}>
              <i>{menu.icon}</i><span>{menu.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="admin-avatar">이</div>
          <div><strong>이철용 원장</strong><span>최고 관리자</span></div>
          <button>⋮</button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div><p>매쓰푸 SOS 관리자</p><h1>{title}</h1></div>
          <div className="top-actions">
            <button className="icon-button">?</button>
            <button className="icon-button notification">♢<b>3</b></button>
            <button className="primary-button" onClick={() => setActive("exams")}>＋ 새 시험 만들기</button>
          </div>
        </header>
        <div className="page-content">
          {active === "students" ? <StudentsPage students={students} setStudents={setStudents} /> : active === "exams" ? <ExamsPage exams={practiceExams} setExams={setPracticeExams} examFiles={examFiles} setExamFiles={setExamFiles} /> : active === "results" ? <ResultsPage students={students} /> : active === "problems" ? <ProblemsPage onOpenAnalysis={(sourceFileId) => { window.localStorage.setItem("matspu-analysis-source-id", sourceFileId); setActive("analysis"); }} /> : active === "analysis" ? <AnalysisPage /> : active === "dashboard" ? <Dashboard students={students} onMove={setActive} /> : <ComingSoon title={title} onMove={setActive} />}
        </div>
      </section>
    </main>
  );
}

function StudentsPage({ students, setStudents }: { students: Student[]; setStudents: React.Dispatch<React.SetStateAction<Student[]>> }) {
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("전체");
  const [status, setStatus] = useState("전체");
  const [selected, setSelected] = useState<Student | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [tab, setTab] = useState<StudentTab>("students");
  const [selectedRoundId, setSelectedRoundId] = useState(examRounds[0].id);

  useEffect(() => {
    const saved = window.localStorage.getItem("matspu-student-tab") as StudentTab | null;
    if (saved === "students" || saved === "registration") setTab(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("matspu-student-tab", tab);
  }, [tab]);
  const [registrations, setRegistrations] = useState<Record<number, number[]>>({ 1: [1, 2, 4], 2: [1, 4], 3: [5], 4: [1, 2, 3, 4, 6] });

  const filtered = useMemo(() => students.filter((student) => {
    const keyword = `${student.name} ${student.school} ${student.phone} ${student.parentPhone}`.toLowerCase();
    return keyword.includes(search.toLowerCase()) && (grade === "전체" || student.grade === grade) && (status === "전체" || student.status === status);
  }), [students, search, grade, status]);

  const stats = {
    all: students.length,
    active: students.filter((s) => s.status === "정상").length,
    paused: students.filter((s) => s.status === "휴원").length,
    left: students.filter((s) => s.status === "퇴원").length,
  };

  const saveStudent = (form: Omit<Student, "id">) => {
    if (editing) {
      setStudents((prev) => prev.map((s) => s.id === editing.id ? { ...form, id: editing.id } : s));
      setSelected((prev) => prev?.id === editing.id ? { ...form, id: editing.id } : prev);
    } else {
      setStudents((prev) => [{ ...form, id: Math.max(0, ...prev.map((s) => s.id)) + 1 }, ...prev]);
    }
    setEditing(null); setIsAdding(false);
  };

  const removeStudent = (id: number) => {
    if (!window.confirm("이 학생을 목록에서 삭제할까요?")) return;
    setStudents((prev) => prev.filter((s) => s.id !== id));
    setSelected(null);
  };

  const selectedRound = examRounds.find((round) => round.id === selectedRoundId) ?? examRounds[0];
  const roundStudents = students.filter((student) => student.status === "정상" && (selectedRound.grade === "전체" || student.grade === selectedRound.grade));
  const registeredIds = registrations[selectedRoundId] ?? [];
  const toggleRegistration = (studentId: number) => {
    setRegistrations((prev) => {
      const current = prev[selectedRoundId] ?? [];
      return { ...prev, [selectedRoundId]: current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId] };
    });
  };
  const registerAll = () => setRegistrations((prev) => ({ ...prev, [selectedRoundId]: roundStudents.map((student) => student.id) }));
  const clearAll = () => setRegistrations((prev) => ({ ...prev, [selectedRoundId]: [] }));


  return <>
    <section className="page-title-row">
      <div><h2>학생 관리</h2><p>학생 기본정보와 시험회차별 등록 여부를 관리합니다.</p></div>
      <button className="primary-button" onClick={() => { setEditing(null); setIsAdding(true); }}>＋ 학생 등록</button>
    </section>

    <div className="student-tabs">
      <button className={tab === "students" ? "active" : ""} onClick={() => setTab("students")}>학생 목록</button>
      <button className={tab === "registration" ? "active" : ""} onClick={() => setTab("registration")}>시험회차별 등록여부</button>
    </div>

    {tab === "students" ? <>
      <section className="student-stat-grid">
        <MiniStat label="전체 학생" value={`${stats.all}명`} note="등록 기준" />
        <MiniStat label="재원 학생" value={`${stats.active}명`} note="정상 상태" />
        <MiniStat label="휴원 학생" value={`${stats.paused}명`} note="일시 중단" emphasis />
        <MiniStat label="퇴원 학생" value={`${stats.left}명`} note="퇴원 처리" />
      </section>

    <section className="panel student-panel">
      <div className="student-toolbar">
        <label className="global-search large"><span>⌕</span><input placeholder="학생 이름, 학교, 연락처 검색" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <select value={grade} onChange={(e) => setGrade(e.target.value)}><option>전체</option><option>중3</option><option>고1</option><option>고2</option><option>고3</option></select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option>전체</option><option>정상</option><option>휴원</option><option>퇴원</option></select>
        <button className="secondary-button" onClick={() => { setSearch(""); setGrade("전체"); setStatus("전체"); }}>초기화</button>
      </div>
      <div className="list-summary"><strong>학생 {filtered.length}명</strong><span>행을 클릭하면 학생 상세정보가 열립니다.</span></div>
      <div className="data-table student-list">
        <div className="table-head"><span>학생</span><span>학교 / 학년</span><span>학생 연락처</span><span>학부모 연락처</span><span>재원 상태</span><span>등록일</span><span>관리</span></div>
        {filtered.map((student) => (
          <div className="table-row clickable" key={student.id} onClick={() => setSelected(student)}>
            <div className="student-name"><i>{student.name.slice(0, 1)}</i><div><strong>{student.name}</strong><small>등록 {student.joinedAt}</small></div></div>
            <span>{student.school} · {student.grade}</span><span>{student.phone}</span><span>{student.parentPhone}</span>
            <Status text={student.status} /><span>{student.joinedAt}</span>
            <button className="more-button" onClick={(e) => { e.stopPropagation(); setEditing(student); }}>수정</button>
          </div>
        ))}
        {filtered.length === 0 && <div className="empty-list">조건에 맞는 학생이 없습니다.</div>}
      </div>
    </section>
    </> : <section className="panel registration-panel">
      <div className="registration-header">
        <div>
          <span className="section-kicker">시험회차 선택</span>
          <select value={selectedRoundId} onChange={(e) => setSelectedRoundId(Number(e.target.value))}>
            {examRounds.map((round) => <option key={round.id} value={round.id}>{round.name} · {round.date} · {round.grade}</option>)}
          </select>
        </div>
        <div className="registration-actions">
          <button className="secondary-button" onClick={clearAll}>전체 미등록</button>
          <button className="primary-button" onClick={registerAll}>전체 등록</button>
        </div>
      </div>
      <div className="round-summary">
        <div><span>시험 회차</span><strong>{selectedRound.name}</strong></div>
        <div><span>시험일</span><strong>{selectedRound.date}</strong></div>
        <div><span>대상</span><strong>{selectedRound.grade}</strong></div>
        <div><span>등록 현황</span><strong>{registeredIds.filter((id) => roundStudents.some((student) => student.id === id)).length} / {roundStudents.length}명</strong></div>
      </div>
      <div className="registration-progress"><i style={{ width: `${roundStudents.length ? (registeredIds.filter((id) => roundStudents.some((student) => student.id === id)).length / roundStudents.length) * 100 : 0}%` }} /></div>
      <div className="data-table registration-list">
        <div className="table-head"><span>학생</span><span>학교 / 학년</span><span>학생 연락처</span><span>학부모 연락처</span><span>등록 여부</span><span>변경</span></div>
        {roundStudents.map((student) => {
          const isRegistered = registeredIds.includes(student.id);
          return <div className="table-row" key={student.id}>
            <div className="student-name"><i>{student.name.slice(0, 1)}</i><div><strong>{student.name}</strong><small>{student.school}</small></div></div>
            <span>{student.school} · {student.grade}</span><span>{student.phone}</span><span>{student.parentPhone}</span>
            <span className={`registration-state ${isRegistered ? "registered" : "unregistered"}`}>{isRegistered ? "등록" : "미등록"}</span>
            <button className={`toggle-register ${isRegistered ? "on" : ""}`} onClick={() => toggleRegistration(student.id)}>{isRegistered ? "등록 취소" : "등록하기"}</button>
          </div>;
        })}
        {roundStudents.length === 0 && <div className="empty-list">이 회차 대상 학생이 없습니다.</div>}
      </div>
    </section>}

    {(isAdding || editing) && <StudentModal initial={editing ?? emptyStudent} title={editing ? "학생 정보 수정" : "새 학생 등록"} onClose={() => { setIsAdding(false); setEditing(null); }} onSave={saveStudent} />}
    {selected && <StudentDrawer student={selected} onClose={() => setSelected(null)} onEdit={() => setEditing(selected)} onDelete={() => removeStudent(selected.id)} />}
  </>;
}

function StudentModal({ initial, title, onClose, onSave }: { initial: Student | Omit<Student, "id">; title: string; onClose: () => void; onSave: (student: Omit<Student, "id">) => void }) {
  const [form, setForm] = useState<Omit<Student, "id">>({ name: initial.name, school: initial.school, grade: initial.grade, phone: initial.phone, parentPhone: initial.parentPhone, status: initial.status, sosStatus: initial.sosStatus, lastScore: initial.lastScore, lastExam: initial.lastExam, joinedAt: initial.joinedAt, memo: initial.memo });
  const set = <K extends keyof Omit<Student, "id">>(key: K, value: Omit<Student, "id">[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = (e: FormEvent) => { e.preventDefault(); if (!form.name.trim() || !form.school.trim()) return alert("학생 이름과 학교를 입력해 주세요."); onSave(form); };
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="student-modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
    <div className="modal-head"><div><h3>{title}</h3><p>매쓰푸 SOS에서 사용할 학생 기본정보입니다.</p></div><button type="button" onClick={onClose}>×</button></div>
    <div className="form-grid">
      <Field label="학생 이름 *"><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="예: 김민준" /></Field>
      <Field label="학교 *"><input value={form.school} onChange={(e) => set("school", e.target.value)} placeholder="예: 보성고" /></Field>
      <Field label="학년"><select value={form.grade} onChange={(e) => set("grade", e.target.value)}><option>중3</option><option>고1</option><option>고2</option><option>고3</option></select></Field>
      <Field label="재원 상태"><select value={form.status} onChange={(e) => set("status", e.target.value as StudentStatus)}><option>정상</option><option>휴원</option><option>퇴원</option></select></Field>
      <Field label="학생 연락처"><input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="010-0000-0000" /></Field>
      <Field label="학부모 연락처"><input value={form.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} placeholder="010-0000-0000" /></Field>
      <Field label="등록일"><input type="date" value={form.joinedAt} onChange={(e) => set("joinedAt", e.target.value)} /></Field>
      <label className="field full"><span>관리 메모</span><textarea value={form.memo} onChange={(e) => set("memo", e.target.value)} placeholder="학생 지도에 필요한 메모를 입력하세요." /></label>
    </div>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>취소</button><button className="primary-button">저장</button></div>
  </form></div>;
}

function StudentDrawer({ student, onClose, onEdit, onDelete }: { student: Student; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="student-drawer" onMouseDown={(e) => e.stopPropagation()}>
    <div className="drawer-head"><span>학생 상세정보</span><button onClick={onClose}>×</button></div>
    <div className="student-profile"><i>{student.name.slice(0, 1)}</i><div><h3>{student.name}</h3><p>{student.school} · {student.grade}</p></div><Status text={student.status} /></div>
    <div className="detail-section"><h4>기본 정보</h4><Detail label="학생 연락처" value={student.phone || "-"} /><Detail label="학부모 연락처" value={student.parentPhone || "-"} /><Detail label="등록일" value={student.joinedAt} /><Detail label="재원 상태" value={student.status} /></div>
    <div className="detail-section"><h4>관리 메모</h4><p className="memo-box">{student.memo || "등록된 메모가 없습니다."}</p></div>
    <div className="drawer-actions"><button className="secondary-button danger" onClick={onDelete}>학생 삭제</button><button className="primary-button" onClick={onEdit}>정보 수정</button></div>
  </aside></div>;
}

function ResultsPage({ students }: { students: Student[] }) {
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("전체");
  const filtered = students.filter((student) => (`${student.name} ${student.school}`).toLowerCase().includes(search.toLowerCase()) && (grade === "전체" || student.grade === grade));

  return <>
    <section className="page-title-row"><div><h2>성적 관리</h2><p>학생별 점수, 최근 응시일과 SOS 진행 상태를 관리합니다.</p></div></section>
    <section className="student-stat-grid">
      <MiniStat label="성적 등록 학생" value={`${students.filter(s => s.lastScore !== null).length}명`} note="최근 점수 기준" />
      <MiniStat label="분석 완료" value={`${students.filter(s => s.sosStatus === "분석완료").length}명`} note="분석 결과 확인" />
      <MiniStat label="훈련중" value={`${students.filter(s => s.sosStatus === "훈련중").length}명`} note="SOS 진행중" emphasis />
      <MiniStat label="진단 대기" value={`${students.filter(s => s.sosStatus === "진단대기").length}명`} note="확인 필요" />
    </section>
    <section className="panel student-panel">
      <div className="student-toolbar">
        <label className="global-search large"><span>⌕</span><input placeholder="학생 이름, 학교 검색" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <select value={grade} onChange={(e) => setGrade(e.target.value)}><option>전체</option><option>중3</option><option>고1</option><option>고2</option><option>고3</option></select>
      </div>
      <div className="list-summary"><strong>성적 {filtered.length}명</strong><span>점수와 SOS 상태는 성적관리에서 확인합니다.</span></div>
      <div className="data-table results-list">
        <div className="table-head"><span>학생</span><span>학교 / 학년</span><span>최근 점수</span><span>최근 응시</span><span>SOS 상태</span><span>관리 메모</span></div>
        {filtered.map((student) => <div className="table-row" key={student.id}>
          <div className="student-name"><i>{student.name.slice(0,1)}</i><div><strong>{student.name}</strong><small>{student.phone}</small></div></div>
          <span>{student.school} · {student.grade}</span><b className="score-cell">{student.lastScore === null ? "-" : `${student.lastScore}점`}</b><span>{student.lastExam}</span><Status text={student.sosStatus} /><span>{student.memo || "-"}</span>
        </div>)}
      </div>
    </section>
  </>;
}


function examFromRow(row: any): PracticeExam {
  return {
    id: String(row.id),
    round: Number(row.round ?? 1),
    title: row.title ?? "",
    examCode: row.exam_code ?? "",
    examDate: row.exam_date ?? "",
    grade: row.grade ?? "고1",
    subject: row.subject ?? "",
    range: row.exam_range ?? "",
    questionCount: Number(row.question_count ?? 30),
    timeLimit: Number(row.time_limit ?? 100),
    totalScore: Number(row.total_score ?? 100),
    objectiveCount: Number(row.objective_count ?? 21),
    shortAnswerCount: Number(row.short_answer_count ?? 9),
    status: (row.status ?? "작성중") as ExamStatus,
    testFile: row.test_file_name ?? "",
    solutionFile: row.solution_file_name ?? "",
    originalFile: row.original_file_name ?? "",
    answers: Array.isArray(row.answer_keys) ? row.answer_keys.map(String) : Array(Number(row.question_count ?? 30)).fill(""),
    testFilePath: row.test_file_path ?? "",
    solutionFilePath: row.solution_file_path ?? "",
    originalFilePath: row.original_file_path ?? "",
    memo: row.memo ?? "",
    answerVerified: Boolean(row.answer_verified),
    coverVerified: Boolean(row.cover_verified),
    regionVerified: Boolean(row.region_verified),
  };
}

function examToRow(exam: Omit<PracticeExam, "id">, paths: { testFilePath?: string; solutionFilePath?: string; originalFilePath?: string }) {
  return {
    round: exam.round,
    title: exam.title,
    exam_code: exam.examCode,
    exam_date: exam.examDate,
    grade: exam.grade,
    subject: exam.subject,
    exam_range: exam.range,
    question_count: exam.questionCount,
    time_limit: exam.timeLimit,
    total_score: exam.totalScore,
    objective_count: exam.objectiveCount,
    short_answer_count: exam.shortAnswerCount,
    status: exam.status,
    test_file_name: exam.testFile,
    solution_file_name: exam.solutionFile,
    original_file_name: exam.originalFile,
    answer_keys: exam.answers,
    answer_verified: exam.answerVerified,
    cover_verified: exam.coverVerified,
    region_verified: exam.regionVerified,
    test_file_path: paths.testFilePath ?? exam.testFilePath ?? "",
    solution_file_path: paths.solutionFilePath ?? exam.solutionFilePath ?? "",
    original_file_path: paths.originalFilePath ?? exam.originalFilePath ?? "",
    memo: exam.memo,
  };
}

function storagePublicUrl(path?: string) {
  const config = getSupabaseConfig();
  if (!config || !path) return "";
  return `${config.url}/storage/v1/object/public/exam-files/${path}`;
}

async function uploadExamFile(examId: string, kind: "test" | "solution" | "original", file: File) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${examId}/${kind}-${Date.now()}-${safeName}`;
  const response = await fetch(`${config.url}/storage/v1/object/exam-files/${path}`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: file,
  });
  if (!response.ok) throw new Error(await response.text());
  return path;
}

function ExamsPage({ exams, setExams, examFiles, setExamFiles }: { exams: PracticeExam[]; setExams: React.Dispatch<React.SetStateAction<PracticeExam[]>>; examFiles: Record<string, ExamFileBundle>; setExamFiles: React.Dispatch<React.SetStateAction<Record<string, ExamFileBundle>>> }) {
  const [tab, setTab] = useState<"list" | "input">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftFiles, setDraftFiles] = useState<ExamFileBundle>({});
  const [preview, setPreview] = useState<{ title: string; source: File | string; fileName: string } | null>(null);
  const [htmlPreview, setHtmlPreview] = useState<{ title: string; html: string } | null>(null);
  const [regionDrafts, setRegionDrafts] = useState<Record<number, "자동인식" | "확인필요">>({});
  const [saving, setSaving] = useState(false);

  // 시험 입력 화면은 임시 작업 화면이므로 새로고침 후 복원하지 않습니다.
  // F5를 누르면 항상 안전한 시험 목록에서 시작합니다.
  useEffect(() => {
    window.localStorage.removeItem("matspu-exam-tab");
    setTab("list");
  }, []);

  const makeEmptyExam = (): Omit<PracticeExam, "id"> => ({
    round: Math.max(0, ...exams.map((exam) => exam.round)) + 1, title: "", examCode: "",
    examDate: new Date().toISOString().slice(0, 10), grade: "고1", subject: "공통수학1", range: "",
    questionCount: 30, timeLimit: 100, totalScore: 100, objectiveCount: 21, shortAnswerCount: 9,
    status: "작성중", testFile: "", solutionFile: "", originalFile: "", testFilePath: "", solutionFilePath: "", originalFilePath: "", answers: Array(30).fill(""), answerVerified: false, coverVerified: false, regionVerified: false, memo: "",
  });
  const [form, setForm] = useState<Omit<PracticeExam, "id">>(() => makeEmptyExam());
  const set = <K extends keyof Omit<PracticeExam, "id">>(key: K, value: Omit<PracticeExam, "id">[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const startNew = () => { setEditingId(null); setDraftFiles({}); setRegionDrafts({}); setForm(makeEmptyExam()); setTab("input"); };
  const editExam = (exam: PracticeExam) => { const { id, ...rest } = exam; setEditingId(id); setDraftFiles(examFiles[id] ?? {}); setForm(rest); setRegionDrafts({}); setTab("input"); };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.examCode.trim() || !form.examDate) return alert("시험명, 시험코드, 시험일을 입력해 주세요.");
    if (form.objectiveCount + form.shortAnswerCount !== form.questionCount) return alert("객관식과 단답형 문항 수의 합이 전체 문항 수와 같아야 합니다.");
    const config = getSupabaseConfig();
    if (!config) return alert("Supabase 환경변수가 없습니다. .env.local을 확인해 주세요.");
    setSaving(true);
    try {
      let answersForSave = form.answers;
      const solutionSource = draftFiles.solution ?? getPdfSource("solution");
      if (solutionSource && !form.answers.some(Boolean)) {
        answersForSave = await readAnswersFromPdf(solutionSource);
        set("answers", answersForSave);
      }
      const formForSave = { ...form, answers: answersForSave };
      let examId = editingId;
      if (!examId) {
        const createResponse = await fetch(`${config.url}/rest/v1/exams`, {
          method: "POST",
          headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify(examToRow(formForSave, {})),
        });
        if (!createResponse.ok) throw new Error(await createResponse.text());
        examId = String((await createResponse.json())[0].id);
      }
      const paths = { testFilePath: form.testFilePath, solutionFilePath: form.solutionFilePath, originalFilePath: form.originalFilePath };
      if (draftFiles.test) paths.testFilePath = await uploadExamFile(examId, "test", draftFiles.test);
      if (draftFiles.solution) paths.solutionFilePath = await uploadExamFile(examId, "solution", draftFiles.solution);
      if (draftFiles.original) paths.originalFilePath = await uploadExamFile(examId, "original", draftFiles.original);
      const row = examToRow(formForSave, paths);
      const updateResponse = await fetch(`${config.url}/rest/v1/exams?id=eq.${examId}`, {
        method: "PATCH",
        headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(row),
      });
      if (!updateResponse.ok) throw new Error(await updateResponse.text());
      const savedExam = examFromRow((await updateResponse.json())[0]);
      setExams((prev) => editingId ? prev.map((exam) => exam.id === savedExam.id ? savedExam : exam) : [savedExam, ...prev]);
      setExamFiles((prev) => ({ ...prev, [savedExam.id]: { ...prev[savedExam.id], ...draftFiles } }));
      alert(`시험 자료를 저장했습니다. 정답 ${savedExam.answers.filter(Boolean).length}/${savedExam.questionCount}개가 입력되었습니다.`);
      setEditingId(null);
      setDraftFiles({});
      setRegionDrafts({});
      setForm(makeEmptyExam());
      setTab("list");
    } catch (error) {
      console.error(error); alert(`시험 저장 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("이 실전모의고사를 삭제할까요?")) return;
    const config = getSupabaseConfig();
    if (!config) return alert("Supabase 연결을 확인해 주세요.");
    const response = await fetch(`${config.url}/rest/v1/exams?id=eq.${id}`, { method: "DELETE", headers: { apikey: config.key, Authorization: `Bearer ${config.key}` } });
    if (!response.ok) return alert(`삭제 실패: ${await response.text()}`);
    setExams((prev) => prev.filter((exam) => exam.id !== id));
  };

  const selectExamFile = (kind: "test" | "solution" | "original", file?: File) => {
    if (!file) return;
    if (kind !== "original" && file.type !== "application/pdf") return alert("시험지와 해설지는 PDF 파일만 등록할 수 있습니다.");
    if (kind === "original" && !/\.(hwp|hwpx)$/i.test(file.name)) return alert("한글 통합본은 HWP 또는 HWPX 파일만 등록할 수 있습니다.");
    setDraftFiles((prev) => ({ ...prev, [kind]: file }));
    const key = kind === "test" ? "testFile" : kind === "solution" ? "solutionFile" : "originalFile";
    set(key, file.name);
  };

  const getFileSource = (kind: "test" | "solution" | "original") => {
    const local = draftFiles[kind];
    if (local) return local;
    const path = kind === "test" ? form.testFilePath : kind === "solution" ? form.solutionFilePath : form.originalFilePath;
    return storagePublicUrl(path);
  };

  const getPdfSource = (kind: "test" | "solution") => getFileSource(kind);

  const openSavedPdf = (exam: PracticeExam, kind: "test" | "solution") => {
    const local = examFiles[exam.id]?.[kind];
    const path = kind === "test" ? exam.testFilePath : exam.solutionFilePath;
    const source = local ?? storagePublicUrl(path);
    const label = kind === "test" ? "시험지" : "해설지";
    if (!source) return alert(`${label} PDF가 등록되지 않았습니다.`);
    setPreview({ title: `${exam.title} · ${label}`, source, fileName: kind === "test" ? exam.testFile : exam.solutionFile });
  };

  const openOriginal = (exam: PracticeExam) => {
    const local = examFiles[exam.id]?.original;
    if (local) {
      const url = URL.createObjectURL(local); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 30000); return;
    }
    const url = storagePublicUrl(exam.originalFilePath);
    if (!url) return alert("한글 통합본이 등록되지 않았습니다.");
    window.open(url, "_blank");
  };

  const updateAnswer = (index: number, value: string) => {
    const next = Array.from({ length: form.questionCount }, (_, i) => form.answers[i] ?? "");
    next[index] = value.trim();
    set("answers", next);
  };

  const normalizePdfToken = (value: string) => value
    .replace(/[\uE000-\uF8FF]/g, (char) => {
      const code = char.charCodeAt(0);
      // 한글 PDF 수식 글꼴이 숫자를 private-use 영역에 저장하는 경우를 보정합니다.
      const map: Record<number, string> = {
        // 일반적인 private-use 숫자 매핑
        0xE000: "0", 0xE001: "1", 0xE002: "2", 0xE003: "3", 0xE004: "4",
        0xE005: "5", 0xE006: "6", 0xE007: "7", 0xE008: "8", 0xE009: "9",
        // 현재 SOS 한글 수식 글꼴 숫자 매핑 (0,1,2,3,4,5,6,7,8,9)
        0xE03D: "0", 0xE034: "1", 0xE035: "2", 0xE036: "3", 0xE037: "4",
        0xE038: "5", 0xE039: "6", 0xE03A: "7", 0xE03B: "8", 0xE03C: "9",
      };
      return map[code] ?? char;
    })
    .replace(/[①②③④⑤]/g, (char) => ({ "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5" }[char] ?? char))
    .replace(/\s+/g, " ")
    .trim();

  const parseSosMeta = (text: string) => {
    const normalized = normalizePdfToken(text);
    const meta = normalized.match(/SOS_META\s*\|[^\n\r]*?ANSWERS\s*=\s*([^\n\r]+)/i);
    if (!meta) return null;
    const values = Array(form.questionCount).fill("") as string[];
    for (const pair of meta[1].split(/[;,]/)) {
      const match = pair.trim().match(/^(\d{1,3})\s*[:=]\s*(-?\d+|_)$/);
      if (!match) continue;
      const no = Number(match[1]);
      if (no >= 1 && no <= form.questionCount && match[2] !== "_") values[no - 1] = match[2];
    }
    return values.some(Boolean) ? values : null;
  };

  const readAnswersFromPdf = async (source: File | string) => {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const data = source instanceof File ? await source.arrayBuffer() : await (await fetch(source)).arrayBuffer();
    const pdf = await pdfjs.getDocument({ data }).promise;
    const existing = Array.from({ length: form.questionCount }, (_, i) => form.answers[i] ?? "");

    // 마지막 페이지부터 역순으로 찾아 '빠른정답'이 있는 한 페이지만 분석합니다.
    // 해설 본문의 문항번호·수식 숫자와 섞이지 않도록 다른 페이지는 절대 파싱하지 않습니다.
    for (let pageNo = pdf.numPages; pageNo >= Math.max(1, pdf.numPages - 2); pageNo -= 1) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const items = (content.items as any[])
        .map((raw) => ({
          text: normalizePdfToken(String(raw.str ?? "")),
          x: Number(raw.transform?.[4] ?? 0),
          y: Number(raw.transform?.[5] ?? 0),
        }))
        .filter((item) => item.text);

      const pageText = items.map((item) => item.text).join(" ").replace(/\s+/g, " ");
      if (!/(빠른\s*정답|정답표)/i.test(pageText)) continue;

      // PDF 텍스트 항목을 실제 읽는 순서(위→아래, 왼쪽→오른쪽)로 정렬합니다.
      const ordered = [...items].sort((a, b) => Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x);
      const lines = new Map<number, { x: number; text: string }[]>();
      for (const item of ordered) {
        const lineKey = Math.round(item.y / 3) * 3;
        const row = lines.get(lineKey) ?? [];
        row.push({ x: item.x, text: item.text });
        lines.set(lineKey, row);
      }

      const parsed = Array(form.questionCount).fill("") as string[];
      const lineTexts = [...lines.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map((v) => v.text).join(" ").replace(/\s+/g, " ").trim());

      for (const line of lineTexts) {
        // 표준 형식: 1. ③ / 22. 8 / 30. 50
        const match = line.match(/^\s*(\d{1,3})\s*[.．)]?\s*([①②③④⑤]|-?\d+)\s*$/);
        if (!match) continue;
        const no = Number(match[1]);
        if (no < 1 || no > form.questionCount) continue;
        const answer = normalizePdfToken(match[2]).replace(/[^0-9-]/g, "");
        if (!/^-?\d+$/.test(answer)) continue;
        if (no <= form.objectiveCount && !/^[1-5]$/.test(answer)) continue;
        parsed[no - 1] = answer;
      }

      // 일부 PDF는 번호와 답을 한 줄이 아닌 별도 토큰으로 내보내므로 토큰 순서 방식도 보조 적용합니다.
      if (parsed.filter(Boolean).length < form.questionCount) {
        const tokens = ordered.flatMap((item) => item.text.split(/\s+/)).filter(Boolean);
        for (let i = 0; i < tokens.length - 1; i += 1) {
          const noMatch = tokens[i].match(/^(\d{1,3})[.．)]?$/);
          if (!noMatch) continue;
          const no = Number(noMatch[1]);
          if (no < 1 || no > form.questionCount || parsed[no - 1]) continue;
          const answer = normalizePdfToken(tokens[i + 1]).replace(/[^0-9-]/g, "");
          if (!/^-?\d+$/.test(answer)) continue;
          if (no <= form.objectiveCount && !/^[1-5]$/.test(answer)) continue;
          parsed[no - 1] = answer;
        }
      }

      const found = parsed.filter(Boolean).length;
      if (found === form.questionCount) return parsed;

      // 완전 추출이 아니면 사용자가 이미 입력한 답을 지우지 않고, 추출된 칸만 병합합니다.
      return existing.map((answer, index) => answer || parsed[index]);
    }

    throw new Error("QUICK_ANSWER_PAGE_NOT_FOUND");
  };

  const extractAnswersFromSolution = async () => {
    const source = getPdfSource("solution");
    if (!source) return alert("해설지 PDF를 먼저 등록해 주세요.");
    try {
      const next = await readAnswersFromPdf(source);
      set("answers", next);
      const found = next.filter(Boolean).length;
      alert(found === form.questionCount
        ? `정답 ${found}개를 모두 자동 추출했습니다.`
        : `${found}/${form.questionCount}개를 추출했습니다. 비어 있는 답만 확인해 주세요.`);
    } catch (error) {
      console.error(error); alert("정답 자동 추출에 실패했습니다. PDF 내부 글자를 읽을 수 있는지 확인해 주세요.");
    }
  };

  const escapeHtml = (value: unknown) => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;").replace(/'/g, "&#039;");

  const printHtmlSafely = (html: string, title: string) => {
    // 팝업을 열지 않고 현재 화면 안의 독립 iframe 미리보기로 표시합니다.
    // 따라서 브라우저 팝업 허용이 필요 없고, 인쇄 취소 후에도 등록 화면이 멈추지 않습니다.
    setHtmlPreview({ title, html });
  };

  const printAnswerSheet = () => {
    const answers = Array.from({ length: form.questionCount }, (_, i) => form.answers[i] ?? "");
    const cells = answers.map((answer, i) => `<div><b>${i + 1}</b><span>${escapeHtml(answer || "-")}</span></div>`).join("");
    const meta = `SOS_META|VERSION=1|CODE=${form.examCode}|COUNT=${form.questionCount}|OBJECTIVE=${form.objectiveCount}|ANSWERS=${answers.map((answer, i) => `${i + 1}:${answer || "_"}`).join(",")}`;
    printHtmlSafely(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(form.examCode)} 정답지</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,'Noto Sans KR',sans-serif;color:#17213a;margin:0}.head{text-align:center;border-bottom:2px solid #17213a;padding-bottom:12px}.head h1{margin:0 0 6px}.meta{font-size:12px;color:#667085}.grid{display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid #999;border-left:1px solid #999;margin-top:20px}.grid div{display:grid;grid-template-columns:36px 1fr;border-right:1px solid #999;border-bottom:1px solid #999;min-height:36px;align-items:center}.grid b{text-align:center;border-right:1px solid #ddd}.grid span{font-weight:800;font-size:17px;text-align:center}.sos-machine{font-size:6px;line-height:1;color:#fff;position:fixed;left:4mm;bottom:3mm;white-space:nowrap}.help{margin-top:12px;text-align:center;font-size:11px;color:#777}</style></head><body><div class="head"><h1>정답표</h1><strong>${escapeHtml(form.title)}</strong><div class="meta">${escapeHtml(form.examCode)} · 객관식 ${form.objectiveCount}문항 · 단답형 ${form.shortAnswerCount}문항</div></div><div class="grid">${cells}</div><div class="help">SOS 표준 정답지 · 이 PDF를 해설지 첫 페이지로 사용하면 정답이 자동 등록됩니다.</div><div class="sos-machine">${escapeHtml(meta)}</div></body></html>`, `${form.examCode} 정답지`);
  };

  const printCover = () => {
    printHtmlSafely(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(form.title)}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{font-family:Arial,'Noto Sans KR',sans-serif;margin:0;color:#1d2744}.page{width:210mm;min-height:297mm;padding:22mm}.brand{text-align:center;font-weight:900;font-size:34px}.sub{text-align:center;font-size:14px;color:#667085}.line{height:3px;background:#5268e8;margin:24px 0}.title{text-align:center;font-size:28px;font-weight:900;margin:24px 0 34px}.info{display:grid;grid-template-columns:1fr 1fr;border:1px solid #cfd5e6}.info div{padding:14px 16px;border-right:1px solid #cfd5e6;border-bottom:1px solid #cfd5e6}.value{font-size:18px;font-weight:800;margin-top:5px}.student{margin-top:34px;border:1px solid #cfd5e6;padding:22px;line-height:3;font-size:18px}.notice{margin-top:34px;background:#f5f7fb;padding:20px 24px;line-height:1.9}</style></head><body><section class="page"><div class="brand">SOS</div><div class="sub">Score Optimization System · MATSPU</div><div class="line"></div><div class="title">${escapeHtml(form.title)}</div><div class="info"><div>대상<div class="value">${escapeHtml(form.grade)}</div></div><div>과목<div class="value">${escapeHtml(form.subject)}</div></div><div>시험일<div class="value">${escapeHtml(form.examDate)}</div></div><div>시험시간<div class="value">${form.timeLimit}분</div></div><div>문항수<div class="value">${form.questionCount}문항</div></div><div>총점<div class="value">${form.totalScore}점</div></div></div><div class="student">학생명 _______________________________<br>학교 _________________________________<br>반 ____________ 번호 ____________</div><div class="notice"><strong>응시 안내</strong><br>1. 감독자의 시작 안내 전까지 시험지를 넘기지 마세요.<br>2. 제한시간을 지키고 답안을 빠짐없이 작성하세요.<br>3. 시험 종료 후 시험지와 답안을 모두 제출하세요.</div></section></body></html>`, `${form.examCode} 표지`);
  };

  const createRegionDrafts = () => {
    if (!editingId) return alert("먼저 시험을 저장해 주세요. 저장된 시험지로 자동 분석합니다.");
    if (!form.testFilePath) return alert("시험지를 먼저 저장해 주세요.");
    window.location.href = `/pdf-mapper?exam=${encodeURIComponent(editingId)}&questions=${form.questionCount}&auto=1`;
  };

  const openMapper = () => {
    if (!editingId) return alert("먼저 시험을 저장한 뒤 영역 편집기를 열어 주세요.");
    if (!form.testFilePath && !draftFiles.test) return alert("시험지 PDF를 먼저 등록해 주세요.");
    window.location.href = `/pdf-mapper?exam=${encodeURIComponent(editingId)}&questions=${form.questionCount}`;
  };

  const registrationProgress = (exam: PracticeExam) => {
    const checks = [
      Boolean(exam.title && exam.examCode && exam.examDate),
      Boolean(exam.testFilePath && exam.solutionFilePath && exam.originalFilePath),
      Boolean(exam.answers.filter(Boolean).length === exam.questionCount && exam.answerVerified),
      exam.coverVerified,
      exam.regionVerified,
    ];
    const done = checks.filter(Boolean).length;
    return { done, total: checks.length, percent: Math.round((done / checks.length) * 100), checks };
  };

  const patchExamFields = async (examId: string, fields: Record<string, unknown>) => {
    const config = getSupabaseConfig();
    if (!config) return alert("Supabase 환경변수가 없습니다.");
    const response = await fetch(`${config.url}/rest/v1/exams?id=eq.${examId}`, {
      method: "PATCH",
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(fields),
    });
    if (!response.ok) throw new Error(await response.text());
    const saved = examFromRow((await response.json())[0]);
    setExams((prev) => prev.map((exam) => exam.id === saved.id ? saved : exam));
    if (editingId === saved.id) { const { id, ...rest } = saved; setForm(rest); }
  };

  const changeStatusFromList = async (exam: PracticeExam, status: ExamStatus) => {
    if (status === "등록완료" && registrationProgress(exam).percent < 100) {
      return alert("모든 등록 단계가 검수 완료되어야 등록완료로 변경할 수 있습니다.");
    }
    try { await patchExamFields(exam.id, { status }); }
    catch (error) { alert(`상태 변경 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`); }
  };

  const verifyCurrentStep = async (kind: "answer" | "cover" | "region") => {
    if (!editingId) return alert("먼저 시험 자료를 저장해 주세요.");
    if (kind === "answer" && form.answers.filter(Boolean).length !== form.questionCount) return alert("모든 정답을 입력한 뒤 검수 완료해 주세요.");
    const column = kind === "answer" ? "answer_verified" : kind === "cover" ? "cover_verified" : "region_verified";
    try {
      await patchExamFields(editingId, { [column]: true });
      alert(kind === "answer" ? "정답 검수 완료로 표시했습니다." : kind === "cover" ? "표지 검수 완료로 표시했습니다." : "문항영역 검수 완료로 표시했습니다.");
    } catch (error) { alert(`검수 상태 저장 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`); }
  };

  return <>
    <style jsx global>{`
      /* 좁은 화면에서 고정 관리열이 진행률/파일 영역 위로 겹치는 문제 방지 */
      @media (max-width: 1500px) {
        .exam-list .table-head > :last-child,
        .exam-list .table-row > :last-child {
          position: static !important;
          right: auto !important;
          z-index: auto !important;
          box-shadow: none !important;
        }

        .exam-list .table-head,
        .exam-list .table-row {
          grid-template-columns:
            minmax(300px, 1.55fr)
            160px
            210px
            140px
            160px
            250px
            180px
            140px
            150px !important;
          min-width: 1690px !important;
        }

        .exam-list-panel {
          overflow: hidden !important;
        }

        .exam-list.data-table {
          overflow-x: auto !important;
          overflow-y: visible !important;
          scrollbar-gutter: stable;
        }

        .exam-list .table-row > *,
        .file-buttons,
        .exam-progress-cell,
        .status-control,
        .row-actions {
          min-width: 0;
        }

        .row-actions {
          flex-wrap: nowrap;
          white-space: nowrap;
        }
      }
    `}</style>
    <section className="page-title-row"><div><h2>실전 모의고사</h2><p>모든 컴퓨터가 Supabase의 동일한 시험정보와 PDF를 사용합니다.</p></div><button className="primary-button" onClick={startNew}>＋ 실전모의고사 입력</button></section>
    <div className="student-tabs"><button className={tab === "list" ? "active" : ""} onClick={() => setTab("list")}>시험 목록</button><button className={tab === "input" ? "active" : ""} onClick={() => { if (tab !== "input") startNew(); }}>{editingId ? "시험 수정" : "실전모의고사 입력"}</button></div>
    {tab === "list" ? <>
      <section className="student-stat-grid"><MiniStat label="전체 시험" value={`${exams.length}회`} note="Supabase 등록 기준" /><MiniStat label="등록 완료" value={`${exams.filter(e => e.status === "등록완료").length}회`} note="응시 등록 가능" /><MiniStat label="작성중" value={`${exams.filter(e => e.status === "작성중").length}회`} note="추가 입력 필요" emphasis /><MiniStat label="마감" value={`${exams.filter(e => e.status === "마감").length}회`} note="종료된 시험" /></section>
      <section className="panel exam-list-panel"><div className="list-summary"><strong>실전모의고사 {exams.length}회</strong><span>컴퓨터가 달라도 동일한 DB 내용을 표시합니다.</span></div><div className="data-table exam-list"><div className="table-head"><span>회차 / 시험명</span><span>시험코드</span><span>대상 / 과목</span><span>시험일</span><span>문항 / 시간</span><span>등록 파일</span><span>진행률</span><span>등록 상태</span><span>관리</span></div>
      {exams.map((exam) => { const progress = registrationProgress(exam); return <div className="table-row" key={exam.id}><div className="exam-name-cell"><i>{exam.round}</i><div><strong>{exam.title}</strong><small>{exam.range || "범위 미입력"}</small></div></div><b data-label="시험코드">{exam.examCode}</b><span className="nowrap-cell" data-label="대상 / 과목">{exam.grade} · {exam.subject}</span><span className="nowrap-cell" data-label="시험일">{exam.examDate}</span><span className="nowrap-cell" data-label="문항 / 시간">{exam.questionCount}문항 · {exam.timeLimit}분</span><div className="file-buttons" data-label="등록 파일"><button className={exam.testFilePath ? "ready" : ""} onClick={() => openSavedPdf(exam, "test")} disabled={!exam.testFilePath}>시험지 {exam.testFilePath ? "✓" : "-"}</button><button className={exam.solutionFilePath ? "ready" : ""} onClick={() => openSavedPdf(exam, "solution")} disabled={!exam.solutionFilePath}>해설지 {exam.solutionFilePath ? "✓" : "-"}</button><button className={exam.originalFilePath ? "ready" : ""} onClick={() => openOriginal(exam)} disabled={!exam.originalFilePath}>한글 {exam.originalFilePath ? "✓" : "-"}</button></div><div className="exam-progress-cell" data-label="진행률"><div><strong>{progress.percent}%</strong><span>{progress.done}/{progress.total}단계</span></div><div className="exam-progress-bar"><i style={{ width: `${progress.percent}%` }} /></div><small>{progress.percent === 100 ? "모든 검수 완료" : "추가 확인 필요"}</small></div><div className="status-control" data-label="등록 상태"><select value={exam.status} onChange={(e) => changeStatusFromList(exam, e.target.value as ExamStatus)}><option>작성중</option><option>등록완료</option><option>마감</option></select></div><div className="row-actions"><button onClick={() => editExam(exam)}>수정</button><button className="delete" onClick={() => remove(exam.id)}>삭제</button></div></div>; })}</div></section>
    </> : <form className="exam-input-layout" onSubmit={save}>
      <section className="panel exam-form-panel"><div className="form-section-title"><div><span>01</span><div><h3>시험 기본정보</h3><p>이 정보는 Supabase에 저장되어 모든 컴퓨터에서 동일하게 표시됩니다.</p></div></div></div><div className="form-grid exam-form-grid"><Field label="시험 회차 *"><input type="number" min="1" value={form.round} onChange={(e) => set("round", Number(e.target.value))} /></Field><Field label="시험일 *"><input type="date" value={form.examDate} onChange={(e) => set("examDate", e.target.value)} /></Field><label className="field full"><span>시험명 *</span><input value={form.title} onChange={(e) => set("title", e.target.value)} /></label><Field label="시험코드 *"><input value={form.examCode} onChange={(e) => set("examCode", e.target.value)} /></Field><div className="field status-readonly"><span>등록 상태</span><strong>{form.status}</strong><small>등록 상태는 시험 목록에서만 변경합니다.</small></div><Field label="대상 학년"><select value={form.grade} onChange={(e) => set("grade", e.target.value)}><option>중3</option><option>고1</option><option>고2</option><option>고3</option><option>전체</option></select></Field><Field label="과목"><input value={form.subject} onChange={(e) => set("subject", e.target.value)} /></Field><label className="field full"><span>시험 범위</span><input value={form.range} onChange={(e) => set("range", e.target.value)} /></label></div></section>
      <section className="panel exam-form-panel"><div className="form-section-title"><div><span>02</span><div><h3>문항 구성</h3></div></div></div><div className="form-grid exam-form-grid numbers"><Field label="전체 문항 수"><input type="number" min="1" value={form.questionCount} onChange={(e) => { const count = Number(e.target.value); setForm((prev) => ({ ...prev, questionCount: count, answers: Array.from({ length: count }, (_, i) => prev.answers[i] ?? "") })); }} /></Field><Field label="총점"><input type="number" min="1" value={form.totalScore} onChange={(e) => set("totalScore", Number(e.target.value))} /></Field><Field label="객관식 문항"><input type="number" min="0" value={form.objectiveCount} onChange={(e) => set("objectiveCount", Number(e.target.value))} /></Field><Field label="단답형 문항"><input type="number" min="0" value={form.shortAnswerCount} onChange={(e) => set("shortAnswerCount", Number(e.target.value))} /></Field><Field label="시험 시간(분)"><input type="number" min="1" value={form.timeLimit} onChange={(e) => set("timeLimit", Number(e.target.value))} /></Field><div className={`question-check ${form.objectiveCount + form.shortAnswerCount === form.questionCount ? "ok" : "warning"}`}><span>문항 합계</span><strong>{form.objectiveCount + form.shortAnswerCount} / {form.questionCount}</strong></div></div></section>
      <section className="panel exam-form-panel"><div className="form-section-title"><div><span>03</span><div><h3>시험 자료 3종 등록</h3><p>한글 통합본은 원본 보관용, 시험지·해설지 PDF는 SOS 운영용입니다.</p></div></div></div><div className="upload-grid three-files">{(["original", "test", "solution"] as const).map((kind) => { const isOriginal = kind === "original"; const isTest = kind === "test"; const label = isOriginal ? "한글 통합본" : isTest ? "시험지 PDF" : "해설지 PDF"; const fileName = isOriginal ? form.originalFile : isTest ? form.testFile : form.solutionFile; const source = getFileSource(kind); return <div className="upload-card-wrap" key={kind}><label className="upload-card"><span>{label}</span><strong>{fileName || "등록된 파일 없음"}</strong><input type="file" accept={isOriginal ? ".hwp,.hwpx,application/haansofthwp" : "application/pdf,.pdf"} onChange={(e) => selectExamFile(kind, e.target.files?.[0])} /><em>{source ? "파일 변경" : "파일 선택"}</em></label>{isOriginal ? <button type="button" className="pdf-preview-button" disabled={!source} onClick={() => { if (source instanceof File) { const url = URL.createObjectURL(source); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 30000); } else if (source) window.open(source, "_blank"); }}>한글 파일 열기</button> : <button type="button" className="pdf-preview-button" disabled={!source} onClick={() => source && setPreview({ title: `${form.title || "현재 시험"} · ${isTest ? "시험지" : "해설지"}`, source, fileName })}>{isTest ? "시험지" : "해설지"} 미리보기</button>}</div>; })}</div><div className="upload-save-row"><button className="primary-button upload-save-button" disabled={saving}>{saving ? "파일 저장 중..." : "시험 자료 한 번에 저장"}</button><span>선택한 한글·시험지·해설지를 한 번에 저장하고 해설지 정답도 자동으로 읽습니다.</span></div><div className="file-standard-note"><b>SOS 표준 등록</b><span>한글 통합본 + 시험지 PDF + 해설지 PDF</span></div><label className="field exam-memo"><span>관리 메모</span><textarea value={form.memo} onChange={(e) => set("memo", e.target.value)} /></label></section>
      <section className="panel exam-form-panel"><div className="form-section-title"><div><span>04</span><div><h3>빠른 정답 자동 추출</h3><p>해설지 마지막 페이지의 ‘빠른정답’을 읽어 1~30번 답을 자동 입력합니다.</p></div></div></div><div className="answer-toolbar"><div><strong>{form.answers.filter(Boolean).length}/{form.questionCount}개 입력</strong><span>1~{form.objectiveCount}번 객관식 · {form.objectiveCount + 1}~{form.questionCount}번 단답형</span></div><div><button type="button" className="secondary-button" onClick={extractAnswersFromSolution} disabled={!getPdfSource("solution")}>마지막 빠른정답 읽기</button><button type="button" className="primary-button" onClick={printAnswerSheet} disabled={!form.answers.some(Boolean)}>정답지 자동 생성</button><button type="button" className={`verify-button ${form.answerVerified ? "verified" : ""}`} onClick={() => verifyCurrentStep("answer")}>{form.answerVerified ? "정답 검수완료 ✓" : "정답 검수완료"}</button></div></div><div className="answer-key-grid">{Array.from({ length: form.questionCount }, (_, index) => { const no = index + 1; const objective = no <= form.objectiveCount; return <label key={no} className={!form.answers[index] ? "answer-missing" : ""}><b>{no}</b>{objective ? <select value={form.answers[index] ?? ""} onChange={(e) => updateAnswer(index, e.target.value)}><option value="">-</option><option value="1">①</option><option value="2">②</option><option value="3">③</option><option value="4">④</option><option value="5">⑤</option></select> : <input inputMode="numeric" value={form.answers[index] ?? ""} onChange={(e) => updateAnswer(index, e.target.value)} placeholder="답" />}</label>; })}</div></section>
      <section className="panel exam-form-panel"><div className="form-section-title"><div><span>05</span><div><h3>SOS 시험 표지</h3></div></div></div><div className="cover-builder"><article className="exam-cover-preview"><div className="cover-logo">SOS</div><small>Score Optimization System · MATSPU</small><div className="cover-rule" /><h2>{form.title || "시험명을 입력해 주세요"}</h2><div className="cover-info-grid"><span>대상</span><b>{form.grade}</b><span>과목</span><b>{form.subject || "-"}</b><span>시험일</span><b>{form.examDate || "-"}</b><span>시험시간</span><b>{form.timeLimit}분</b><span>문항수</span><b>{form.questionCount}문항</b><span>총점</span><b>{form.totalScore}점</b></div><div className="cover-student-lines">학생명 ____________________<br />학교 ______________________<br />반 ________ 번호 ________</div></article><div className="cover-actions"><button type="button" className="primary-button" onClick={printCover}>표지 미리보기 · 인쇄</button><button type="button" className={`verify-button ${form.coverVerified ? "verified" : ""}`} onClick={() => verifyCurrentStep("cover")}>{form.coverVerified ? "표지 검수완료 ✓" : "표지 검수완료"}</button></div></div></section>
      <section className="panel exam-form-panel"><div className="form-section-title"><div><span>06</span><div><h3>문항영역 자동 초안</h3><p>03단계에서 이미 올린 시험지를 그대로 불러옵니다. 다시 업로드하지 않습니다.</p></div></div></div><div className="region-builder"><div className="region-toolbar"><div><strong>{form.questionCount}문항 영역 설정</strong><p>{getPdfSource("test") ? `등록 시험지: ${form.testFile}` : "시험지 PDF가 아직 없습니다."}</p></div><div><button type="button" className="primary-button" onClick={createRegionDrafts} disabled={!getPdfSource("test")}>자동 분석 시작</button><button type="button" className="secondary-button" onClick={openMapper} disabled={!getPdfSource("test")}>등록 시험지로 영역 편집</button><button type="button" className={`verify-button ${form.regionVerified ? "verified" : ""}`} onClick={() => verifyCurrentStep("region")} disabled={!editingId || !form.testFilePath}>{form.regionVerified ? "문항영역 검수완료 ✓" : "문항영역 검수완료"}</button></div></div>{Object.keys(regionDrafts).length ? <><div className="region-progress"><i style={{ width: `${Math.round((Object.values(regionDrafts).filter(v => v === "자동인식").length / form.questionCount) * 100)}%` }} /></div><div className="region-chip-grid">{Array.from({ length: form.questionCount }, (_, index) => index + 1).map((no) => <button type="button" key={no} className={regionDrafts[no] === "확인필요" ? "needs-check" : "auto-ok"} onClick={() => { if (!editingId) return alert("먼저 시험을 저장해 주세요."); window.location.href = `/pdf-mapper?exam=${encodeURIComponent(editingId)}&questions=${form.questionCount}&active=${no}&auto=1`; }}><b>{no}</b><span>{regionDrafts[no] === "확인필요" ? "확인 필요" : "영역 보기"}</span></button>)}</div></> : <div className="region-empty">{getPdfSource("test") ? <><b>{form.testFile}</b>을 사용합니다. 추가 업로드는 필요 없습니다.</> : <>03단계에서 시험지 PDF를 등록해 주세요.</>}</div>}</div></section>
      <div className="exam-form-actions"><button type="button" className="secondary-button" onClick={() => setTab("list")}>취소</button><button className="primary-button" disabled={saving}>{saving ? "저장 중..." : editingId ? "수정 저장" : "시험 등록"}</button></div>
    </form>}
    {preview ? <PdfPreviewModal title={preview.title} source={preview.source} fileName={preview.fileName} onClose={() => setPreview(null)} /> : null}
    {htmlPreview ? <HtmlPrintPreviewModal title={htmlPreview.title} html={htmlPreview.html} onClose={() => setHtmlPreview(null)} /> : null}
  </>;
}

function HtmlPrintPreviewModal({ title, html, onClose }: { title: string; html: string; onClose: () => void }) {
  const printFrame = () => {
    const frame = document.getElementById("sos-html-print-frame") as HTMLIFrameElement | null;
    const target = frame?.contentWindow;
    if (!target) return alert("인쇄 미리보기를 불러오는 중입니다. 잠시 후 다시 눌러 주세요.");
    target.focus();
    target.print();
  };
  return <div className="pdf-modal-backdrop" onMouseDown={onClose}>
    <section className="pdf-modal html-print-modal" onMouseDown={(e) => e.stopPropagation()}>
      <header>
        <div><strong>{title}</strong><span>팝업 허용 없이 현재 화면에서 미리보기</span></div>
        <div className="html-print-actions"><button type="button" onClick={printFrame}>인쇄</button><button type="button" onClick={onClose}>×</button></div>
      </header>
      <iframe id="sos-html-print-frame" title={title} srcDoc={html} />
    </section>
  </div>;
}

function PdfPreviewModal({ title, source, fileName, onClose }: { title: string; source: File | string; fileName: string; onClose: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (typeof source === "string") { setUrl(source); return; }
    const objectUrl = URL.createObjectURL(source); setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [source]);
  return <div className="pdf-modal-backdrop" onMouseDown={onClose}><section className="pdf-modal" onMouseDown={(e) => e.stopPropagation()}><header><div><strong>{title}</strong><span>{fileName}</span></div><button type="button" onClick={onClose}>×</button></header>{url ? <iframe title={title} src={url} /> : <div className="pdf-loading">PDF를 여는 중입니다.</div>}</section></div>;
}
function Dashboard({ students, onMove }: { students: Student[]; onMove: (menu: AdminMenu) => void }) {
  return <><section className="welcome-card"><div><span className="pill">MATSPU SOS</span><h2>학생의 점수를 데이터로 최적화합니다.</h2><p>진단부터 훈련 추천까지 매쓰푸의 전체 흐름을 관리하세요.</p></div></section><section className="student-stat-grid"><MiniStat label="등록 학생" value={`${students.length}명`} note="전체 회원" /><MiniStat label="재원 학생" value={`${students.filter(s => s.status === "정상").length}명`} note="현재 학습중" /><MiniStat label="AI 분석 대기" value="12건" note="검토 필요" emphasis /><MiniStat label="추천 승인 대기" value="7건" note="SOS 추천" /></section><section className="empty-page"><div className="empty-icon">⌂</div><h2>대시보드 상세 구성 예정</h2><p>현재는 학생관리 기능을 우선 개발했습니다.</p><button className="primary-button" onClick={() => onMove("students")}>학생 관리 열기</button></section></>;
}


type SourceFile = {
  id: string;
  created_at: string;
  title: string;
  source: string | null;
  grade: string | null;
  subject: string | null;
  storage_path: string;
  hwp_path: string | null;
  exam_pdf_path: string | null;
  solution_pdf_path: string | null;
  original_hwp_name: string | null;
  exam_pdf_name: string | null;
  solution_pdf_name: string | null;
  page_count: number;
  status: string;
  error_message: string | null;
};

const sourceStatusLabel: Record<string, string> = {
  uploaded: "업로드 완료",
  splitting: "PDF 분리 중",
  pages_created: "페이지 생성 완료",
  analyzing: "AI 분석 중",
  completed: "분석 완료",
  failed: "실패",
};

type UploadFileKind = "hwp" | "exam" | "solution";

function ProblemsPage({ onOpenAnalysis }: { onOpenAnalysis: (sourceFileId: string) => void }) {
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("매쓰푸 자체 제작");
  const [grade, setGrade] = useState("고1");
  const [subject, setSubject] = useState("공통수학1");
  const [hwpFile, setHwpFile] = useState<File | null>(null);
  const [examPdf, setExamPdf] = useState<File | null>(null);
  const [solutionPdf, setSolutionPdf] = useState<File | null>(null);
  const [items, setItems] = useState<SourceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSource, setEditSource] = useState("");
  const [editGrade, setEditGrade] = useState("고1");
  const [editSubject, setEditSubject] = useState("공통수학1");
  const [savingEdit, setSavingEdit] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    const config = getSupabaseConfig();
    if (!config) {
      setErrorMessage("Supabase 환경변수를 확인해 주세요.");
      setLoading(false);
      return;
    }

    try {
      const fields = [
        "id", "created_at", "title", "source", "grade", "subject", "storage_path",
        "hwp_path", "exam_pdf_path", "solution_pdf_path", "original_hwp_name",
        "exam_pdf_name", "solution_pdf_name", "page_count", "status", "error_message",
      ].join(",");
      const response = await fetch(
        `${config.url}/rest/v1/source_files?select=${fields}&order=created_at.desc`,
        {
          headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
          cache: "no-store",
        }
      );
      if (!response.ok) throw new Error(await response.text());
      setItems((await response.json()) as SourceFile[]);
    } catch (error) {
      setErrorMessage(`목록 조회 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadFiles(); }, [loadFiles]);

  const selectFile = (kind: UploadFileKind, event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setMessage("");
    setErrorMessage("");

    if (!selected) {
      if (kind === "hwp") setHwpFile(null);
      if (kind === "exam") setExamPdf(null);
      if (kind === "solution") setSolutionPdf(null);
      return;
    }

    const lowerName = selected.name.toLowerCase();
    const valid = kind === "hwp"
      ? lowerName.endsWith(".hwp") || lowerName.endsWith(".hwpx") || lowerName.endsWith(".pdf")
      : selected.type === "application/pdf" || lowerName.endsWith(".pdf");

    if (!valid) {
      event.target.value = "";
      setErrorMessage(kind === "hwp" ? "원본 파일(.hwp, .hwpx 또는 .pdf)을 선택해 주세요." : "PDF 파일만 선택할 수 있습니다.");
      return;
    }

    if (selected.size > 50 * 1024 * 1024) {
      event.target.value = "";
      setErrorMessage("파일 크기는 각 50MB 이하여야 합니다.");
      return;
    }

    if (kind === "hwp") setHwpFile(selected);
    if (kind === "exam") {
      setExamPdf(selected);
      if (!title.trim()) setTitle(selected.name.replace(/\.pdf$/i, "").replace(/_시험지$/i, ""));
    }
    if (kind === "solution") setSolutionPdf(selected);
  };

  const uploadBundle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (!title.trim()) return setErrorMessage("시험지명을 입력해 주세요.");
    if (!hwpFile) return setErrorMessage("원본(HWP/HWPX/PDF)을 선택해 주세요.");
    if (!examPdf) return setErrorMessage("시험지 PDF를 선택해 주세요.");
    if (!solutionPdf) return setErrorMessage("해설지 PDF를 선택해 주세요.");

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("source", source.trim());
      formData.append("grade", grade);
      formData.append("subject", subject);
      formData.append("hwpFile", hwpFile);
      formData.append("examPdf", examPdf);
      formData.append("solutionPdf", solutionPdf);

      const response = await fetch("/api/source-files/upload", { method: "POST", body: formData });
      const result = await response.json() as { success: boolean; message: string };
      if (!response.ok || !result.success) throw new Error(result.message || "시험지 등록에 실패했습니다.");

      setMessage(result.message);
      setTitle("");
      setHwpFile(null);
      setExamPdf(null);
      setSolutionPdf(null);
      ["sos-hwp-file", "sos-exam-pdf", "sos-solution-pdf"].forEach((id) => {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (input) input.value = "";
      });
      await loadFiles();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "시험지 등록 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const formatDate = (value: string) => new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));

  const startEdit = (item: SourceFile) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditSource(item.source || "");
    setEditGrade(item.grade || "고1");
    setEditSubject(item.subject || "공통수학1");
    setMessage("");
    setErrorMessage("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setMessage("");
    setErrorMessage("");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editTitle.trim()) return setErrorMessage("시험지명을 입력해 주세요.");

    const config = getSupabaseConfig();
    if (!config) return setErrorMessage("Supabase 환경변수를 확인해 주세요.");

    setSavingEdit(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch(`${config.url}/rest/v1/source_files?id=eq.${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          title: editTitle.trim(),
          source: editSource.trim() || null,
          grade: editGrade,
          subject: editSubject,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setEditingId(null);
      setMessage("시험지 정보가 수정되었습니다.");
      await loadFiles();
    } catch (error) {
      setErrorMessage(`수정 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const allReady = Boolean(title.trim() && hwpFile && examPdf && solutionPdf);

  return <>
    <section className="page-title-row">
      <div><h2>AI 문제등록</h2><p>원본(HWP/HWPX/PDF)·시험지 PDF·해설지 PDF를 한 세트로 등록합니다.</p></div>
      <button className="primary-button" type="button" onClick={() => { window.location.href = "/problem-bank"; }}>📚 문제은행 열기</button>
    </section>

    <form className="panel ai-upload-panel" onSubmit={uploadBundle}>
      <div className="ai-upload-grid four-fields">
        <label className="field"><span>시험지명</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: H11 다항식 훈련 01" disabled={uploading}/></label>
        <label className="field"><span>출처</span><input value={source} onChange={(e) => setSource(e.target.value)} placeholder="예: 매쓰푸 자체 제작" disabled={uploading}/></label>
        <label className="field"><span>학년</span><select value={grade} onChange={(e) => setGrade(e.target.value)} disabled={uploading}><option>중1</option><option>중2</option><option>중3</option><option>고1</option><option>고2</option><option>고3</option></select></label>
        <label className="field"><span>과목</span><select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={uploading}><option>중등수학</option><option>공통수학1</option><option>공통수학2</option><option>대수</option><option>미적분Ⅰ</option><option>확률과 통계</option></select></label>
      </div>

      <div className="bundle-upload-grid">
        <label className={`bundle-drop-zone ${hwpFile ? "selected" : ""}`}>
          <input id="sos-hwp-file" type="file" accept=".hwp,.hwpx,.pdf,application/pdf" onChange={(e) => selectFile("hwp", e)} disabled={uploading}/>
          <b>① 원본 파일</b><strong>{hwpFile ? hwpFile.name : "HWP/HWPX/PDF 선택"}</strong><span>{hwpFile ? `${(hwpFile.size / 1024 / 1024).toFixed(1)}MB` : "분석 기준 원본 파일"}</span>
        </label>
        <label className={`bundle-drop-zone ${examPdf ? "selected" : ""}`}>
          <input id="sos-exam-pdf" type="file" accept=".pdf,application/pdf" onChange={(e) => selectFile("exam", e)} disabled={uploading}/>
          <b>② 시험지 PDF</b><strong>{examPdf ? examPdf.name : "시험지 PDF 선택"}</strong><span>{examPdf ? `${(examPdf.size / 1024 / 1024).toFixed(1)}MB` : "문항 분리용 시험지"}</span>
        </label>
        <label className={`bundle-drop-zone ${solutionPdf ? "selected" : ""}`}>
          <input id="sos-solution-pdf" type="file" accept=".pdf,application/pdf" onChange={(e) => selectFile("solution", e)} disabled={uploading}/>
          <b>③ 해설지 PDF</b><strong>{solutionPdf ? solutionPdf.name : "해설지 PDF 선택"}</strong><span>{solutionPdf ? `${(solutionPdf.size / 1024 / 1024).toFixed(1)}MB` : "정답·해설 분석용"}</span>
        </label>
      </div>

      <div className="upload-ready-row">
        <span className={hwpFile ? "ready" : ""}>{hwpFile ? "✓" : "○"} 원본 파일</span>
        <span className={examPdf ? "ready" : ""}>{examPdf ? "✓" : "○"} 시험지 PDF</span>
        <span className={solutionPdf ? "ready" : ""}>{solutionPdf ? "✓" : "○"} 해설지 PDF</span>
      </div>

      {message ? <div className="upload-message success">{message}</div> : null}
      {errorMessage ? <div className="upload-message error">{errorMessage}</div> : null}
      <div className="ai-upload-actions"><button className="primary-button" type="submit" disabled={uploading || !allReady}>{uploading ? "3개 파일 등록 중..." : "시험지 세트 등록"}</button></div>
    </form>

    <section className="panel source-file-panel">
      <div className="source-file-title"><div><strong>등록된 시험지 세트</strong><span>총 {items.length}개</span></div><button className="secondary-button" type="button" onClick={() => void loadFiles()} disabled={loading}>새로고침</button></div>
      {loading ? <div className="source-file-empty">목록을 불러오는 중입니다.</div> : items.length === 0 ? <div className="source-file-empty">등록된 시험지가 없습니다.</div> : <div className="source-file-list">
        <div className="source-file-head"><span>등록일</span><span>시험지명</span><span>학년·과목</span><span>파일 구성</span><span>상태</span><span>관리</span></div>
        {items.map((item) => editingId === item.id ? <div className="source-file-edit-row" key={item.id}>
          <div className="source-file-edit-grid">
            <label className="field"><span>시험지명</span><input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} disabled={savingEdit}/></label>
            <label className="field"><span>출처</span><input value={editSource} onChange={(e) => setEditSource(e.target.value)} disabled={savingEdit}/></label>
            <label className="field"><span>학년</span><select value={editGrade} onChange={(e) => setEditGrade(e.target.value)} disabled={savingEdit}><option>중1</option><option>중2</option><option>중3</option><option>고1</option><option>고2</option><option>고3</option></select></label>
            <label className="field"><span>과목</span><select value={editSubject} onChange={(e) => setEditSubject(e.target.value)} disabled={savingEdit}><option>중등수학</option><option>공통수학1</option><option>공통수학2</option><option>대수</option><option>미적분Ⅰ</option><option>확률과 통계</option></select></label>
          </div>
          <div className="source-file-edit-actions"><button className="secondary-button" type="button" onClick={cancelEdit} disabled={savingEdit}>취소</button><button className="primary-button" type="button" onClick={() => void saveEdit()} disabled={savingEdit}>{savingEdit ? "저장 중..." : "수정 저장"}</button></div>
        </div> : <div className="source-file-row bundle-row" key={item.id}>
          <span>{formatDate(item.created_at)}</span>
          <div><strong>{item.title}</strong><small>{item.source || "-"}</small></div>
          <span>{[item.grade, item.subject].filter(Boolean).join(" · ") || "-"}</span>
          <div className="file-badges">
            <span className={item.hwp_path ? "ok" : "missing"}>HWP</span>
            <span className={item.exam_pdf_path ? "ok" : "missing"}>시험지</span>
            <span className={item.solution_pdf_path ? "ok" : "missing"}>해설지</span>
          </div>
          <Status text={sourceStatusLabel[item.status] ?? item.status}/>
          <div className="source-action-buttons"><button className="analysis-open-button" type="button" onClick={() => onOpenAnalysis(item.id)}>AI 분석</button><button className="source-edit-button" type="button" onClick={() => startEdit(item)}>수정</button></div>
          {item.error_message ? <small className="bundle-error">{item.error_message}</small> : null}
        </div>)}
      </div>}
    </section>
  </>;
}


type AnalysisRecord = {
  id: string;
  source_file_id: string;
  status: "WAITING" | "RUNNING" | "REVIEW" | "DONE" | "FAILED";
  progress: number;
  current_step: string;
  total_questions: number;
  objective_count: number;
  subjective_count: number;
  updated_at: string;
};

type AnalysisJob = {
  id: string;
  status: string;
  progress: number;
  logs: { at?: string; message?: string }[];
  created_at: string;
};

type AnalysisQuestion = {
  id: string;
  question_no: number;
  answer: string | null;
  status: string;
  confidence: number | null;
  ai_result: {
    question_type?: string;
    subject?: string | null;
    unit?: string | null;
    topic?: string | null;
    difficulty?: string | null;
    summary?: string | null;
  };
  review_result?: {
    question_type?: string;
    subject?: string | null;
    unit?: string | null;
    topic?: string | null;
    difficulty?: string | null;
    summary?: string | null;
  } | null;
};

type QuestionDraft = {
  question_type: string;
  subject: string;
  unit: string;
  topic: string;
  difficulty: string;
  answer: string;
  summary: string;
  status: string;
};

type AnalysisProbe = {
  page_count_estimate: number;
  total_questions: number;
  objective_count: number;
  subjective_count: number;
  first_question: {
    question_no: number;
    question_type: "objective" | "subjective" | "unknown";
    subject: string;
    unit: string;
    topic: string;
    difficulty: "하" | "중" | "상" | "최상";
    answer: string;
    confidence: number;
    summary: string;
  };
  notes: string;
};

const analysisStatusLabel: Record<string, string> = {
  WAITING: "분석 대기",
  RUNNING: "분석 중",
  REVIEW: "검수 대기",
  DONE: "완료",
  FAILED: "실패",
};

function getQuestionResult(question: AnalysisQuestion) {
  const review = question.review_result;
  return review && Object.keys(review).length > 0 ? review : question.ai_result ?? {};
}

function AnalysisPage() {
  const [sources, setSources] = useState<SourceFile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const [questions, setQuestions] = useState<AnalysisQuestion[]>([]);
  const [examUrl, setExamUrl] = useState<string | null>(null);
  const [solutionUrl, setSolutionUrl] = useState<string | null>(null);
  const [viewer, setViewer] = useState<"exam" | "solution">("exam");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [checkingAi, setCheckingAi] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<AnalysisProbe | null>(null);
  const [probeModel, setProbeModel] = useState("");
  const [aiConnection, setAiConnection] = useState<{ ok: boolean; message: string } | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [questionDraft, setQuestionDraft] = useState<QuestionDraft | null>(null);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [registeringBank, setRegisteringBank] = useState(false);

  const selectedSource = sources.find((item) => item.id === selectedId) ?? null;

  const loadWorkspace = useCallback(async (sourceId: string) => {
    if (!sourceId) return;
    const config = getSupabaseConfig();
    if (!config) return setErrorMessage("Supabase 환경변수를 확인해 주세요.");
    setLoading(true);
    setErrorMessage("");
    try {
      const headers = { apikey: config.key, Authorization: `Bearer ${config.key}` };
      const analysisResponse = await fetch(`${config.url}/rest/v1/source_analysis?source_file_id=eq.${encodeURIComponent(sourceId)}&select=*&limit=1`, { headers, cache: "no-store" });
      if (!analysisResponse.ok) throw new Error(await analysisResponse.text());
      const rows = await analysisResponse.json() as AnalysisRecord[];
      const current = rows[0] ?? null;
      setAnalysis(current);
      if (current) {
        const detailResponse = await fetch(`/api/analysis/${current.id}`, { cache: "no-store" });
        const detail = await detailResponse.json() as { success: boolean; jobs?: AnalysisJob[]; questions?: AnalysisQuestion[]; message?: string };
        if (!detailResponse.ok || !detail.success) throw new Error(detail.message || "분석 정보를 불러오지 못했습니다.");
        setJobs(detail.jobs ?? []);
        const loadedQuestions = detail.questions ?? [];
        setQuestions(loadedQuestions);
        const keepSelected = loadedQuestions.some((item) => item.id === selectedQuestionId)
          ? selectedQuestionId
          : loadedQuestions[0]?.id ?? "";
        setSelectedQuestionId(keepSelected);
      } else { setJobs([]); setQuestions([]); setSelectedQuestionId(""); setQuestionDraft(null); }

      const urlResponse = await fetch(`/api/source-files/${sourceId}/signed-urls`, { cache: "no-store" });
      const urls = await urlResponse.json() as { success: boolean; examUrl?: string | null; solutionUrl?: string | null; message?: string };
      if (!urlResponse.ok || !urls.success) throw new Error(urls.message || "PDF 미리보기를 불러오지 못했습니다.");
      setExamUrl(urls.examUrl ?? null);
      setSolutionUrl(urls.solutionUrl ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "작업공간을 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const config = getSupabaseConfig();
    if (!config) { setLoading(false); return; }
    (async () => {
      try {
        const fields = "id,created_at,title,source,grade,subject,storage_path,hwp_path,exam_pdf_path,solution_pdf_path,original_hwp_name,exam_pdf_name,solution_pdf_name,page_count,status,error_message";
        const response = await fetch(`${config.url}/rest/v1/source_files?select=${fields}&order=created_at.desc`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }, cache: "no-store" });
        if (!response.ok) throw new Error(await response.text());
        const rows = await response.json() as SourceFile[];
        setSources(rows);
        const saved = window.localStorage.getItem("matspu-analysis-source-id");
        const initial = rows.some((item) => item.id === saved) ? saved! : rows[0]?.id ?? "";
        setSelectedId(initial);
        if (initial) await loadWorkspace(initial); else setLoading(false);
      } catch (error) { setErrorMessage(error instanceof Error ? error.message : "시험지 목록을 불러오지 못했습니다."); setLoading(false); }
    })();
  }, [loadWorkspace]);

  const changeSource = async (value: string) => {
    setSelectedId(value);
    window.localStorage.setItem("matspu-analysis-source-id", value);
    setAnalysis(null); setJobs([]); setQuestions([]); setSelectedQuestionId(""); setQuestionDraft(null); setExamUrl(null); setSolutionUrl(null); setProbeResult(null); setProbeModel("");
    await loadWorkspace(value);
  };


  const checkAiConnection = async () => {
    setCheckingAi(true);
    setAiConnection(null);
    setErrorMessage("");
    try {
      const response = await fetch("/api/analysis/health", { cache: "no-store" });
      const result = await response.json() as { success: boolean; message?: string; model?: string };
      const text = result.message || (result.success ? "OpenAI 연결 정상" : "OpenAI 연결 실패");
      setAiConnection({ ok: response.ok && result.success, message: text });
      if (!response.ok || !result.success) setErrorMessage(text);
    } catch (error) {
      const text = error instanceof Error ? error.message : "OpenAI 연결 확인에 실패했습니다.";
      setAiConnection({ ok: false, message: text });
      setErrorMessage(text);
    } finally {
      setCheckingAi(false);
    }
  };

  const runProbe = async () => {
    if (!selectedId) return;
    setProbing(true);
    setProbeResult(null);
    setProbeModel("");
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/analysis/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFileId: selectedId }),
      });
      const result = await response.json() as { success: boolean; model?: string; result?: AnalysisProbe; message?: string };
      if (!response.ok || !result.success || !result.result) throw new Error(result.message || "PDF 1차 판독에 실패했습니다.");
      setProbeResult(result.result);
      setProbeModel(result.model || "");
      setMessage(`1차 판독 완료 · 전체 ${result.result.total_questions}문항 · 1번 문항 분석 완료`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "PDF 1차 판독에 실패했습니다.");
    } finally {
      setProbing(false);
    }
  };

  const startAnalysis = async () => {
    if (!selectedId) return;
    setStarting(true); setMessage(""); setErrorMessage("");
    try {
      const response = await fetch("/api/analysis/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceFileId: selectedId }) });
      const result = await response.json() as { success: boolean; analysis?: AnalysisRecord; questionCount?: number; message?: string };
      if (!response.ok || !result.success || !result.analysis) throw new Error(result.message || "AI 분석 시작에 실패했습니다.");
      setAnalysis(result.analysis);
      setMessage(`AI 분석이 완료되었습니다. ${result.questionCount ?? result.analysis.total_questions}개 문항을 확인해 주세요.`);
      setAiConnection({ ok: true, message: "OpenAI 실제 분석 호출 완료" });
      await loadWorkspace(selectedId);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "AI 분석 시작에 실패했습니다."); }
    finally { setStarting(false); }
  };

  const saveWorkspace = async (patch: Partial<AnalysisRecord>) => {
    if (!analysis) return;
    setSaving(true); setMessage(""); setErrorMessage("");
    try {
      const response = await fetch(`/api/analysis/${analysis.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const result = await response.json() as { success: boolean; analysis?: AnalysisRecord; message?: string };
      if (!response.ok || !result.success || !result.analysis) throw new Error(result.message || "저장에 실패했습니다.");
      setAnalysis(result.analysis); setMessage("작업 상태가 저장되었습니다.");
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "저장에 실패했습니다."); }
    finally { setSaving(false); }
  };


  const selectQuestion = (question: AnalysisQuestion) => {
    const result = getQuestionResult(question);
    setSelectedQuestionId(question.id);
    setQuestionDraft({
      question_type: result.question_type ?? "unknown",
      subject: result.subject ?? "",
      unit: result.unit ?? "",
      topic: result.topic ?? "",
      difficulty: result.difficulty ?? "중",
      answer: question.answer ?? "",
      summary: result.summary ?? "",
      status: question.status ?? "REVIEW",
    });
  };

  useEffect(() => {
    const question = questions.find((item) => item.id === selectedQuestionId);
    if (question) selectQuestion(question);
    else if (questions[0]) selectQuestion(questions[0]);
  }, [questions, selectedQuestionId]);

  const saveQuestion = async (status: "REVIEW" | "APPROVED" = "APPROVED") => {
    if (!selectedQuestionId || !questionDraft) return;
    setSavingQuestion(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/analysis/questions/${selectedQuestionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...questionDraft, status }),
      });
      const result = await response.json() as { success: boolean; question?: AnalysisQuestion; message?: string };
      if (!response.ok || !result.success || !result.question) throw new Error(result.message || "문항 검수 저장에 실패했습니다.");
      const savedQuestion = result.question;
      setQuestions((items) => items.map((item) => item.id === savedQuestion.id ? savedQuestion : item));
      setQuestionDraft((draft) => draft ? { ...draft, status } : draft);
      setMessage(status === "APPROVED" ? `${savedQuestion.question_no}번 문항을 검수 확정했습니다.` : `${savedQuestion.question_no}번 문항을 검수 필요 상태로 저장했습니다.`);

      if (status === "APPROVED") {
        const currentIndex = questions.findIndex((item) => item.id === savedQuestion.id);
        const nextQuestion = questions.slice(currentIndex + 1).find((item) => item.status !== "APPROVED")
          ?? questions.slice(0, currentIndex).find((item) => item.status !== "APPROVED")
          ?? questions[currentIndex + 1];
        if (nextQuestion) selectQuestion(nextQuestion);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "문항 검수 저장에 실패했습니다.");
    } finally {
      setSavingQuestion(false);
    }
  };

  const moveQuestion = (direction: -1 | 1) => {
    const index = questions.findIndex((item) => item.id === selectedQuestionId);
    const next = questions[index + direction];
    if (next) selectQuestion(next);
  };

  const registerProblemBank = async () => {
    if (!analysis) return;
    const unapproved = questions.filter((item) => item.status !== "APPROVED");
    if (unapproved.length > 0) {
      setErrorMessage(`아직 검수 확정하지 않은 문항이 ${unapproved.length}개 있습니다.`);
      return;
    }
    if (!window.confirm(`${questions.length}개 문항을 문제은행에 등록할까요? 같은 시험을 다시 등록하면 최신 검수 내용으로 갱신됩니다.`)) return;
    setRegisteringBank(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/problem-bank/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: analysis.id }),
      });
      const result = await response.json() as { success: boolean; registered?: number; embedded?: number; message?: string };
      if (!response.ok || !result.success) throw new Error(result.message || "문제은행 등록에 실패했습니다.");
      setAnalysis((current) => current ? { ...current, status: "DONE", progress: 100, current_step: "문제은행 등록 완료" } : current);
      setMessage(`문제은행 등록 완료 · ${result.registered ?? questions.length}문항 · Embedding ${result.embedded ?? 0}개 생성`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "문제은행 등록에 실패했습니다.");
    } finally {
      setRegisteringBank(false);
    }
  };

  const activeUrl = viewer === "exam" ? examUrl : solutionUrl;
  const activePdfUrl = activeUrl ? `${activeUrl}${activeUrl.includes("#") ? "&" : "#"}zoom=page-width` : "";
  const progress = analysis?.progress ?? 0;
  const stepIndex = !analysis ? 1 : analysis.status === "DONE" ? 4 : analysis.status === "REVIEW" ? 3 : 2;
  const approvedCount = questions.filter((item) => item.status === "APPROVED").length;

  return <>
    <section className="page-title-row analysis-title-row">
      <div><h2>AI 분석 관리</h2><p>등록한 시험지의 PDF와 분석 작업 상태를 한 화면에서 관리합니다.</p></div>
      <label className="analysis-source-select"><span>분석할 시험지</span><select value={selectedId} onChange={(e) => void changeSource(e.target.value)} disabled={loading}>{sources.length === 0 ? <option value="">등록된 시험지 없음</option> : sources.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.grade || "학년 미지정"}</option>)}</select></label>
    </section>

    <section className="analysis-stepper panel">
      {["업로드", "AI 분석", "검수", "문제은행"].map((label, index) => <div key={label} className={index + 1 <= stepIndex ? "active" : ""}><i>{index + 1}</i><strong>{label}</strong>{index < 3 ? <span>›</span> : null}</div>)}
    </section>

    {errorMessage ? <div className="upload-message error">{errorMessage}</div> : null}
    {message ? <div className="upload-message success">{message}</div> : null}

    {!selectedSource ? <section className="panel source-file-empty">먼저 AI 문제등록에서 시험지를 등록해 주세요.</section> : <div className={`analysis-workspace-grid ${questions.length > 0 ? "has-results" : ""}`}>
      <section className="panel analysis-viewer-panel">
        <div className="analysis-panel-head"><div><strong>{selectedSource.title}</strong><span>{[selectedSource.grade, selectedSource.subject, selectedSource.source].filter(Boolean).join(" · ")}</span></div><div className="viewer-tabs"><button className={viewer === "exam" ? "active" : ""} onClick={() => setViewer("exam")}>시험지 PDF</button><button className={viewer === "solution" ? "active" : ""} onClick={() => setViewer("solution")}>해설지 PDF</button></div></div>
        <div className="pdf-workspace-viewer">{loading ? <div>PDF를 불러오는 중입니다.</div> : activeUrl ? <iframe title={viewer === "exam" ? "시험지 PDF" : "해설지 PDF"} src={activePdfUrl} /> : <div>등록된 PDF가 없습니다.</div>}</div>
      </section>

      <aside className="panel analysis-control-panel">
        <div className="analysis-status-line"><span>현재 상태</span><Status text={analysisStatusLabel[analysis?.status ?? "WAITING"] ?? "분석 대기"}/></div>
        <div className="analysis-progress-title"><strong>{progress}%</strong><span>{analysis?.current_step ?? "분석을 시작해 주세요."}</span></div>
        <div className="analysis-main-progress"><i style={{ width: `${progress}%` }}/></div>
        <div className="analysis-count-grid"><div><span>전체 문항</span><strong>{analysis?.total_questions ?? 0}</strong></div><div><span>객관식</span><strong>{analysis?.objective_count ?? 0}</strong></div><div><span>단답형</span><strong>{analysis?.subjective_count ?? 0}</strong></div></div>
        <div className="analysis-ai-check">
          <button className="secondary-button" type="button" onClick={() => void checkAiConnection()} disabled={checkingAi || starting}>
            {checkingAi ? "연결 확인 중..." : "AI 연결 확인"}
          </button>
          {aiConnection ? <span className={aiConnection.ok ? "ok" : "fail"}>{aiConnection.ok ? "✓" : "!"} {aiConnection.message}</span> : <small>먼저 API 키·결제·모델 연결을 확인합니다.</small>}
        </div>
        <button className="secondary-button analysis-probe-button" type="button" onClick={() => void runProbe()} disabled={probing || starting || loading}>{probing ? "GPT가 시험지를 판독 중..." : "1차 판독 테스트 (문항 수 + 1번)"}</button>
        <button className="primary-button analysis-start-button" onClick={() => void startAnalysis()} disabled={starting || probing || loading}>{starting ? "GPT가 전체 PDF 분석 중... (잠시 기다려 주세요)" : analysis ? "전체 AI 분석 다시 시작" : "전체 AI 분석 시작"}</button>
        {analysis ? <div className="analysis-manual-controls"><label className="field"><span>진행 단계 메모</span><input value={analysis.current_step} onChange={(e) => setAnalysis({ ...analysis, current_step: e.target.value })}/></label><label className="field"><span>진행률</span><input type="number" min="0" max="100" value={analysis.progress} onChange={(e) => setAnalysis({ ...analysis, progress: Math.max(0, Math.min(100, Number(e.target.value))) })}/></label><button className="secondary-button" onClick={() => void saveWorkspace({ current_step: analysis.current_step, progress: analysis.progress })} disabled={saving}>{saving ? "저장 중..." : "상태 저장"}</button></div> : null}
        <div className="analysis-job-log"><h3>작업 기록</h3>{jobs.length === 0 ? <p>아직 생성된 작업이 없습니다.</p> : jobs.slice(0, 4).map((job) => <article key={job.id}><div><strong>{job.status}</strong><span>{new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(job.created_at))}</span></div><p>{job.logs?.[job.logs.length - 1]?.message || "작업 생성"}</p></article>)}</div>
      </aside>
      {probeResult ? <section className="panel analysis-probe-result">
        <div className="source-file-title"><div><strong>GPT 1차 판독 결과</strong><span>{probeModel ? `사용 모델 · ${probeModel}` : ""}</span></div></div>
        <div className="analysis-probe-stats">
          <div><span>추정 페이지</span><strong>{probeResult.page_count_estimate}</strong></div>
          <div><span>전체 문항</span><strong>{probeResult.total_questions}</strong></div>
          <div><span>객관식</span><strong>{probeResult.objective_count}</strong></div>
          <div><span>단답·서술</span><strong>{probeResult.subjective_count}</strong></div>
        </div>
        <article className="analysis-first-question">
          <div className="analysis-first-question-head"><strong>{probeResult.first_question.question_no}번 문항</strong><span>{probeResult.first_question.question_type === "objective" ? "객관식" : probeResult.first_question.question_type === "subjective" ? "단답·서술형" : "미분류"}</span></div>
          <div className="analysis-first-question-grid">
            <div><span>과목</span><strong>{probeResult.first_question.subject || "-"}</strong></div>
            <div><span>단원</span><strong>{probeResult.first_question.unit || "-"}</strong></div>
            <div><span>유형</span><strong>{probeResult.first_question.topic || "-"}</strong></div>
            <div><span>난이도</span><strong>{probeResult.first_question.difficulty}</strong></div>
            <div><span>정답</span><strong>{probeResult.first_question.answer || "확인 필요"}</strong></div>
            <div><span>신뢰도</span><strong>{Math.round(probeResult.first_question.confidence * 100)}%</strong></div>
          </div>
          <p>{probeResult.first_question.summary}</p>
          {probeResult.notes ? <small>{probeResult.notes}</small> : null}
        </article>
      </section> : null}
      {questions.length > 0 ? <section className="panel analysis-question-results">
        <div className="source-file-title analysis-review-title"><div><strong>AI 문항 분석 결과 · 검수</strong><span>총 {questions.length}문항 · 검수 확정 {approvedCount}문항</span></div><div className="review-bank-actions"><span className={`review-visibility-note ${approvedCount === questions.length ? "complete" : ""}`}>{approvedCount === questions.length ? "모든 문항 검수 완료" : `남은 문항 ${questions.length - approvedCount}개`}</span><button type="button" className="primary-button" disabled={registeringBank || approvedCount !== questions.length} onClick={() => void registerProblemBank()}>{registeringBank ? "문제은행 등록 중..." : analysis?.status === "DONE" ? "문제은행 다시 반영" : "문제은행 등록"}</button></div></div>
        <div className="analysis-review-layout">
          <section className="analysis-review-preview">
            <div className="analysis-review-preview-head">
              <div><strong>원본 PDF 미리보기</strong><span>시험지와 해설지를 옆에 띄워 놓고 바로 검수합니다.</span></div>
              <div className="viewer-tabs">
                <button type="button" className={viewer === "exam" ? "active" : ""} onClick={() => setViewer("exam")}>시험지 PDF</button>
                <button type="button" className={viewer === "solution" ? "active" : ""} onClick={() => setViewer("solution")}>해설지 PDF</button>
              </div>
            </div>
            <div className="analysis-review-pdf">
              {activeUrl ? <iframe key={`${viewer}-${activePdfUrl}`} src={activePdfUrl} title={viewer === "exam" ? "시험지 PDF 미리보기" : "해설지 PDF 미리보기"} /> : <span>미리볼 PDF가 없습니다.</span>}
            </div>
          </section>
          <section className="analysis-review-side">
            <div className="analysis-question-table">
              <div className="analysis-question-head"><span>번호</span><span>구분</span><span>단원·유형</span><span>난이도</span><span>정답</span><span>신뢰도</span></div>
              {questions.map((q) => {
                const result = getQuestionResult(q);
                return <button type="button" className={`analysis-question-row ${selectedQuestionId === q.id ? "selected" : ""} ${q.status === "APPROVED" ? "approved" : ""}`} key={q.id} onClick={() => selectQuestion(q)}>
                  <strong>{q.question_no}</strong>
                  <span>{result?.question_type === "objective" ? "객관식" : result?.question_type === "subjective" ? "단답형" : "미분류"}</span>
                  <div><b>{[result?.unit, result?.topic].filter(Boolean).join(" · ") || "분류 필요"}</b><small>{result?.summary || ""}</small></div>
                  <span>{result?.difficulty || "-"}</span>
                  <strong>{q.answer || "-"}</strong>
                  <span className="question-row-confidence">{q.status === "APPROVED" ? "✓ 확정" : q.confidence == null ? "-" : `${Math.round(Number(q.confidence) * 100)}%`}</span>
                </button>;
              })}
            </div>
            {questionDraft ? <aside className="analysis-question-editor">
              <div className="question-editor-head"><div><strong>{questions.find((item) => item.id === selectedQuestionId)?.question_no ?? "-"}번 문항 검수</strong><span>왼쪽 원본과 비교해 필요한 부분만 고치세요.</span></div><span className="question-confidence">신뢰도 {Math.round(Number(questions.find((item) => item.id === selectedQuestionId)?.confidence ?? 0) * 100)}%</span></div>
              <div className="question-editor-grid">
                <label><span>구분</span><select value={questionDraft.question_type} onChange={(e) => setQuestionDraft({ ...questionDraft, question_type: e.target.value })}><option value="objective">객관식</option><option value="subjective">단답·서술형</option><option value="unknown">미분류</option></select></label>
                <label><span>난이도</span><select value={questionDraft.difficulty} onChange={(e) => setQuestionDraft({ ...questionDraft, difficulty: e.target.value })}><option value="하">하</option><option value="중">중</option><option value="상">상</option><option value="최상">최상</option></select></label>
                <label><span>과목</span><input value={questionDraft.subject} onChange={(e) => setQuestionDraft({ ...questionDraft, subject: e.target.value })}/></label>
                <label><span>정답</span><input value={questionDraft.answer} onChange={(e) => setQuestionDraft({ ...questionDraft, answer: e.target.value })}/></label>
                <label className="wide"><span>단원</span><input value={questionDraft.unit} onChange={(e) => setQuestionDraft({ ...questionDraft, unit: e.target.value })}/></label>
                <label className="wide"><span>유형</span><input value={questionDraft.topic} onChange={(e) => setQuestionDraft({ ...questionDraft, topic: e.target.value })}/></label>
                <label className="wide"><span>문항 요약</span><textarea rows={4} value={questionDraft.summary} onChange={(e) => setQuestionDraft({ ...questionDraft, summary: e.target.value })}/></label>
              </div>
              <div className="question-editor-nav"><button type="button" onClick={() => moveQuestion(-1)} disabled={questions.findIndex((item) => item.id === selectedQuestionId) <= 0}>← 이전 문항</button><span>{questions.findIndex((item) => item.id === selectedQuestionId) + 1} / {questions.length}</span><button type="button" onClick={() => moveQuestion(1)} disabled={questions.findIndex((item) => item.id === selectedQuestionId) >= questions.length - 1}>다음 문항 →</button></div>
              <div className="question-editor-actions"><button className="secondary-button" type="button" onClick={() => void saveQuestion("REVIEW")} disabled={savingQuestion}>검수 필요로 저장</button><button className="primary-button" type="button" onClick={() => void saveQuestion("APPROVED")} disabled={savingQuestion}>{savingQuestion ? "저장 중..." : questionDraft.status === "APPROVED" ? "검수 내용 다시 저장" : "검수 확정"}</button></div>
            </aside> : null}
          </section>
        </div>
      </section> : null}
    </div>}
  </>;
}

function ComingSoon({ title, onMove }: { title: string; onMove: (menu: AdminMenu) => void }) { return <section className="empty-page"><div className="empty-icon">✦</div><h2>{title}</h2><p>학생관리 다음 단계에서 실제 운영 기능을 연결합니다.</p><button className="primary-button" onClick={() => onMove("students")}>학생 관리로 돌아가기</button></section>; }
function MiniStat({ label, value, note, emphasis = false }: { label: string; value: string; note: string; emphasis?: boolean }) { return <article className={`mini-stat ${emphasis ? "emphasis" : ""}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-row"><span>{label}</span><strong>{value}</strong></div>; }
function Status({ text }: { text: string }) { const tone = ["정상", "분석완료", "등록완료"].includes(text) ? "green" : ["훈련중"].includes(text) ? "blue" : ["진단대기", "작성중"].includes(text) ? "orange" : ["퇴원"].includes(text) ? "red" : "gray"; return <span className={`pill ${tone}`}>{text}</span>; }
