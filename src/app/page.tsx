"use client";

import { useMemo, useState } from "react";

type Mode = "admin" | "student";
type AdminMenu = "dashboard" | "students" | "mock" | "bank" | "analysis" | "recommend" | "history";
type StudentMenu = "home" | "mock" | "sos" | "result";

const adminMenus: { key: AdminMenu; label: string; icon: string }[] = [
  { key: "dashboard", label: "대시보드", icon: "⌂" },
  { key: "students", label: "학생 관리", icon: "◉" },
  { key: "mock", label: "실전 모의고사", icon: "▣" },
  { key: "bank", label: "훈련 문제은행", icon: "▤" },
  { key: "analysis", label: "AI 분석 관리", icon: "✦" },
  { key: "recommend", label: "SOS 추천", icon: "◎" },
  { key: "history", label: "결과 · 이력", icon: "↗" },
];

const studentMenus: { key: StudentMenu; label: string; icon: string }[] = [
  { key: "home", label: "대시보드", icon: "⌂" },
  { key: "mock", label: "실전 모의고사", icon: "▣" },
  { key: "sos", label: "SOS", icon: "✦" },
  { key: "result", label: "결과", icon: "↗" },
];

const students = [
  { name: "김민준", school: "보성고", grade: "고2", target: "1등급", score: 78, stage: "훈련 6/10", status: "진행중" },
  { name: "문예진", school: "잠실여고", grade: "고2", target: "2등급", score: 84, stage: "진단 완료", status: "승인대기" },
  { name: "김가연B", school: "영동일고", grade: "고1", target: "1등급", score: 92, stage: "이번주 완료", status: "완료" },
  { name: "송연우", school: "배명고", grade: "고1", target: "2등급", score: 71, stage: "공략문항 생성", status: "대기" },
  { name: "이서준", school: "정신여고", grade: "고2", target: "1등급", score: 88, stage: "훈련 10/10", status: "완료" },
];

const exams = [
  { title: "7월 실전 모의고사 A", date: "2026.07.27", students: 18, done: 12, questions: 28, status: "응시중" },
  { title: "7월 실전 모의고사 B", date: "2026.08.03", students: 21, done: 0, questions: 22, status: "예정" },
  { title: "6월 평가원 변형", date: "2026.07.20", students: 16, done: 16, questions: 30, status: "분석완료" },
];

const sosSteps = ["공략문항", "진단 3", "추가진단", "훈련 10", "추가훈련", "완료"];

export default function Home() {
  const [mode, setMode] = useState<Mode>("admin");
  const [adminMenu, setAdminMenu] = useState<AdminMenu>("dashboard");
  const [studentMenu, setStudentMenu] = useState<StudentMenu>("home");
  const [selectedStudent, setSelectedStudent] = useState(students[0]);
  const [sosStage, setSosStage] = useState(1);
  const [toast, setToast] = useState("");

  const title = useMemo(() => {
    if (mode === "admin") return adminMenus.find((m) => m.key === adminMenu)?.label ?? "대시보드";
    return studentMenus.find((m) => m.key === studentMenu)?.label ?? "대시보드";
  }, [mode, adminMenu, studentMenu]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">S</div>
          <div><strong>SOS</strong><span>Score Optimization System</span></div>
        </div>

        <div className="mode-switch">
          <button className={mode === "admin" ? "active" : ""} onClick={() => setMode("admin")}>관리자</button>
          <button className={mode === "student" ? "active" : ""} onClick={() => setMode("student")}>학생</button>
        </div>

        <nav>
          {(mode === "admin" ? adminMenus : studentMenus).map((item) => (
            <button
              key={item.key}
              className={`nav-item ${(mode === "admin" ? adminMenu : studentMenu) === item.key ? "active" : ""}`}
              onClick={() => mode === "admin" ? setAdminMenu(item.key as AdminMenu) : setStudentMenu(item.key as StudentMenu)}
            >
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="profile-dot">이</div>
          <div><strong>{mode === "admin" ? "이철용 원장" : "김민준 학생"}</strong><span>{mode === "admin" ? "관리자 데모" : "보성고 2학년"}</span></div>
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div><p className="eyebrow">SOS PILOT · DEMO</p><h1>{title}</h1><p>{mode === "admin" ? "실전 모의고사 결과를 분석해 학생별 공략 훈련을 설계합니다." : "이번 주 실전 결과를 바탕으로 나에게 필요한 훈련만 진행합니다."}</p></div>
          <div className="top-actions"><span className="live"><i />Supabase 연결</span><button className="ghost" onClick={() => showToast("데모 데이터가 새로고침되었습니다.")}>새로고침</button></div>
        </header>

        {mode === "admin" ? renderAdmin(adminMenu, selectedStudent, setSelectedStudent, showToast) : renderStudent(studentMenu, sosStage, setSosStage, showToast)}
      </section>
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}

function renderAdmin(menu: AdminMenu, selectedStudent: typeof students[0], setSelectedStudent: (s: typeof students[0]) => void, showToast: (m: string) => void) {
  if (menu === "dashboard") return <AdminDashboard showToast={showToast} />;
  if (menu === "students") return <StudentsPage selectedStudent={selectedStudent} setSelectedStudent={setSelectedStudent} showToast={showToast} />;
  if (menu === "mock") return <MockAdmin showToast={showToast} />;
  if (menu === "bank") return <BankPage showToast={showToast} />;
  if (menu === "analysis") return <AnalysisPage showToast={showToast} />;
  if (menu === "recommend") return <RecommendationPage showToast={showToast} />;
  return <HistoryPage />;
}

function AdminDashboard({ showToast }: { showToast: (m: string) => void }) {
  return <>
    <div className="hero admin-hero">
      <div><span className="pill">오늘의 운영 요약</span><h2>분석은 AI가, 결정은 선생님이.</h2><p>응시 결과와 훈련 문제은행을 연결해 학생별 SOS를 자동 설계합니다.</p></div>
      <button className="primary" onClick={() => showToast("새 실전 모의고사 등록 화면을 열었습니다.")}>+ 실전 모의고사 등록</button>
    </div>
    <div className="metric-grid four">
      <Metric label="운영 학생" value="24" note="이번 주 +3명" />
      <Metric label="예정 모의고사" value="2" note="가장 가까운 시험 D-3" />
      <Metric label="AI 분석 대기" value="186" note="문항 2개 오류 확인 필요" warn />
      <Metric label="SOS 진행률" value="68%" note="16명 진행 중" />
    </div>
    <div className="two-col wide-left">
      <Panel title="오늘 확인할 일" subtitle="AI가 선생님의 확인이 필요한 항목만 모았습니다.">
        <Task title="추천 승인 대기" desc="문예진 외 4명 · 공략문항 및 진단세트" badge="5건" />
        <Task title="OCR 확인 필요" desc="훈련 문제은행 2개 문항의 수식 인식 오류" badge="2건" danger />
        <Task title="모의고사 미응시" desc="7월 실전 모의고사 A · 6명" badge="6명" />
      </Panel>
      <Panel title="이번 주 SOS 현황" subtitle="학생별 현재 단계를 한눈에 확인합니다.">
        <div className="mini-students">{students.slice(0,4).map((s,i)=><div key={s.name}><span className="avatar">{s.name[0]}</span><div><strong>{s.name}</strong><small>{s.stage}</small></div><Progress value={[62,35,100,12][i]} /></div>)}</div>
      </Panel>
    </div>
    <Panel title="실전 모의고사 운영" subtitle="시험 업로드부터 분석 완료까지의 상태입니다.">
      <div className="exam-row header"><span>시험명</span><span>시험일</span><span>응시</span><span>문항</span><span>상태</span></div>
      {exams.map(e=><div className="exam-row" key={e.title}><strong>{e.title}</strong><span>{e.date}</span><span>{e.done}/{e.students}</span><span>{e.questions}</span><b className={`status ${e.status}`}>{e.status}</b></div>)}
    </Panel>
  </>;
}

function StudentsPage({ selectedStudent, setSelectedStudent, showToast }: { selectedStudent: typeof students[0]; setSelectedStudent:(s:typeof students[0])=>void; showToast:(m:string)=>void }) {
  return <div className="two-col student-layout">
    <Panel title="학생 목록" subtitle="학생을 선택하면 상세 분석을 확인할 수 있습니다." action={<button className="small-primary" onClick={()=>showToast("학생 등록 창을 열었습니다.")}>+ 학생 등록</button>}>
      <input className="search" placeholder="학생명, 학교 검색" />
      <div className="student-list">{students.map(s=><button key={s.name} className={selectedStudent.name===s.name?"selected":""} onClick={()=>setSelectedStudent(s)}><span className="avatar">{s.name[0]}</span><div><strong>{s.name}</strong><small>{s.school} · {s.grade}</small></div><b>{s.status}</b></button>)}</div>
    </Panel>
    <div className="stack">
      <Panel title={`${selectedStudent.name} 학생`} subtitle={`${selectedStudent.school} · ${selectedStudent.grade} · 목표 ${selectedStudent.target}`} action={<button className="ghost small" onClick={()=>showToast("학생 정보를 수정할 수 있습니다.")}>정보 수정</button>}>
        <div className="student-summary"><div><span>최근 점수</span><strong>{selectedStudent.score}</strong></div><div><span>최근 등급</span><strong>2</strong></div><div><span>SOS 단계</span><strong className="text-sm">{selectedStudent.stage}</strong></div><div><span>완료율</span><strong>74%</strong></div></div>
      </Panel>
      <Panel title="최근 분석" subtitle="실전 모의고사에서 발견된 우선 공략 영역입니다.">
        <div className="weak-grid"><Weak title="수열" score={38} desc="조건 해석"/><Weak title="미분" score={52} desc="그래프 추론"/><Weak title="확률" score={67} desc="경우 분류"/></div>
      </Panel>
      <Panel title="SOS 이력" subtitle="추천·진단·훈련 진행 기록입니다.">
        <Timeline />
      </Panel>
    </div>
  </div>;
}

function MockAdmin({ showToast }:{showToast:(m:string)=>void}) {
  return <>
    <div className="split-hero"><div><span className="pill">실전 모의고사</span><h2>시험지부터 결과 분석까지 한 흐름으로</h2><p>시험 PDF·정답·해설을 등록하고 응시 결과를 학생별 SOS로 연결합니다.</p></div><button className="primary" onClick={()=>showToast("모의고사 업로드를 시작합니다.")}>시험 파일 업로드</button></div>
    <div className="upload-grid">
      <UploadCard icon="01" title="시험지 PDF" desc="학생이 실제 응시할 모의고사 시험지" button="시험지 선택" onClick={()=>showToast("시험지 PDF 선택")}/>
      <UploadCard icon="02" title="정답 파일" desc="객관식·단답형 정답 데이터" button="정답 선택" onClick={()=>showToast("정답 파일 선택")}/>
      <UploadCard icon="03" title="해설 파일" desc="문항 이해와 AI 분석 정확도를 높입니다." button="해설 선택" onClick={()=>showToast("해설 파일 선택")}/>
    </div>
    <Panel title="등록된 실전 모의고사" subtitle="문항 수는 업로드 후 자동 인식됩니다.">
      <div className="exam-cards">{exams.map((e,i)=><article key={e.title}><div className="paper-icon">{i+1}</div><div><strong>{e.title}</strong><p>{e.date} · {e.questions}문항 · 응시 {e.done}/{e.students}</p></div><span className={`status ${e.status}`}>{e.status}</span><button className="ghost small" onClick={()=>showToast(`${e.title} 상세 화면`) }>상세보기</button></article>)}</div>
    </Panel>
  </>;
}

function BankPage({showToast}:{showToast:(m:string)=>void}) {
  return <>
    <div className="split-hero purple"><div><span className="pill">훈련 문제은행</span><h2>진단 3 · 훈련 10을 뽑아낼 문제 저장소</h2><p>문제집이나 자체 자료를 업로드하면 AI가 문항을 분리하고 분석 대기열에 등록합니다.</p></div><button className="primary" onClick={()=>showToast("훈련 문제 업로드 시작")}>훈련 문제 업로드</button></div>
    <div className="metric-grid four"><Metric label="등록 교재" value="12" note="이번 주 +2"/><Metric label="전체 문항" value="8,426" note="분석 완료 7,932"/><Metric label="추천 가능" value="7,811" note="중복 제외"/><Metric label="검수 필요" value="21" note="OCR·정답 확인" warn/></div>
    <Panel title="문제은행 자료" subtitle="평가용 모의고사와 분리된 훈련 전용 자료입니다.">
      <div className="bank-table"><div className="bank-head"><span>자료명</span><span>범위</span><span>문항</span><span>분석</span><span>상태</span></div>{[
        ["공통수학2 유형훈련 A","도형의 방정식","642","98%","추천 가능"],
        ["수학Ⅰ 준킬러 모음","수열·함수","380","100%","추천 가능"],
        ["미적분 실전 변형","미분·적분","516","74%","분석 중"],
        ["확률과 통계 자체교재","경우의 수·확률","284","31%","분석 중"],
      ].map(r=><div className="bank-row" key={r[0]}>{r.map((v,i)=><span key={i}>{v}</span>)}<button className="ghost small" onClick={()=>showToast(`${r[0]} 상세`) }>보기</button></div>)}</div>
    </Panel>
  </>;
}

function AnalysisPage({showToast}:{showToast:(m:string)=>void}) {
  return <>
    <div className="metric-grid four"><Metric label="분석 완료" value="8,104" note="96.2%"/><Metric label="분석 중" value="301" note="자동 처리 중"/><Metric label="확인 필요" value="21" note="수식·이미지 오류" warn/><Metric label="중복 후보" value="34" note="자동 병합 대기"/></div>
    <div className="two-col">
      <Panel title="AI 처리 대기열" subtitle="문항별 실제 처리 상태를 확인합니다.">
        {[["미적분 실전 변형","218/516",42],["확통 자체교재","88/284",31],["7월 실전 모의고사 B","0/22",4]].map(x=><div className="queue" key={String(x[0])}><div><strong>{x[0]}</strong><small>{x[1]} 문항 완료</small></div><Progress value={Number(x[2])}/></div>)}
      </Panel>
      <Panel title="품질 확인" subtitle="AI가 확신하지 못한 문항만 사람이 검토합니다.">
        <Task title="수식 OCR 불확실" desc="5개 문항 · 신뢰도 80% 미만" badge="확인" danger/>
        <Task title="정답 불일치" desc="정답 파일과 해설 추출 결과가 다른 문항" badge="2건"/>
        <Task title="중복 의심" desc="유사도 99% 이상 문제 묶음" badge="34건"/>
        <button className="primary full" onClick={()=>showToast("검수 화면을 열었습니다.")}>검수 시작</button>
      </Panel>
    </div>
  </>;
}

function RecommendationPage({showToast}:{showToast:(m:string)=>void}) {
  return <>
    <div className="split-hero green"><div><span className="pill">SOS 추천</span><h2>공략문항 → 진단 3 → 훈련 10</h2><p>AI가 최근 실전 결과를 분석하고, 선생님은 추천 내용을 확인한 뒤 승인합니다.</p></div><button className="primary" onClick={()=>showToast("추천을 일괄 승인했습니다.")}>선택 추천 승인</button></div>
    <div className="recommend-list">{students.slice(0,4).map((s,i)=><article key={s.name}><div className="recommend-head"><span className="avatar big">{s.name[0]}</span><div><strong>{s.name}</strong><p>{s.school} · 최근 {s.score}점</p></div><span className={`status ${i===1?"승인대기":"진행중"}`}>{i===1?"승인 대기":"추천 완료"}</span></div><div className="target-box"><span>공략문항</span><strong>7월 실전 A · { [18,21,13,27][i] }번</strong><p>{["수열의 조건 해석","함수 그래프 추론","확률의 경우 분류","도형의 좌표화"][i]}</p></div><div className="plan-strip"><b>진단 3</b><i>→</i><b>필요시 +3</b><i>→</i><b>훈련 10</b><i>→</i><b>필요시 +10</b></div><div className="card-actions"><button className="ghost" onClick={()=>showToast(`${s.name} 추천 상세`) }>상세 분석</button><button className="small-primary" onClick={()=>showToast(`${s.name} 추천 승인 완료`) }>승인</button></div></article>)}</div>
  </>;
}

function HistoryPage(){return <><div className="metric-grid four"><Metric label="평균 점수 변화" value="+7.4" note="최근 4주"/><Metric label="SOS 완료" value="83" note="누적 세션"/><Metric label="평균 완료율" value="86%" note="진단+훈련"/><Metric label="재오답 감소" value="31%" note="공략문항 기준"/></div><Panel title="학생 성장 현황" subtitle="최근 실전 모의고사와 SOS 완료 결과를 함께 봅니다."><div className="chart"><div className="chart-y"><span>100</span><span>80</span><span>60</span><span>40</span></div><div className="bars">{[62,68,71,78,84].map((v,i)=><div key={i}><span style={{height:`${v}%`}}><b>{v}</b></span><small>{i+1}주</small></div>)}</div></div></Panel></>}

function renderStudent(menu: StudentMenu, sosStage:number, setSosStage:(n:number)=>void, showToast:(m:string)=>void){
  if(menu==="home") return <StudentHome setSosStage={setSosStage}/>;
  if(menu==="mock") return <StudentMock showToast={showToast}/>;
  if(menu==="sos") return <StudentSos stage={sosStage} setStage={setSosStage} showToast={showToast}/>;
  return <StudentResult/>;
}

function StudentHome({setSosStage}:{setSosStage:(n:number)=>void}){return <>
  <div className="student-welcome"><div><span className="pill">김민준 학생</span><h2>이번 주도 한 문제씩 정확하게.</h2><p>실전 모의고사 결과를 바탕으로 이번 주 SOS가 준비되었습니다.</p></div><div className="level"><strong>LEVEL 7</strong><span>연속 완료 5주</span></div></div>
  <div className="student-grid"><article className="next-exam"><span>다음 실전 모의고사</span><strong>D-3</strong><h3>7월 실전 모의고사 B</h3><p>7월 27일 월요일 · 19:00</p><button className="ghost light">시험 안내 보기</button></article><article className="today-sos"><span>이번 주 SOS</span><h3>공략문항 18번</h3><p>수열의 조건 해석과 규칙 발견</p><div className="big-progress"><i style={{width:"42%"}}/></div><small>진단 진행 중 · 전체 42%</small><button className="primary" onClick={()=>setSosStage(1)}>SOS 이어하기</button></article></div>
  <div className="two-col"><Panel title="오늘 할 일" subtitle="순서대로 진행하면 약 35분이 걸립니다."><Task title="진단 3문항" desc="공략문항의 핵심 약점을 확인합니다." badge="10분"/><Task title="훈련 10문항" desc="유사 구조 문제로 풀이를 안정시킵니다." badge="25분"/></Panel><Panel title="최근 성장" subtitle="실전 점수가 꾸준히 올라가고 있습니다."><div className="growth"><strong>71 → 78 → 84</strong><span>최근 3회 +13점</span><Progress value={84}/></div></Panel></div>
  </>}

function StudentMock({showToast}:{showToast:(m:string)=>void}){return <><div className="student-mock-hero"><div><span>예정된 시험</span><h2>7월 실전 모의고사 B</h2><p>2026.07.27 · 제한시간 50분</p></div><strong>D-3</strong></div><div className="student-exam-list"><Panel title="응시 예정" subtitle="시험 시간이 되면 응시 버튼이 활성화됩니다."><div className="exam-ticket"><div><b>7월 실전 모의고사 B</b><span>수학 · 22문항 · 50분</span></div><button className="disabled">응시 전</button></div></Panel><Panel title="지난 시험" subtitle="결과와 분석을 다시 확인할 수 있습니다.">{exams.slice(0,2).map((e,i)=><div className="past-exam" key={e.title}><div><strong>{e.title}</strong><span>{e.date}</span></div><b>{[78,84][i]}점</b><button className="ghost small" onClick={()=>showToast("시험 결과 화면")}>결과 보기</button></div>)}</Panel></div></>}

function StudentSos({stage,setStage,showToast}:{stage:number;setStage:(n:number)=>void;showToast:(m:string)=>void}){
  type SosPhase = "target" | "diagnosis" | "training" | "complete";
  const [phase, setPhase] = useState<SosPhase>(stage >= 5 ? "complete" : stage >= 3 ? "training" : stage >= 1 ? "diagnosis" : "target");
  const [diagnosisIndex, setDiagnosisIndex] = useState(0);
  const [trainingIndex, setTrainingIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [diagnosisCorrect, setDiagnosisCorrect] = useState(0);
  const [trainingCorrect, setTrainingCorrect] = useState(0);

  const diagnosisProblems = [
    { no: 1, title: "조건을 식으로 바꾸기", prompt: "수열 {aₙ}이 aₙ₊₁ = 2aₙ - 3을 만족하고 a₁=4일 때 a₂의 값을 구하세요.", concept: "조건의 대수식 변환" },
    { no: 2, title: "두 조건 연결하기", prompt: "a₁+a₂=7, a₂+a₃=11일 때 a₃-a₁의 값을 구하세요.", concept: "연립 관계 파악" },
    { no: 3, title: "규칙 추론하기", prompt: "1, 4, 9, 16, …의 일반항으로 알맞은 것을 입력하세요.", concept: "규칙의 일반화" },
  ];

  const trainingProblems = Array.from({ length: 10 }, (_, i) => ({
    no: i + 1,
    title: i < 3 ? "조건 해석 훈련" : i < 7 ? "관계식 연결 훈련" : "실전 적용 훈련",
    prompt: `훈련 문제 ${i + 1}: 주어진 수열 조건을 식으로 정리한 뒤 요구하는 값을 구하세요.`,
    level: i < 3 ? "기초" : i < 7 ? "표준" : "실전",
  }));

  const totalUnits = 14;
  const completedUnits = phase === "target" ? 0 : phase === "diagnosis" ? 1 + diagnosisIndex : phase === "training" ? 4 + trainingIndex : totalUnits;
  const progress = Math.round((completedUnits / totalUnits) * 100);
  const currentProblem: any = phase === "diagnosis" ? diagnosisProblems[diagnosisIndex] : phase === "training" ? trainingProblems[trainingIndex] : null;

  function submitCurrent(){
    if(!answer.trim()){
      showToast("답안을 입력해 주세요.");
      return;
    }
    const correct = (phase === "diagnosis" ? diagnosisIndex : trainingIndex) % 4 !== 1;
    if(phase === "diagnosis"){
      setDiagnosisCorrect((v)=>v+(correct?1:0));
      if(diagnosisIndex < diagnosisProblems.length-1){
        setDiagnosisIndex((v)=>v+1);
        setAnswer("");
        showToast(correct ? "정답입니다. 다음 진단으로 이동합니다." : "풀이를 기록했습니다. 다음 진단으로 이동합니다.");
      }else{
        setPhase("training");
        setStage(3);
        setAnswer("");
        showToast("진단 완료 · AI가 훈련 10문항을 확정했습니다.");
      }
      return;
    }
    if(phase === "training"){
      setTrainingCorrect((v)=>v+(correct?1:0));
      if(trainingIndex < trainingProblems.length-1){
        setTrainingIndex((v)=>v+1);
        setAnswer("");
        showToast(correct ? "정답입니다." : "오답 원인을 기록했습니다.");
      }else{
        setPhase("complete");
        setStage(5);
        setAnswer("");
        showToast("이번 주 SOS를 완료했습니다.");
      }
    }
  }

  return <>
    <div className="sos-command">
      <div>
        <span className="pill">WEEKLY SOS · 김민준</span>
        <h2>실전 A 18번을 이번 주에 끝냅니다.</h2>
        <p>공략문항 확인부터 진단 3문항, 맞춤 훈련 10문항까지 이 화면에서 이어집니다.</p>
      </div>
      <div className="sos-scoreboard">
        <span>전체 진행률</span>
        <strong>{progress}%</strong>
        <small>예상 남은 시간 {phase === "complete" ? "0분" : phase === "training" ? `${Math.max(3, 25-trainingIndex*2)}분` : "35분"}</small>
      </div>
    </div>

    <div className="sos-flowbar">
      {[
        ["target","공략문항","실전 오답의 핵심"],
        ["diagnosis","진단 3","약점 원인 확인"],
        ["training","훈련 10","유사 구조 반복"],
        ["complete","완료","다음 모고에서 재확인"],
      ].map(([key,label,desc],i)=>{
        const order={target:0,diagnosis:1,training:2,complete:3};
        const active=order[phase as SosPhase];
        return <div key={key} className={i<active?"done":i===active?"current":""}>
          <i>{i<active?"✓":i+1}</i><span><b>{label}</b><small>{desc}</small></span>
        </div>
      })}
    </div>

    <div className="sos-focus-grid">
      <section className="sos-main-card">
        {phase === "target" && <>
          <div className="focus-label"><span>공략문항</span><b>7월 실전 모의고사 A · 18번</b></div>
          <div className="target-problem">
            <div className="target-number">18</div>
            <div><h3>수열의 조건 해석과 규칙 발견</h3><p>조건 (가), (나)를 각각 읽은 뒤 두 관계를 하나의 식으로 연결해야 하는 문항입니다.</p></div>
          </div>
          <div className="mock-problem-paper">
            <span>실전 모의고사 원문</span>
            <strong>수열 {`{aₙ}`}이 조건 (가), (나)를 만족할 때 a₁₀의 값을 구하여라.</strong>
            <p>(가) aₙ₊₂-aₙ₊₁ = aₙ₊₁-aₙ &nbsp;&nbsp; (나) a₁+a₄=14</p>
          </div>
          <div className="ai-diagnosis-grid">
            <article><span>AI가 찾은 막힘</span><strong>조건 연결 실패</strong><p>각 조건은 해석했지만 두 식을 동시에 사용하지 못했습니다.</p></article>
            <article><span>공략 개념</span><strong>등차수열 · 관계식</strong><p>조건을 수식으로 바꾸고 일반항으로 연결하는 연습이 필요합니다.</p></article>
            <article><span>이번 목표</span><strong>같은 구조 80% 이상</strong><p>진단과 훈련에서 동일 구조 문제를 안정적으로 해결합니다.</p></article>
          </div>
          <button className="primary sos-start" onClick={()=>{setPhase("diagnosis");setStage(1);}}>진단 3문항 시작</button>
        </>}

        {(phase === "diagnosis" || phase === "training") && currentProblem && <>
          <div className="focus-label">
            <span>{phase === "diagnosis" ? "DIAGNOSIS" : "TRAINING"}</span>
            <b>{phase === "diagnosis" ? `${diagnosisIndex+1} / 3` : `${trainingIndex+1} / 10`}</b>
          </div>
          <div className="question-title-row">
            <div><small>{phase === "diagnosis" ? currentProblem.concept : currentProblem.level}</small><h3>{currentProblem.title}</h3></div>
            <span className="timer">09:42</span>
          </div>
          <div className="live-problem">
            <span>문제</span>
            <strong>{currentProblem.prompt}</strong>
            <div className="formula-board">수식 · 도형 · 문제 이미지 표시 영역</div>
          </div>
          <div className="answer-panel">
            <label>답안 입력<input value={answer} onChange={(e)=>setAnswer(e.target.value)} placeholder="정답을 입력하세요" onKeyDown={(e)=>{if(e.key==="Enter")submitCurrent();}}/></label>
            <button className="primary" onClick={submitCurrent}>{phase === "diagnosis" && diagnosisIndex===2 ? "진단 제출" : phase === "training" && trainingIndex===9 ? "훈련 완료" : "제출하고 다음"}</button>
          </div>
          <div className="question-dots">
            {(phase === "diagnosis" ? diagnosisProblems : trainingProblems).map((_,i)=><i key={i} className={i < (phase === "diagnosis" ? diagnosisIndex : trainingIndex) ? "done" : i === (phase === "diagnosis" ? diagnosisIndex : trainingIndex) ? "current" : ""}>{i+1}</i>)}
          </div>
        </>}

        {phase === "complete" && <div className="sos-finish">
          <div className="finish-mark">✓</div>
          <span>WEEKLY SOS COMPLETE</span>
          <h3>이번 주 공략 훈련을 완료했습니다.</h3>
          <p>18번 유형은 다음 실전 모의고사에서 다시 확인합니다.</p>
          <div className="finish-metrics">
            <div><small>진단</small><strong>{Math.max(diagnosisCorrect,2)} / 3</strong></div>
            <div><small>훈련</small><strong>{Math.max(trainingCorrect,8)} / 10</strong></div>
            <div><small>학습 시간</small><strong>31분</strong></div>
            <div><small>약점 개선</small><strong>+34%</strong></div>
          </div>
          <button className="primary" onClick={()=>showToast("완료 리포트를 열었습니다.")}>완료 리포트 보기</button>
        </div>}
      </section>

      <aside className="sos-control-card">
        <div className="control-head"><span>이번 SOS</span><b>자동 저장 중</b></div>
        <div className="control-progress"><i style={{width:`${progress}%`}}/></div>
        <div className="control-stat"><span>공략문항</span><strong>실전 A · 18번</strong></div>
        <div className="control-stat"><span>핵심 약점</span><strong>조건 연결</strong></div>
        <div className="control-stat"><span>진단 결과</span><strong>{phase === "target" ? "대기" : `${Math.min(diagnosisIndex + (phase!=="diagnosis"?1:0),3)}/3 진행`}</strong></div>
        <div className="control-stat"><span>훈련 결과</span><strong>{phase === "training" || phase === "complete" ? `${phase==="complete"?10:trainingIndex}/10 진행` : "진단 후 결정"}</strong></div>
        <div className="ai-decision">
          <span>AI 결정</span>
          <strong>{phase === "target" ? "진단 필요" : phase === "diagnosis" ? "진단 중" : phase === "training" ? "추가 진단 없이 훈련 진행" : "다음 모의고사에서 재평가"}</strong>
          <p>{phase === "training" ? "핵심 개념 이해도가 기준을 넘어 훈련 10문항으로 이동했습니다." : "학생의 풀이 기록에 따라 다음 단계가 자동 조정됩니다."}</p>
        </div>
        {phase!=="target" && phase!=="complete" && <button className="ghost full" onClick={()=>showToast("현재 진행 상황이 저장되었습니다.")}>잠시 멈추기</button>}
      </aside>
    </div>
  </>;
}

function StudentResult(){return <><div className="result-hero"><div><span>최근 실전 모의고사</span><h2>84점 · 2등급</h2><p>이전 시험보다 6점 상승했습니다.</p></div><div className="ring"><strong>84</strong><span>/100</span></div></div><div className="metric-grid three"><Metric label="상위 비율" value="18%" note="응시자 18명 기준"/><Metric label="정답 문항" value="23" note="전체 28문항"/><Metric label="풀이 시간" value="47분" note="제한시간 50분"/></div><div className="two-col"><Panel title="단원별 분석" subtitle="공략 우선순위가 높은 순서입니다."><Weak title="수열" score={38} desc="집중 훈련 필요"/><Weak title="미분" score={64} desc="조금 더 안정화"/><Weak title="확률" score={81} desc="양호"/></Panel><Panel title="성적 변화" subtitle="최근 실전 모의고사 점수입니다."><div className="chart small-chart"><div className="bars">{[68,71,78,84].map((v,i)=><div key={i}><span style={{height:`${v}%`}}><b>{v}</b></span><small>{i+1}회</small></div>)}</div></div></Panel></div></>}

function Metric({label,value,note,warn}:{label:string;value:string;note:string;warn?:boolean}){return <article className={`metric ${warn?"warn":""}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>}
function Panel({title,subtitle,children,action}:{title:string;subtitle?:string;children:React.ReactNode;action?:React.ReactNode}){return <section className="panel"><div className="panel-head"><div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>{children}</section>}
function Progress({value}:{value:number}){return <div className="progress"><i style={{width:`${value}%`}}/></div>}
function Task({title,desc,badge,danger}:{title:string;desc:string;badge:string;danger?:boolean}){return <div className="task"><span className={danger?"task-icon danger":"task-icon"}>{danger?"!":"✓"}</span><div><strong>{title}</strong><p>{desc}</p></div><b className={danger?"danger":""}>{badge}</b></div>}
function Weak({title,score,desc}:{title:string;score:number;desc:string}){return <div className="weak"><div><strong>{title}</strong><span>{desc}</span></div><b>{score}%</b><Progress value={score}/></div>}
function Timeline(){return <div className="timeline">{[["오늘","훈련 6/10 진행","수열 조건 해석"],["7월 22일","진단 완료","정답 2/3"],["7월 21일","공략문항 생성","실전 A 18번"]].map(x=><div key={x[0]}><i/><span>{x[0]}</span><strong>{x[1]}</strong><small>{x[2]}</small></div>)}</div>}
function UploadCard({icon,title,desc,button,onClick}:{icon:string;title:string;desc:string;button:string;onClick:()=>void}){return <article className="upload-card"><span>{icon}</span><h3>{title}</h3><p>{desc}</p><button className="ghost" onClick={onClick}>{button}</button></article>}
