"use client";

import { useMemo, useState } from "react";

type AdminMenu = "dashboard" | "students" | "exams" | "problems" | "analysis" | "recommend" | "results" | "settings";

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

const students = [
  { name: "김민준", school: "보성고", grade: "고2", status: "분석완료", last: "7월 24일", score: 82 },
  { name: "문예진", school: "잠실여고", grade: "고1", status: "훈련중", last: "7월 24일", score: 76 },
  { name: "김가연B", school: "영동일고", grade: "고1", status: "진단대기", last: "7월 23일", score: 68 },
  { name: "송연우", school: "배명고", grade: "고2", status: "분석완료", last: "7월 22일", score: 91 },
];

const exams = [
  { title: "고2 미적분 실전 진단 01", grade: "고2", questions: 30, participants: 24, status: "진행중", date: "2026.07.25" },
  { title: "고1 공통수학2 실전 03", grade: "고1", questions: 28, participants: 31, status: "배포완료", date: "2026.07.24" },
  { title: "고3 수능형 미니모의 07", grade: "고3", questions: 15, participants: 18, status: "채점완료", date: "2026.07.23" },
  { title: "중3 고등준비 진단 02", grade: "중3", questions: 20, participants: 26, status: "작성중", date: "2026.07.22" },
];

function Pill({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "orange" | "gray" | "red" }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export default function Home() {
  const [active, setActive] = useState<AdminMenu>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");

  const title = menus.find((menu) => menu.id === active)?.label ?? "대시보드";
  const filteredStudents = useMemo(() => students.filter((s) => `${s.name}${s.school}${s.grade}`.toLowerCase().includes(search.toLowerCase())), [search]);

  return (
    <main className={`admin-app ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-symbol">S</div>
          <div className="brand-copy"><strong>SOS</strong><span>Score Optimization System</span></div>
          <button className="collapse-button" onClick={() => setCollapsed((v) => !v)} aria-label="사이드바 접기">‹</button>
        </div>

        <div className="workspace-card">
          <div className="workspace-logo">새</div>
          <div><strong>새움수 고등부</strong><span>관리자 워크스페이스</span></div>
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
          <div>
            <p>SOS 관리자</p>
            <h1>{title}</h1>
          </div>
          <div className="top-actions">
            <label className="global-search"><span>⌕</span><input placeholder="학생, 시험, 문제 검색" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
            <button className="icon-button">?</button>
            <button className="icon-button notification">♢<b>3</b></button>
            <button className="primary-button" onClick={() => setActive("exams")}>＋ 새 시험 만들기</button>
          </div>
        </header>

        <div className="page-content">
          {active === "dashboard" ? <Dashboard onMove={setActive} /> : active === "students" ? <StudentsPage data={filteredStudents} search={search} setSearch={setSearch} /> : <ComingSoon menu={active} title={title} onMove={setActive} />}
        </div>
      </section>
    </main>
  );
}

function Dashboard({ onMove }: { onMove: (menu: AdminMenu) => void }) {
  return <>
    <section className="welcome-card">
      <div><Pill tone="blue">2026년 7월 25일 토요일</Pill><h2>오늘도 학생의 점수를 최적화해 볼까요?</h2><p>진행 중인 시험과 AI 분석 대기 항목을 확인하고 필요한 작업을 이어가세요.</p></div>
      <div className="welcome-visual"><span>점수</span><strong>+12.4</strong><small>최근 4주 평균 향상</small><div className="mini-bars"><i/><i/><i/><i/><i/><i/></div></div>
    </section>

    <section className="stat-grid">
      <Stat icon="♙" label="등록 학생" value="128" change="이번 달 +8명" tone="blue" />
      <Stat icon="▤" label="진행 중 시험" value="6" change="오늘 2개 마감" tone="purple" />
      <Stat icon="✦" label="AI 분석 대기" value="12" change="우선 처리 필요" tone="orange" />
      <Stat icon="◎" label="추천 승인 대기" value="7" change="어제보다 3건 감소" tone="green" />
    </section>

    <section className="dashboard-grid">
      <article className="panel wide">
        <div className="panel-head"><div><h3>오늘의 운영 현황</h3><p>시험 응시부터 SOS 추천까지의 진행 상태입니다.</p></div><button onClick={() => onMove("results")}>전체 이력 보기 →</button></div>
        <div className="flow-grid">
          <Flow step="01" label="시험 응시" value="42명" note="응시 중 11명" />
          <Flow step="02" label="자동 채점" value="31건" note="완료율 73.8%" />
          <Flow step="03" label="AI 진단" value="19건" note="대기 12건" warn />
          <Flow step="04" label="SOS 추천" value="14건" note="승인 대기 7건" />
        </div>
        <div className="progress-wrap"><div><span>오늘 처리율</span><b>74%</b></div><div className="progress"><i style={{ width: "74%" }} /></div></div>
      </article>

      <article className="panel quick-panel">
        <div className="panel-head"><div><h3>빠른 작업</h3><p>자주 사용하는 메뉴</p></div></div>
        <div className="quick-grid">
          <button onClick={() => onMove("exams")}><i>＋</i><strong>시험 만들기</strong><span>PDF·정답 등록</span></button>
          <button onClick={() => onMove("students")}><i>♙</i><strong>학생 등록</strong><span>학생 정보 추가</span></button>
          <button onClick={() => onMove("problems")}><i>▦</i><strong>문제 등록</strong><span>훈련 문제 추가</span></button>
          <button onClick={() => onMove("analysis")}><i>✦</i><strong>분석 검토</strong><span>AI 결과 확인</span></button>
        </div>
      </article>
    </section>

    <section className="dashboard-grid lower">
      <article className="panel wide">
        <div className="panel-head"><div><h3>최근 실전 모의고사</h3><p>최근 등록하거나 진행한 시험입니다.</p></div><button onClick={() => onMove("exams")}>시험 전체 보기 →</button></div>
        <div className="data-table exam-list">
          <div className="table-head"><span>시험명</span><span>대상</span><span>문항</span><span>응시</span><span>상태</span><span>날짜</span></div>
          {exams.map((exam) => <div className="table-row" key={exam.title}><strong>{exam.title}</strong><span>{exam.grade}</span><span>{exam.questions}</span><span>{exam.participants}명</span><Status text={exam.status}/><span>{exam.date}</span></div>)}
        </div>
      </article>

      <article className="panel activity-panel">
        <div className="panel-head"><div><h3>최근 활동</h3><p>실시간 운영 기록</p></div></div>
        <div className="activity-list">
          <Activity icon="✓" title="김민준 분석 완료" text="고2 미적분 실전 진단 01" time="8분 전" />
          <Activity icon="✦" title="AI 분석 5건 생성" text="검토 대기 목록에 추가됨" time="22분 전" />
          <Activity icon="＋" title="문예진 시험 제출" text="76점 · 오답 7문항" time="41분 전" />
          <Activity icon="◎" title="SOS 추천 승인" text="송연우 훈련 10문항" time="1시간 전" />
        </div>
      </article>
    </section>
  </>;
}

function StudentsPage({ data, search, setSearch }: { data: typeof students; search: string; setSearch: (v: string) => void }) {
  return <>
    <section className="page-title-row"><div><h2>학생 관리</h2><p>학생 정보와 최근 시험·SOS 진행 상태를 관리합니다.</p></div><button className="primary-button">＋ 학생 등록</button></section>
    <section className="panel">
      <div className="toolbar"><label className="global-search large"><span>⌕</span><input placeholder="학생 이름 또는 학교 검색" value={search} onChange={(e) => setSearch(e.target.value)} /></label><select><option>전체 학년</option><option>중3</option><option>고1</option><option>고2</option><option>고3</option></select><select><option>전체 상태</option><option>분석완료</option><option>훈련중</option><option>진단대기</option></select></div>
      <div className="data-table student-list">
        <div className="table-head"><span>학생</span><span>학교 / 학년</span><span>최근 점수</span><span>SOS 상태</span><span>최근 응시</span><span>관리</span></div>
        {data.map((student) => <div className="table-row" key={student.name}><div className="student-name"><i>{student.name.slice(0,1)}</i><strong>{student.name}</strong></div><span>{student.school} · {student.grade}</span><b>{student.score}점</b><Status text={student.status}/><span>{student.last}</span><button className="link-button">상세 보기</button></div>)}
      </div>
    </section>
  </>;
}

function ComingSoon({ menu, title, onMove }: { menu: AdminMenu; title: string; onMove: (menu: AdminMenu) => void }) {
  const descriptions: Record<AdminMenu, string> = {
    dashboard: "", students: "", exams: "시험 생성, PDF 등록, 문항 좌표와 정답·배점을 관리하는 화면입니다.", problems: "훈련 문제를 단원·난이도·유형별로 등록하고 검색하는 화면입니다.", analysis: "AI가 생성한 문항 분석과 진단 결과를 검토하고 승인하는 화면입니다.", recommend: "학생별 공략문항·진단3·훈련10 추천을 검토하고 교체하는 화면입니다.", results: "시험 점수와 오답, SOS 훈련 결과 및 전체 이력을 조회하는 화면입니다.", settings: "학원 정보, 계정 권한, 기본 시험 설정을 관리하는 화면입니다."
  };
  return <section className="empty-page"><div className="empty-icon">{menus.find(m => m.id === menu)?.icon}</div><Pill>관리자 기능</Pill><h2>{title}</h2><p>{descriptions[menu]}</p><div><button className="primary-button">이 화면 개발 시작</button><button className="secondary-button" onClick={() => onMove("dashboard")}>대시보드로</button></div></section>;
}

function Stat({ icon, label, value, change, tone }: { icon: string; label: string; value: string; change: string; tone: string }) {
  return <article className="stat-card"><i className={tone}>{icon}</i><div><span>{label}</span><strong>{value}</strong><small>{change}</small></div></article>;
}
function Flow({ step, label, value, note, warn }: { step: string; label: string; value: string; note: string; warn?: boolean }) {
  return <div className="flow-card"><i>{step}</i><span>{label}</span><strong>{value}</strong><small className={warn ? "warn" : ""}>{note}</small></div>;
}
function Status({ text }: { text: string }) {
  const tone = text.includes("완료") || text === "분석완료" ? "green" : text.includes("진행") || text.includes("훈련") ? "blue" : text.includes("대기") || text.includes("작성") ? "orange" : "gray";
  return <Pill tone={tone}>{text}</Pill>;
}
function Activity({ icon, title, text, time }: { icon: string; title: string; text: string; time: string }) {
  return <div className="activity"><i>{icon}</i><div><strong>{title}</strong><span>{text}</span></div><small>{time}</small></div>;
}
