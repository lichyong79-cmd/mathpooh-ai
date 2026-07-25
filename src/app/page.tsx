"use client";

import { FormEvent, useMemo, useState } from "react";

type AdminMenu = "dashboard" | "students" | "exams" | "problems" | "analysis" | "recommend" | "results" | "settings";
type StudentStatus = "정상" | "휴원" | "퇴원";
type SosStatus = "분석완료" | "훈련중" | "진단대기" | "미응시";
type StudentTab = "students" | "registration";
type ExamRound = { id: number; name: string; date: string; grade: string; status: "등록중" | "마감" };

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

const emptyStudent: Omit<Student, "id"> = {
  name: "", school: "", grade: "고1", phone: "", parentPhone: "", status: "정상", sosStatus: "진단대기", lastScore: null, lastExam: "-", joinedAt: new Date().toISOString().slice(0, 10), memo: "",
};

export default function Home() {
  const [active, setActive] = useState<AdminMenu>("students");
  const [collapsed, setCollapsed] = useState(false);
  const [students, setStudents] = useState<Student[]>(initialStudents);

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
          {active === "students" ? <StudentsPage students={students} setStudents={setStudents} /> : active === "dashboard" ? <Dashboard students={students} onMove={setActive} /> : <ComingSoon title={title} onMove={setActive} />}
        </div>
      </section>
    </main>
  );
}

function StudentsPage({ students, setStudents }: { students: Student[]; setStudents: React.Dispatch<React.SetStateAction<Student[]>> }) {
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("전체");
  const [status, setStatus] = useState("전체");
  const [sosStatus, setSosStatus] = useState("전체");
  const [selected, setSelected] = useState<Student | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [tab, setTab] = useState<StudentTab>("students");
  const [selectedRoundId, setSelectedRoundId] = useState(examRounds[0].id);
  const [registrations, setRegistrations] = useState<Record<number, number[]>>({ 1: [1, 2, 4], 2: [1, 4], 3: [5], 4: [1, 2, 3, 4, 6] });

  const filtered = useMemo(() => students.filter((student) => {
    const keyword = `${student.name} ${student.school} ${student.phone} ${student.parentPhone}`.toLowerCase();
    return keyword.includes(search.toLowerCase()) && (grade === "전체" || student.grade === grade) && (status === "전체" || student.status === status) && (sosStatus === "전체" || student.sosStatus === sosStatus);
  }), [students, search, grade, status, sosStatus]);

  const stats = {
    all: students.length,
    active: students.filter((s) => s.status === "정상").length,
    waiting: students.filter((s) => s.sosStatus === "진단대기").length,
    training: students.filter((s) => s.sosStatus === "훈련중").length,
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
      <div><h2>학생 관리</h2><p>학생 기본정보와 SOS 진단·훈련 진행 상태를 한 곳에서 관리합니다.</p></div>
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
        <MiniStat label="진단 대기" value={`${stats.waiting}명`} note="분석 필요" emphasis />
        <MiniStat label="SOS 훈련중" value={`${stats.training}명`} note="현재 진행" />
      </section>

    <section className="panel student-panel">
      <div className="student-toolbar">
        <label className="global-search large"><span>⌕</span><input placeholder="학생 이름, 학교, 연락처 검색" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <select value={grade} onChange={(e) => setGrade(e.target.value)}><option>전체</option><option>중3</option><option>고1</option><option>고2</option><option>고3</option></select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option>전체</option><option>정상</option><option>휴원</option><option>퇴원</option></select>
        <select value={sosStatus} onChange={(e) => setSosStatus(e.target.value)}><option>전체</option><option>분석완료</option><option>훈련중</option><option>진단대기</option><option>미응시</option></select>
        <button className="secondary-button" onClick={() => { setSearch(""); setGrade("전체"); setStatus("전체"); setSosStatus("전체"); }}>초기화</button>
      </div>
      <div className="list-summary"><strong>학생 {filtered.length}명</strong><span>행을 클릭하면 학생 상세정보가 열립니다.</span></div>
      <div className="data-table student-list">
        <div className="table-head"><span>학생</span><span>학교 / 학년</span><span>학생 연락처</span><span>최근 점수</span><span>SOS 상태</span><span>재원 상태</span><span>최근 응시</span><span>관리</span></div>
        {filtered.map((student) => (
          <div className="table-row clickable" key={student.id} onClick={() => setSelected(student)}>
            <div className="student-name"><i>{student.name.slice(0, 1)}</i><div><strong>{student.name}</strong><small>등록 {student.joinedAt}</small></div></div>
            <span>{student.school} · {student.grade}</span><span>{student.phone}</span>
            <b className="score-cell">{student.lastScore === null ? "-" : `${student.lastScore}점`}</b>
            <Status text={student.sosStatus} /><Status text={student.status} /><span>{student.lastExam}</span>
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
        <div className="table-head"><span>학생</span><span>학교 / 학년</span><span>연락처</span><span>SOS 상태</span><span>등록 여부</span><span>변경</span></div>
        {roundStudents.map((student) => {
          const isRegistered = registeredIds.includes(student.id);
          return <div className="table-row" key={student.id}>
            <div className="student-name"><i>{student.name.slice(0, 1)}</i><div><strong>{student.name}</strong><small>{student.school}</small></div></div>
            <span>{student.school} · {student.grade}</span><span>{student.phone}</span><Status text={student.sosStatus} />
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
      <Field label="SOS 상태"><select value={form.sosStatus} onChange={(e) => set("sosStatus", e.target.value as SosStatus)}><option>진단대기</option><option>훈련중</option><option>분석완료</option><option>미응시</option></select></Field>
      <Field label="등록일"><input type="date" value={form.joinedAt} onChange={(e) => set("joinedAt", e.target.value)} /></Field>
      <Field label="최근 점수"><input type="number" min="0" max="100" value={form.lastScore ?? ""} onChange={(e) => set("lastScore", e.target.value === "" ? null : Number(e.target.value))} placeholder="0~100" /></Field>
      <Field label="최근 응시일"><input type="date" value={form.lastExam === "-" ? "" : form.lastExam} onChange={(e) => set("lastExam", e.target.value || "-")} /></Field>
      <label className="field full"><span>관리 메모</span><textarea value={form.memo} onChange={(e) => set("memo", e.target.value)} placeholder="학생 지도에 필요한 메모를 입력하세요." /></label>
    </div>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>취소</button><button className="primary-button">저장</button></div>
  </form></div>;
}

function StudentDrawer({ student, onClose, onEdit, onDelete }: { student: Student; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="student-drawer" onMouseDown={(e) => e.stopPropagation()}>
    <div className="drawer-head"><span>학생 상세정보</span><button onClick={onClose}>×</button></div>
    <div className="student-profile"><i>{student.name.slice(0, 1)}</i><div><h3>{student.name}</h3><p>{student.school} · {student.grade}</p></div><Status text={student.status} /></div>
    <div className="detail-score"><span>최근 시험 점수</span><strong>{student.lastScore === null ? "-" : student.lastScore}<small>{student.lastScore === null ? "" : "점"}</small></strong><Status text={student.sosStatus} /></div>
    <div className="detail-section"><h4>기본 정보</h4><Detail label="학생 연락처" value={student.phone || "-"} /><Detail label="학부모 연락처" value={student.parentPhone || "-"} /><Detail label="등록일" value={student.joinedAt} /><Detail label="최근 응시" value={student.lastExam} /></div>
    <div className="detail-section"><h4>관리 메모</h4><p className="memo-box">{student.memo || "등록된 메모가 없습니다."}</p></div>
    <div className="drawer-actions"><button className="secondary-button danger" onClick={onDelete}>학생 삭제</button><button className="primary-button" onClick={onEdit}>정보 수정</button></div>
  </aside></div>;
}

function Dashboard({ students, onMove }: { students: Student[]; onMove: (menu: AdminMenu) => void }) {
  return <><section className="welcome-card"><div><span className="pill">MATSPU SOS</span><h2>학생의 점수를 데이터로 최적화합니다.</h2><p>진단부터 훈련 추천까지 매쓰푸의 전체 흐름을 관리하세요.</p></div></section><section className="student-stat-grid"><MiniStat label="등록 학생" value={`${students.length}명`} note="전체 회원" /><MiniStat label="재원 학생" value={`${students.filter(s => s.status === "정상").length}명`} note="현재 학습중" /><MiniStat label="AI 분석 대기" value="12건" note="검토 필요" emphasis /><MiniStat label="추천 승인 대기" value="7건" note="SOS 추천" /></section><section className="empty-page"><div className="empty-icon">⌂</div><h2>대시보드 상세 구성 예정</h2><p>현재는 학생관리 기능을 우선 개발했습니다.</p><button className="primary-button" onClick={() => onMove("students")}>학생 관리 열기</button></section></>;
}

function ComingSoon({ title, onMove }: { title: string; onMove: (menu: AdminMenu) => void }) { return <section className="empty-page"><div className="empty-icon">✦</div><h2>{title}</h2><p>학생관리 다음 단계에서 실제 운영 기능을 연결합니다.</p><button className="primary-button" onClick={() => onMove("students")}>학생 관리로 돌아가기</button></section>; }
function MiniStat({ label, value, note, emphasis = false }: { label: string; value: string; note: string; emphasis?: boolean }) { return <article className={`mini-stat ${emphasis ? "emphasis" : ""}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-row"><span>{label}</span><strong>{value}</strong></div>; }
function Status({ text }: { text: string }) { const tone = ["정상", "분석완료"].includes(text) ? "green" : ["훈련중"].includes(text) ? "blue" : ["진단대기"].includes(text) ? "orange" : ["퇴원"].includes(text) ? "red" : "gray"; return <span className={`pill ${tone}`}>{text}</span>; }
