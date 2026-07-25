"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type AdminMenu = "dashboard" | "students" | "exams" | "problems" | "analysis" | "recommend" | "results" | "settings";
type StudentStatus = "정상" | "휴원" | "퇴원";
type SosStatus = "분석완료" | "훈련중" | "진단대기" | "미응시";
type StudentTab = "students" | "registration";
type ExamRound = { id: number; name: string; date: string; grade: string; status: "등록중" | "마감" };
type ExamStatus = "작성중" | "등록완료" | "마감";
type PracticeExam = {
  id: number;
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
  memo: string;
};

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
  { id: "problems", label: "훈련 문제은행", icon: "▦" },
  { id: "analysis", label: "AI 분석 관리", icon: "✦", badge: 12 },
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
  { id: 1, round: 1, title: "2026 SOS 고1 실전모의고사 1회", examCode: "SOS-H1-2026-01", examDate: "2026-08-02", grade: "고1", subject: "공통수학2", range: "도형의 방정식 ~ 집합과 명제", questionCount: 30, timeLimit: 80, totalScore: 100, objectiveCount: 21, shortAnswerCount: 9, status: "등록완료", testFile: "SOS_H1_01_시험지.pdf", solutionFile: "SOS_H1_01_해설지.pdf", memo: "고1 여름방학 진단용" },
  { id: 2, round: 2, title: "2026 SOS 고2 실전모의고사 2회", examCode: "SOS-H2-2026-02", examDate: "2026-08-09", grade: "고2", subject: "수학Ⅱ", range: "함수의 극한 ~ 미분", questionCount: 30, timeLimit: 80, totalScore: 100, objectiveCount: 21, shortAnswerCount: 9, status: "작성중", testFile: "", solutionFile: "", memo: "문항 검토 중" },
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
          {menus.slice(0, 7).map((menu) => (
            <button key={menu.id} className={active === menu.id ? "active" : ""} onClick={() => setActive(menu.id)}>
              <i>{menu.icon}</i><span>{menu.label}</span>{menu.badge ? <b>{menu.badge}</b> : null}
            </button>
          ))}
          <p className="system-title">시스템</p>
          {menus.slice(7).map((menu) => (
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
          {active === "students" ? <StudentsPage students={students} setStudents={setStudents} /> : active === "exams" ? <ExamsPage exams={practiceExams} setExams={setPracticeExams} /> : active === "results" ? <ResultsPage students={students} /> : active === "dashboard" ? <Dashboard students={students} onMove={setActive} /> : <ComingSoon title={title} onMove={setActive} />}
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


function ExamsPage({ exams, setExams }: { exams: PracticeExam[]; setExams: React.Dispatch<React.SetStateAction<PracticeExam[]>> }) {
  const [tab, setTab] = useState<"list" | "input">("list");
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("matspu-exam-tab");
    if (saved === "list" || saved === "input") setTab(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("matspu-exam-tab", tab);
  }, [tab]);
  const emptyExam: Omit<PracticeExam, "id"> = { round: exams.length + 1, title: "", examCode: "", examDate: new Date().toISOString().slice(0, 10), grade: "고1", subject: "공통수학1", range: "", questionCount: 30, timeLimit: 80, totalScore: 100, objectiveCount: 21, shortAnswerCount: 9, status: "작성중", testFile: "", solutionFile: "", memo: "" };
  const [form, setForm] = useState<Omit<PracticeExam, "id">>(emptyExam);
  const set = <K extends keyof Omit<PracticeExam, "id">>(key: K, value: Omit<PracticeExam, "id">[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const startNew = () => { setEditingId(null); setForm({ ...emptyExam, round: Math.max(0, ...exams.map((exam) => exam.round)) + 1 }); setTab("input"); };
  const editExam = (exam: PracticeExam) => { const { id, ...rest } = exam; setEditingId(id); setForm(rest); setTab("input"); };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.examCode.trim() || !form.examDate) return alert("시험명, 시험코드, 시험일을 입력해 주세요.");
    if (form.objectiveCount + form.shortAnswerCount !== form.questionCount) return alert("객관식과 단답형 문항 수의 합이 전체 문항 수와 같아야 합니다.");
    if (editingId) setExams((prev) => prev.map((exam) => exam.id === editingId ? { ...form, id: editingId } : exam));
    else setExams((prev) => [{ ...form, id: Math.max(0, ...prev.map((exam) => exam.id)) + 1 }, ...prev]);
    setTab("list"); setEditingId(null);
  };
  const remove = (id: number) => { if (window.confirm("이 실전모의고사를 삭제할까요?")) setExams((prev) => prev.filter((exam) => exam.id !== id)); };
  return <>
    <section className="page-title-row">
      <div><h2>실전 모의고사</h2><p>시험 회차와 기본정보, 문항 구성, 시험지·해설지를 등록합니다.</p></div>
      <button className="primary-button" onClick={startNew}>＋ 실전모의고사 입력</button>
    </section>
    <div className="student-tabs">
      <button className={tab === "list" ? "active" : ""} onClick={() => setTab("list")}>시험 목록</button>
      <button className={tab === "input" ? "active" : ""} onClick={() => { if (tab !== "input") startNew(); }}>{editingId ? "시험 수정" : "실전모의고사 입력"}</button>
    </div>
    {tab === "list" ? <>
      <section className="student-stat-grid">
        <MiniStat label="전체 시험" value={`${exams.length}회`} note="등록된 실전모의고사" />
        <MiniStat label="등록 완료" value={`${exams.filter(e => e.status === "등록완료").length}회`} note="응시 등록 가능" />
        <MiniStat label="작성중" value={`${exams.filter(e => e.status === "작성중").length}회`} note="추가 입력 필요" emphasis />
        <MiniStat label="마감" value={`${exams.filter(e => e.status === "마감").length}회`} note="종료된 시험" />
      </section>
      <section className="panel exam-list-panel">
        <div className="list-summary"><strong>실전모의고사 {exams.length}회</strong><span>시험을 선택해 수정하거나 등록 상태를 확인합니다.</span></div>
        <div className="data-table exam-list">
          <div className="table-head"><span>회차 / 시험명</span><span>시험코드</span><span>대상 / 과목</span><span>시험일</span><span>문항 / 시간</span><span>파일</span><span>상태</span><span>관리</span></div>
          {exams.map((exam) => <div className="table-row" key={exam.id}>
            <div className="exam-name-cell"><i>{exam.round}</i><div><strong>{exam.title}</strong><small>{exam.range || "범위 미입력"}</small></div></div>
            <b>{exam.examCode}</b><span>{exam.grade} · {exam.subject}</span><span>{exam.examDate}</span><span>{exam.questionCount}문항 · {exam.timeLimit}분</span>
            <span className="file-count">{[exam.testFile, exam.solutionFile].filter(Boolean).length}/2 등록</span><Status text={exam.status} />
            <div className="row-actions"><button onClick={() => editExam(exam)}>수정</button><button className="delete" onClick={() => remove(exam.id)}>삭제</button></div>
          </div>)}
        </div>
      </section>
    </> : <form className="exam-input-layout" onSubmit={save}>
      <section className="panel exam-form-panel">
        <div className="form-section-title"><div><span>01</span><div><h3>시험 기본정보</h3><p>회차를 구분할 수 있는 필수 정보를 입력합니다.</p></div></div></div>
        <div className="form-grid exam-form-grid">
          <Field label="시험 회차 *"><input type="number" min="1" value={form.round} onChange={(e) => set("round", Number(e.target.value))} /></Field>
          <Field label="시험일 *"><input type="date" value={form.examDate} onChange={(e) => set("examDate", e.target.value)} /></Field>
          <label className="field full"><span>시험명 *</span><input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="예: 2026 SOS 고1 실전모의고사 1회" /></label>
          <Field label="시험코드 *"><input value={form.examCode} onChange={(e) => set("examCode", e.target.value)} placeholder="예: SOS-H1-2026-01" /></Field>
          <Field label="등록 상태"><select value={form.status} onChange={(e) => set("status", e.target.value as ExamStatus)}><option>작성중</option><option>등록완료</option><option>마감</option></select></Field>
          <Field label="대상 학년"><select value={form.grade} onChange={(e) => set("grade", e.target.value)}><option>중3</option><option>고1</option><option>고2</option><option>고3</option><option>전체</option></select></Field>
          <Field label="과목"><input value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="예: 공통수학2" /></Field>
          <label className="field full"><span>시험 범위</span><input value={form.range} onChange={(e) => set("range", e.target.value)} placeholder="예: 도형의 방정식 ~ 집합과 명제" /></label>
        </div>
      </section>
      <section className="panel exam-form-panel">
        <div className="form-section-title"><div><span>02</span><div><h3>문항 구성</h3><p>전체 문항 수와 시험 운영 시간을 설정합니다.</p></div></div></div>
        <div className="form-grid exam-form-grid numbers">
          <Field label="전체 문항 수"><input type="number" min="1" value={form.questionCount} onChange={(e) => set("questionCount", Number(e.target.value))} /></Field>
          <Field label="총점"><input type="number" min="1" value={form.totalScore} onChange={(e) => set("totalScore", Number(e.target.value))} /></Field>
          <Field label="객관식 문항"><input type="number" min="0" value={form.objectiveCount} onChange={(e) => set("objectiveCount", Number(e.target.value))} /></Field>
          <Field label="단답형 문항"><input type="number" min="0" value={form.shortAnswerCount} onChange={(e) => set("shortAnswerCount", Number(e.target.value))} /></Field>
          <Field label="시험 시간(분)"><input type="number" min="1" value={form.timeLimit} onChange={(e) => set("timeLimit", Number(e.target.value))} /></Field>
          <div className={`question-check ${form.objectiveCount + form.shortAnswerCount === form.questionCount ? "ok" : "warning"}`}><span>문항 합계</span><strong>{form.objectiveCount + form.shortAnswerCount} / {form.questionCount}</strong><small>{form.objectiveCount + form.shortAnswerCount === form.questionCount ? "문항 수가 일치합니다." : "전체 문항 수와 맞춰주세요."}</small></div>
        </div>
      </section>
      <section className="panel exam-form-panel">
        <div className="form-section-title"><div><span>03</span><div><h3>시험 자료 등록</h3><p>현재는 파일명을 저장하며, Supabase 연결 시 실제 업로드로 전환합니다.</p></div></div></div>
        <div className="upload-grid">
          <label className="upload-card"><span>시험지 PDF</span><strong>{form.testFile || "등록된 파일 없음"}</strong><input type="file" accept=".pdf" onChange={(e) => set("testFile", e.target.files?.[0]?.name ?? "")} /><em>{form.testFile ? "파일 변경" : "PDF 선택"}</em></label>
          <label className="upload-card"><span>해설지 PDF</span><strong>{form.solutionFile || "등록된 파일 없음"}</strong><input type="file" accept=".pdf" onChange={(e) => set("solutionFile", e.target.files?.[0]?.name ?? "")} /><em>{form.solutionFile ? "파일 변경" : "PDF 선택"}</em></label>
        </div>
        <label className="field exam-memo"><span>관리 메모</span><textarea value={form.memo} onChange={(e) => set("memo", e.target.value)} placeholder="출제 의도, 검토 상태 등 관리자 메모를 입력하세요." /></label>
      </section>
      <div className="exam-form-actions"><button type="button" className="secondary-button" onClick={() => setTab("list")}>취소</button><button className="primary-button">{editingId ? "수정 저장" : "시험 등록"}</button></div>
    </form>}
  </>;
}

function Dashboard({ students, onMove }: { students: Student[]; onMove: (menu: AdminMenu) => void }) {
  return <><section className="welcome-card"><div><span className="pill">MATSPU SOS</span><h2>학생의 점수를 데이터로 최적화합니다.</h2><p>진단부터 훈련 추천까지 매쓰푸의 전체 흐름을 관리하세요.</p></div></section><section className="student-stat-grid"><MiniStat label="등록 학생" value={`${students.length}명`} note="전체 회원" /><MiniStat label="재원 학생" value={`${students.filter(s => s.status === "정상").length}명`} note="현재 학습중" /><MiniStat label="AI 분석 대기" value="12건" note="검토 필요" emphasis /><MiniStat label="추천 승인 대기" value="7건" note="SOS 추천" /></section><section className="empty-page"><div className="empty-icon">⌂</div><h2>대시보드 상세 구성 예정</h2><p>현재는 학생관리 기능을 우선 개발했습니다.</p><button className="primary-button" onClick={() => onMove("students")}>학생 관리 열기</button></section></>;
}

function ComingSoon({ title, onMove }: { title: string; onMove: (menu: AdminMenu) => void }) { return <section className="empty-page"><div className="empty-icon">✦</div><h2>{title}</h2><p>학생관리 다음 단계에서 실제 운영 기능을 연결합니다.</p><button className="primary-button" onClick={() => onMove("students")}>학생 관리로 돌아가기</button></section>; }
function MiniStat({ label, value, note, emphasis = false }: { label: string; value: string; note: string; emphasis?: boolean }) { return <article className={`mini-stat ${emphasis ? "emphasis" : ""}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-row"><span>{label}</span><strong>{value}</strong></div>; }
function Status({ text }: { text: string }) { const tone = ["정상", "분석완료", "등록완료"].includes(text) ? "green" : ["훈련중"].includes(text) ? "blue" : ["진단대기", "작성중"].includes(text) ? "orange" : ["퇴원"].includes(text) ? "red" : "gray"; return <span className={`pill ${tone}`}>{text}</span>; }
