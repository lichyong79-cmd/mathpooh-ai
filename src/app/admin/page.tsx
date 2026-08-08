"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getSupabaseConfig } from "@/lib/supabase";
import { authHeaders, signedStorageUrl } from "@/lib/supabase/rest";
import AccountBox from "../AccountBox";
import "../exam-updates.css";
import ExamResultDiagnosis from "@/components/exam-result-diagnosis";
import MATHPOOHLoader from "@/components/math-pooh-loader";
import { buildDocumentAnchors } from "@/lib/crop/question-anchors";

type AdminMenu =
  | "dashboard"
  | "posters"
  | "students"
  | "applications"
  | "exam-list"
  | "exam-input"
  | "exam-analysis"
  | "exam-assignment"
  | "exam-progress"
  | "problem-sources"
  | "problem-analysis"
  | "sos-bank"
  | "sos-learning"
  | "exam-results"
  | "student-results"
  | "learning-analysis"
  | "settings";
type StudentStatus = "정상" | "휴원" | "퇴원";
type SosStatus = "분석완료" | "훈련중" | "진단대기" | "미응시";
type StudentTab = "students" | "registration";
type ExamRound = {
  id: number;
  name: string;
  date: string;
  grade: string;
  status: "등록중" | "마감";
};
type ExamStatus = "작성중" | "등록완료" | "마감";
type PracticeExam = {
  id: string;
  round: number;
  title: string;
  examCode: string;
  examDate: string;
  startAt: string;
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
  studentOpen?: boolean;
};

type ExamQuestionAnalysis = {
  exam_id: string;
  question_no: number;
  major_unit: string;
  middle_unit: string;
  minor_unit: string;
  detailed_topic: string;
  question_type: string;
  problem_types: string[];
  difficulty: number;
  confidence: number;
  analysis_version?: string;
  analysis_data?: {
    answer?: string;
    summary?: string;
    test_page_no?: number;
    solution_page_no?: number;
    test_bbox?: [number, number, number, number];
    solution_bbox?: [number, number, number, number];
  };
  updated_at?: string;
};

type ExamFileBundle = { test?: File; solution?: File; original?: File };
type Student = {
  id: string | number;
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
type MenuGroup = { label: string; icon?: string; items: MenuItem[] };

const menus: MenuItem[] = [
  { id: "dashboard", label: "대시보드", icon: "⌂" },
  { id: "posters", label: "포스터 관리", icon: "▧" },
  { id: "students", label: "학생정보 관리", icon: "♙" },
  { id: "applications", label: "신청 관리", icon: "✓" },
  { id: "exam-list", label: "시험지 목록", icon: "▤" },
  { id: "exam-input", label: "시험지 입력", icon: "+" },
  { id: "exam-analysis", label: "AI 분석", icon: "✦" },
  { id: "exam-assignment", label: "시험지 배정", icon: "↗" },
  { id: "exam-progress", label: "실전모의고사 진행", icon: "▶" },
  { id: "problem-sources", label: "문제등록", icon: "▦" },
  { id: "problem-analysis", label: "AI 분석", icon: "✦", badge: 12 },
  { id: "sos-bank", label: "SOS 문제은행", icon: "▣" },
  { id: "sos-learning", label: "SOS 학습운영", icon: "◎", badge: 7 },
  { id: "exam-results", label: "시험성적 분석", icon: "▥" },
  { id: "student-results", label: "학생성적 분석", icon: "↗" },
  { id: "learning-analysis", label: "학생학습 분석", icon: "◫" },
  { id: "settings", label: "환경 설정", icon: "⚙" },
];

const menuGroups: MenuGroup[] = [
  { label: "기본 운영", items: menus.filter((item) => ["dashboard", "posters", "students", "applications"].includes(item.id)) },
  { label: "실전모의고사 관리", icon: "▤", items: menus.filter((item) => ["exam-list", "exam-input", "exam-analysis", "exam-assignment"].includes(item.id)) },
  { label: "시험 운영", items: menus.filter((item) => item.id === "exam-progress") },
  { label: "문제은행 관리", icon: "▦", items: menus.filter((item) => ["problem-sources", "problem-analysis"].includes(item.id)) },
  { label: "SOS 운영", items: menus.filter((item) => ["sos-bank", "sos-learning"].includes(item.id)) },
  { label: "분석", items: menus.filter((item) => ["exam-results", "student-results", "learning-analysis"].includes(item.id)) },
];

const initialStudents: Student[] = [
  {
    id: 1,
    name: "김민준",
    school: "보성고",
    grade: "고2",
    phone: "010-2451-7812",
    parentPhone: "010-9345-1208",
    status: "정상",
    sosStatus: "분석완료",
    lastScore: 82,
    lastExam: "2026.07.24",
    joinedAt: "2026.03.02",
    memo: "미적분 준킬러 보완 필요",
  },
  {
    id: 2,
    name: "문예진",
    school: "잠실여고",
    grade: "고1",
    phone: "010-5287-1194",
    parentPhone: "010-7741-2506",
    status: "정상",
    sosStatus: "훈련중",
    lastScore: 76,
    lastExam: "2026.07.24",
    joinedAt: "2026.02.26",
    memo: "공통수학2 계산 속도 훈련 중",
  },
  {
    id: 3,
    name: "김가연B",
    school: "영동일고",
    grade: "고1",
    phone: "010-3198-4421",
    parentPhone: "010-8842-3190",
    status: "정상",
    sosStatus: "진단대기",
    lastScore: 68,
    lastExam: "2026.07.23",
    joinedAt: "2026.04.01",
    memo: "첫 진단 결과 확인 필요",
  },
  {
    id: 4,
    name: "송연우",
    school: "배명고",
    grade: "고2",
    phone: "010-6683-2071",
    parentPhone: "010-9210-6675",
    status: "정상",
    sosStatus: "분석완료",
    lastScore: 91,
    lastExam: "2026.07.22",
    joinedAt: "2025.12.18",
    memo: "상위권 실전 훈련 유지",
  },
  {
    id: 5,
    name: "이도윤",
    school: "정신여고",
    grade: "고3",
    phone: "010-4720-1386",
    parentPhone: "010-3165-8021",
    status: "휴원",
    sosStatus: "미응시",
    lastScore: null,
    lastExam: "-",
    joinedAt: "2026.01.08",
    memo: "8월 복귀 예정",
  },
  {
    id: 6,
    name: "박서준",
    school: "잠신고",
    grade: "중3",
    phone: "010-9074-5312",
    parentPhone: "010-2764-9160",
    status: "정상",
    sosStatus: "훈련중",
    lastScore: 88,
    lastExam: "2026.07.20",
    joinedAt: "2026.06.10",
    memo: "고등 선행 진단 진행",
  },
];

const examRounds: ExamRound[] = [
  {
    id: 1,
    name: "2026 SOS 1회",
    date: "2026.08.02",
    grade: "고1",
    status: "등록중",
  },
  {
    id: 2,
    name: "2026 SOS 2회",
    date: "2026.08.09",
    grade: "고2",
    status: "등록중",
  },
  {
    id: 3,
    name: "2026 SOS 3회",
    date: "2026.08.16",
    grade: "고3",
    status: "등록중",
  },
  {
    id: 4,
    name: "2026 SOS 4회",
    date: "2026.07.19",
    grade: "전체",
    status: "마감",
  },
];

// 실제 DB 시험만 화면과 배정 기능에서 사용합니다.
// 임시 demo-* ID는 UUID 컬럼에 저장할 수 없으므로 초기 예시 시험을 두지 않습니다.
const initialPracticeExams: PracticeExam[] = [];

const emptyStudent: Omit<Student, "id"> = {
  name: "",
  school: "",
  grade: "고1",
  phone: "",
  parentPhone: "",
  status: "정상",
  sosStatus: "진단대기",
  lastScore: null,
  lastExam: "-",
  joinedAt: new Date().toISOString().slice(0, 10),
  memo: "",
};

export default function Home() {
  const [active, setActive] = useState<AdminMenu>("students");
  const [collapsed, setCollapsed] = useState(false);

  const moveToMenu = useCallback((menu: AdminMenu, mode: "push" | "replace" = "push") => {
    setActive(menu);
    window.localStorage.setItem("matspu-admin-menu", menu);

    const url = new URL(window.location.href);
    url.searchParams.set("menu", menu);
    if (mode === "replace") window.history.replaceState({ menu }, "", url);
    else window.history.pushState({ menu }, "", url);
  }, []);

  useEffect(() => {
    const legacyMenu: Record<string, AdminMenu> = {
      exams: "exam-list",
      problems: "problem-sources",
      bank: "sos-bank",
      recommend: "sos-learning",
      results: "student-results",
    };
    const queryMenu = new URLSearchParams(window.location.search).get("menu");
    const stored = queryMenu || window.localStorage.getItem("matspu-admin-menu");
    if (stored === "analysis") {
      window.location.replace("/problem-bank/ai-upload");
      return;
    }
    const saved = (stored && legacyMenu[stored] ? legacyMenu[stored] : stored) as AdminMenu | null;
    if (saved && menus.some((menu) => menu.id === saved)) {
      moveToMenu(saved, "replace");
    } else {
      moveToMenu("students", "replace");
    }

    const handlePopState = () => {
      const menuFromUrl = new URLSearchParams(window.location.search).get("menu") as AdminMenu | null;
      if (menuFromUrl && menus.some((menu) => menu.id === menuFromUrl)) {
        setActive(menuFromUrl);
        window.localStorage.setItem("matspu-admin-menu", menuFromUrl);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [moveToMenu]);
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [practiceExams, setPracticeExams] =
    useState<PracticeExam[]>(initialPracticeExams);
  const [examFiles, setExamFiles] = useState<Record<string, ExamFileBundle>>(
    {},
  );

  useEffect(() => {
    fetch("/api/admin/students", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (response.ok && Array.isArray(result.students))
          setStudents(result.students);
      })
      .catch((error) => console.error("학생 목록 불러오기 실패", error));
  }, []);

  useEffect(() => {
    const config = getSupabaseConfig();
    if (!config) return;
    (async () => {
      try {
        const response = await fetch(
          `${config.url}/rest/v1/exams?select=*&order=round.asc`,
          {
            headers: { ...(await authHeaders()) },
            cache: "no-store",
          },
        );
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
          <div className="brand-symbol"><img src="/mathpooh-logo.png" alt="MATHPOOH" /></div>
          <div className="brand-copy">
            <strong><span>MATHPOOH</span><b>SOS</b></strong>
            <span>SCORE OPTIMIZATION SYSTEM</span>
          </div>
          <button
            className="collapse-button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label="사이드바 접기"
          >
            ‹
          </button>
        </div>
        <div className="workspace-card">
          <div className="workspace-logo"><img src="/mathpooh-logo.png" alt="" /></div>
          <div>
            <strong>MATHPOOH</strong>
            <span>관리자 워크스페이스</span>
          </div>
          <b>⌄</b>
        </div>
        <nav className="side-nav">
          {menuGroups.map((group) => (
            <section className={`side-nav-group ${group.items.length > 1 ? "nested" : ""}`} key={group.label}>
              <p>{group.icon ? <i>{group.icon}</i> : null}{group.label}</p>
              {group.items.map((menu) => (
              <button
                key={menu.id}
                className={active === menu.id ? "active" : ""}
                onClick={() => {
                  if (menu.id === "sos-bank") {
                    window.location.href = "/problem-bank";
                    return;
                  }
                  if (menu.id === "problem-analysis") {
                    window.localStorage.setItem(
                      "matspu-admin-menu",
                      "problem-sources",
                    );
                    window.location.href = "/problem-bank/ai-upload";
                    return;
                  }
                  moveToMenu(menu.id);
                }}
              >
                <i>{menu.icon}</i>
                <span>{menu.label}</span>
                {menu.badge ? <b>{menu.badge}</b> : null}
              </button>
              ))}
            </section>
          ))}
          <p className="system-title">시스템</p>
          {menus
            .filter((menu) => menu.id === "settings")
            .map((menu) => (
              <button
                key={menu.id}
                className={active === menu.id ? "active" : ""}
                onClick={() => moveToMenu(menu.id)}
              >
                <i>{menu.icon}</i>
                <span>{menu.label}</span>
              </button>
            ))}
        </nav>
        <AccountBox />
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <p>MATHPOOH SOS 관리자</p>
            <h1>{title}</h1>
          </div>
          <div className="top-actions">
            <button
              className="secondary-button"
              onClick={() => window.open("/student-login", "_blank")}
            >
              학생 로그인 화면
            </button>
            {["exam-list", "exam-input"].includes(active) ? (
              <button
                className="primary-button"
                onClick={() => moveToMenu("exam-input")}
              >
                ＋ 새 시험 만들기
              </button>
            ) : null}
          </div>
        </header>
        <div className="page-content">
          {active === "students" || active === "applications" ? (
            <StudentsPage key={active}
              initialTab={active === "applications" ? "registration" : "students"}
              students={students}
              setStudents={setStudents}
              exams={practiceExams}
            />
          ) : ["exam-list", "exam-input", "exam-analysis", "exam-assignment", "exam-progress", "exam-results"].includes(active) ? (
            <ExamsPage key={active}
              initialTab={active === "exam-input" ? "input" : active === "exam-analysis" ? "analysis" : active === "exam-assignment" ? "assignment" : active === "exam-progress" ? "monitor" : active === "exam-results" ? "monitor-results" : "list"}
              exams={practiceExams}
              setExams={setPracticeExams}
              examFiles={examFiles}
              setExamFiles={setExamFiles}
              students={students}
            />
          ) : active === "student-results" ? (
            <StudentResultsPage />
          ) : active === "learning-analysis" ? (
            <LearningAnalysisPage students={students} />
          ) : active === "posters" ? (
            <PostersPage />
          ) : active === "sos-learning" ? (
            <RecommendPage />
          ) : active === "problem-sources" ? (
            <ProblemsPage
              onOpenAnalysis={(sourceFileId) => {
                window.localStorage.setItem(
                  "matspu-analysis-source-id",
                  sourceFileId,
                );
                window.localStorage.setItem(
                  "matspu-admin-menu",
                  "problem-sources",
                );
                window.location.href = "/problem-bank/ai-upload";
              }}
            />
          ) : active === "dashboard" ? (
            <Dashboard students={students} onMove={moveToMenu} />
          ) : (
            <ComingSoon title={title} onMove={moveToMenu} />
          )}
        </div>
      </section>
    </main>
  );
}

type SitePoster = {
  id: string;
  title: string;
  image_url: string;
  link_url: string;
  is_published: boolean;
  sort_order: number;
};

function PostersPage() {
  const [posters, setPosters] = useState<SitePoster[]>([]);
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/posters", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "포스터를 불러오지 못했습니다.");
    setPosters(result.posters ?? []);
  }, []);

  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!image || !title.trim()) return setMessage("포스터 제목과 이미지를 넣어 주세요.");
    setBusy("포스터 업로드 중"); setMessage("");
    try {
      const form = new FormData();
      form.set("title", title.trim()); form.set("linkUrl", linkUrl.trim()); form.set("image", image); form.set("isPublished", "true"); form.set("sortOrder", "0");
      const response = await fetch("/api/admin/posters", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "등록하지 못했습니다.");
      setTitle(""); setLinkUrl(""); setImage(null); setMessage("학생 페이지에 포스터를 등록했습니다."); await load();
      const input = document.querySelector<HTMLInputElement>("#poster-image-input"); if (input) input.value = "";
    } catch (error) { setMessage(error instanceof Error ? error.message : "등록하지 못했습니다."); }
    finally { setBusy(""); }
  };

  const update = async (poster: SitePoster, changes: Partial<SitePoster>) => {
    setBusy("포스터 저장 중"); setMessage("");
    try {
      const next = { ...poster, ...changes };
      const response = await fetch("/api/admin/posters", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: next.id, title: next.title, linkUrl: next.link_url, isPublished: next.is_published, sortOrder: next.sort_order }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || "저장하지 못했습니다.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setBusy(""); }
  };

  const remove = async (poster: SitePoster) => {
    if (!window.confirm(`'${poster.title}' 포스터를 삭제할까요?\n학생 페이지에서도 즉시 사라집니다.`)) return;
    setBusy("포스터 삭제 중"); setMessage("");
    try { const response = await fetch(`/api/admin/posters?id=${encodeURIComponent(poster.id)}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) throw new Error(result.message || "삭제하지 못했습니다."); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "삭제하지 못했습니다."); }
    finally { setBusy(""); }
  };

  return <section className="poster-admin-page">
    {busy ? <div className="admin-busy"><div><b>{busy}</b><span>잠시 기다려 주세요.</span></div></div> : null}
    <div className="page-title-row"><div><h2>포스터 관리</h2><p>학생 홈에 노출할 MATHPOOH 프로그램·시험 안내 포스터를 관리합니다.</p></div></div>
    <form className="panel poster-upload-panel" onSubmit={upload}>
      <div className="poster-upload-copy"><small>MATHPOOH CONTENT</small><h3>새 포스터 등록</h3><p>가로형·세로형 이미지를 모두 사용할 수 있습니다. 최대 10MB</p></div>
      <label><span>포스터 제목 *</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: SOS 2회 실전모의고사 안내" /></label>
      <label><span>연결 주소</span><input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="선택사항" /></label>
      <label className="poster-file"><span>포스터 이미지 *</span><input id="poster-image-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /><b>{image?.name || "이미지 선택"}</b></label>
      <button className="primary-button" disabled={Boolean(busy)}>학생 페이지에 등록</button>
    </form>
    {message ? <div className="poster-message">{message}</div> : null}
    <div className="poster-admin-grid">
      {posters.map((poster) => <article className={`poster-admin-card ${poster.is_published ? "published" : "hidden"}`} key={poster.id}>
        <div className="poster-preview"><img src={poster.image_url} alt={poster.title} /></div>
        <div className="poster-card-body"><div><span className="poster-state">{poster.is_published ? "학생 공개 중" : "숨김"}</span><strong>{poster.title}</strong><small>{poster.link_url || "연결 주소 없음"}</small></div>
          <label>순서 <input type="number" value={poster.sort_order} onChange={(event) => setPosters((current) => current.map((item) => item.id === poster.id ? { ...item, sort_order: Number(event.target.value) } : item))} onBlur={(event) => void update(poster, { sort_order: Number(event.target.value) || 0 })} /></label>
          <div className="poster-card-actions"><button onClick={() => void update(poster, { is_published: !poster.is_published })}>{poster.is_published ? "학생에게 숨기기" : "학생에게 공개"}</button><button className="danger" onClick={() => void remove(poster)}>삭제</button></div>
        </div>
      </article>)}
      {!posters.length ? <div className="poster-empty"><b>등록된 포스터가 없습니다.</b><span>위에서 이미지를 등록하면 학생 홈에 바로 표시됩니다.</span></div> : null}
    </div>
  </section>;
}

function StudentsPage({
  initialTab = "students",
  students,
  setStudents,
  exams,
}: {
  initialTab?: StudentTab;
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  exams: PracticeExam[];
}) {
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("전체");
  const [status, setStatus] = useState("전체");
  const [selected, setSelected] = useState<Student | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [tab, setTab] = useState<StudentTab>(initialTab);
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [registeredIds, setRegisteredIds] = useState<(string | number)[]>([]);
  const [registrationBusy, setRegistrationBusy] = useState(false);

  useEffect(() => {
    setTab(initialTab);
    window.localStorage.setItem("matspu-student-tab", initialTab);
  }, [initialTab]);

  useEffect(() => {
    window.localStorage.setItem("matspu-student-tab", tab);
  }, [tab]);
  useEffect(() => {
    if (!selectedRoundId && exams[0]?.id) setSelectedRoundId(exams[0].id);
  }, [exams, selectedRoundId]);

  useEffect(() => {
    if (tab !== "registration" || !selectedRoundId) return;
    setRegistrationBusy(true);
    fetch(
      `/api/admin/exam-registrations?examId=${encodeURIComponent(selectedRoundId)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        setRegisteredIds(result.studentIds ?? []);
      })
      .catch((error) =>
        alert(
          error instanceof Error
            ? error.message
            : "등록 명단을 불러오지 못했습니다.",
        ),
      )
      .finally(() => setRegistrationBusy(false));
  }, [selectedRoundId, tab]);

  const filtered = useMemo(
    () =>
      students.filter((student) => {
        const keyword =
          `${student.name} ${student.school} ${student.phone} ${student.parentPhone}`.toLowerCase();
        return (
          keyword.includes(search.toLowerCase()) &&
          (grade === "전체" || student.grade === grade) &&
          (status === "전체" || student.status === status)
        );
      }),
    [students, search, grade, status],
  );

  const stats = {
    all: students.length,
    active: students.filter((s) => s.status === "정상").length,
    paused: students.filter((s) => s.status === "휴원").length,
    left: students.filter((s) => s.status === "퇴원").length,
  };

  const saveStudent = async (form: Omit<Student, "id">) => {
    if (editing) {
      const response = await fetch("/api/admin/students", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, id: editing.id }),
      });
      const result = await response.json();
      if (!response.ok) return alert(result.message || "학생 수정 실패");
      setStudents((prev) =>
        prev.map((s) => (s.id === editing.id ? result.student : s)),
      );
      setSelected((prev) => (prev?.id === editing.id ? result.student : prev));
      if (result.loginIdChanged) {
        alert(`전화번호와 학생 로그인 아이디가 함께 변경되었습니다.\n새 아이디: ${result.loginId}\n기존 비밀번호는 그대로입니다.`);
      }
    } else {
      const response = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) return alert(result.message || "학생 등록 실패");
      setStudents((prev) => [result.student, ...prev]);
      alert(
        `학생 계정 생성 완료\n아이디: ${result.loginId}\n초기 비밀번호: ${result.temporaryPassword}`,
      );
    }
    setEditing(null);
    setIsAdding(false);
  };

  const removeStudent = async (id: string | number) => {
    if (!window.confirm("이 학생을 목록에서 삭제할까요?")) return;
    const response = await fetch(
      `/api/admin/students?id=${encodeURIComponent(String(id))}`,
      { method: "DELETE" },
    );
    const result = await response.json();
    if (!response.ok) return alert(result.message || "학생 삭제 실패");
    setStudents((prev) => prev.filter((s) => s.id !== id));
    setSelected(null);
  };

  const selectedRound =
    exams.find((round) => round.id === selectedRoundId) ?? exams[0];
  const roundStudents = selectedRound
    ? students.filter((student) => student.status === "정상")
    : [];
  const registeredCount = registeredIds.filter((id) =>
    roundStudents.some((student) => String(student.id) === String(id)),
  ).length;
  const toggleRegistration = async (studentId: string | number) => {
    if (!selectedRound) return;
    const isRegistered = registeredIds.map(String).includes(String(studentId));
    setRegistrationBusy(true);
    const response = await fetch("/api/admin/exam-registrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        examId: selectedRound.id,
        studentId,
        registered: !isRegistered,
      }),
    });
    const result = await response.json();
    setRegistrationBusy(false);
    if (!response.ok)
      return alert(result.message || "등록 상태 변경에 실패했습니다.");
    setRegisteredIds((previous) =>
      isRegistered
        ? previous.filter((id) => String(id) !== String(studentId))
        : [...previous, studentId],
    );
  };
  const replaceRegistrations = async (studentIds: (string | number)[]) => {
    if (!selectedRound) return;
    const message = studentIds.length
      ? `${studentIds.length}명을 이 시험에 전체 등록할까요?`
      : "이 시험의 학생 등록을 모두 취소할까요?";
    if (!window.confirm(message)) return;
    setRegistrationBusy(true);
    const response = await fetch("/api/admin/exam-registrations", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ examId: selectedRound.id, studentIds }),
    });
    const result = await response.json();
    setRegistrationBusy(false);
    if (!response.ok)
      return alert(result.message || "전체 등록 변경에 실패했습니다.");
    setRegisteredIds(studentIds);
  };
  const registerAll = () =>
    void replaceRegistrations(roundStudents.map((student) => student.id));
  const clearAll = () => void replaceRegistrations([]);

  return (
    <>
      <section className="page-title-row">
        <div>
          <h2>학생정보 관리</h2>
          <p>학생 기본정보와 계정 상태를 관리합니다.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            setEditing(null);
            setIsAdding(true);
          }}
        >
          ＋ 학생 등록
        </button>
      </section>

      {tab === "students" ? (
        <>
          <section className="student-stat-grid">
            <MiniStat
              label="전체 학생"
              value={`${stats.all}명`}
              note="등록 기준"
            />
            <MiniStat
              label="재원 학생"
              value={`${stats.active}명`}
              note="정상 상태"
            />
            <MiniStat
              label="휴원 학생"
              value={`${stats.paused}명`}
              note="일시 중단"
              emphasis
            />
            <MiniStat
              label="퇴원 학생"
              value={`${stats.left}명`}
              note="퇴원 처리"
            />
          </section>

          <section className="panel student-panel">
            <div className="student-toolbar">
              <label className="global-search large">
                <span>⌕</span>
                <input
                  placeholder="학생 이름, 학교, 연락처 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option>전체</option>
                <option>중3</option>
                <option>고1</option>
                <option>고2</option>
                <option>고3</option>
              </select>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option>전체</option>
                <option>정상</option>
                <option>휴원</option>
                <option>퇴원</option>
              </select>
              <button
                className="secondary-button"
                onClick={() => {
                  setSearch("");
                  setGrade("전체");
                  setStatus("전체");
                }}
              >
                초기화
              </button>
            </div>
            <div className="list-summary">
              <strong>학생 {filtered.length}명</strong>
              <span>행을 클릭하면 학생 상세정보가 열립니다.</span>
            </div>
            <div className="data-table student-list">
              <div className="table-head">
                <span>학생</span>
                <span>학교 / 학년</span>
                <span>학생 연락처</span>
                <span>학부모 연락처</span>
                <span>재원 상태</span>
                <span>등록일</span>
                <span>관리</span>
              </div>
              {filtered.map((student) => (
                <div
                  className="table-row clickable"
                  key={student.id}
                  onClick={() => setSelected(student)}
                >
                  <div className="student-name">
                    <i>{student.name.slice(0, 1)}</i>
                    <div>
                      <strong>{student.name}</strong>
                      <small>등록 {student.joinedAt}</small>
                    </div>
                  </div>
                  <span>
                    {student.school} · {student.grade}
                  </span>
                  <span>{student.phone}</span>
                  <span>{student.parentPhone}</span>
                  <Status text={student.status} />
                  <span>{student.joinedAt}</span>
                  <button
                    className="more-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(student);
                    }}
                  >
                    수정
                  </button>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="empty-list">조건에 맞는 학생이 없습니다.</div>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="panel registration-panel">
          <div className="registration-header">
            <div>
              <span className="section-kicker">시험회차 선택</span>
              <select
                value={selectedRoundId}
                onChange={(e) => setSelectedRoundId(e.target.value)}
              >
                {exams.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.round}회 · {round.title} · {round.examDate} ·{" "}
                    {round.grade}
                  </option>
                ))}
              </select>
            </div>
            <div className="registration-actions">
              <button
                className="secondary-button"
                onClick={clearAll}
                disabled={
                  registrationBusy ||
                  !selectedRound ||
                  registeredIds.length === 0
                }
              >
                전체 미등록
              </button>
              <button
                className="primary-button"
                onClick={registerAll}
                disabled={
                  registrationBusy ||
                  !selectedRound ||
                  roundStudents.length === 0
                }
              >
                {registrationBusy
                  ? "처리 중..."
                  : roundStudents.length === 0
                    ? "등록 가능한 재원 학생 없음"
                    : `재원 학생 ${roundStudents.length}명 전체 등록`}
              </button>
            </div>
          </div>
          <div className="round-summary">
            <div>
              <span>시험 회차</span>
              <strong>
                {selectedRound
                  ? `${selectedRound.round}회 · ${selectedRound.title}`
                  : "등록된 시험 없음"}
              </strong>
            </div>
            <div>
              <span>시험일</span>
              <strong>{selectedRound?.examDate ?? "-"}</strong>
            </div>
            <div>
              <span>등록 기준</span>
              <strong>학년 제한 없음 · 학생별 지정</strong>
            </div>
            <div>
              <span>등록 현황</span>
              <strong>
                {registeredCount} / {roundStudents.length}명
              </strong>
            </div>
          </div>
          <div className="registration-progress">
            <i
              style={{
                width: `${roundStudents.length ? (registeredCount / roundStudents.length) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="data-table registration-list">
            <div className="table-head">
              <span>학생</span>
              <span>학교 / 학년</span>
              <span>학생 연락처</span>
              <span>학부모 연락처</span>
              <span>등록 여부</span>
              <span>변경</span>
            </div>
            {roundStudents.map((student) => {
              const isRegistered = registeredIds
                .map(String)
                .includes(String(student.id));
              return (
                <div className="table-row" key={student.id}>
                  <div className="student-name">
                    <i>{student.name.slice(0, 1)}</i>
                    <div>
                      <strong>{student.name}</strong>
                      <small>{student.school}</small>
                    </div>
                  </div>
                  <span>
                    {student.school} · {student.grade}
                  </span>
                  <span>{student.phone}</span>
                  <span>{student.parentPhone}</span>
                  <span
                    className={`registration-state ${isRegistered ? "registered" : "unregistered"}`}
                  >
                    {isRegistered ? "등록" : "미등록"}
                  </span>
                  <button
                    disabled={registrationBusy}
                    className={`toggle-register ${isRegistered ? "on" : ""}`}
                    onClick={() => void toggleRegistration(student.id)}
                  >
                    {isRegistered ? "등록 취소" : "등록하기"}
                  </button>
                </div>
              );
            })}
            {!selectedRound ? (
              <div className="empty-list">
                먼저 실전모의고사를 등록해 주세요.
              </div>
            ) : (
              roundStudents.length === 0 && (
                <div className="empty-list">
                  <strong>등록 가능한 재원 학생이 없습니다.</strong>
                  <br />
                  학생 목록에서 재원 상태를 확인해 주세요.
                </div>
              )
            )}
          </div>
        </section>
      )}

      {(isAdding || editing) && (
        <StudentModal
          initial={editing ?? emptyStudent}
          title={editing ? "학생 정보 수정" : "새 학생 등록"}
          onClose={() => {
            setIsAdding(false);
            setEditing(null);
          }}
          onSave={saveStudent}
        />
      )}
      {selected && (
        <StudentDrawer
          student={selected}
          onClose={() => setSelected(null)}
          onEdit={() => setEditing(selected)}
          onDelete={() => removeStudent(selected.id)}
        />
      )}
    </>
  );
}

function StudentModal({
  initial,
  title,
  onClose,
  onSave,
}: {
  initial: Student | Omit<Student, "id">;
  title: string;
  onClose: () => void;
  onSave: (student: Omit<Student, "id">) => void;
}) {
  const [form, setForm] = useState<Omit<Student, "id">>({
    name: initial.name,
    school: initial.school,
    grade: initial.grade,
    phone: initial.phone,
    parentPhone: initial.parentPhone,
    status: initial.status,
    sosStatus: initial.sosStatus,
    lastScore: initial.lastScore,
    lastExam: initial.lastExam,
    joinedAt: initial.joinedAt,
    memo: initial.memo,
  });
  const set = <K extends keyof Omit<Student, "id">>(
    key: K,
    value: Omit<Student, "id">[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.school.trim())
      return alert("학생 이름과 학교를 입력해 주세요.");
    onSave(form);
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="student-modal"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            <p>MATHPOOH SOS에서 사용할 학생 기본정보입니다.</p>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="form-grid">
          <Field label="학생 이름 *">
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="예: 김민준"
            />
          </Field>
          <Field label="학교 *">
            <input
              value={form.school}
              onChange={(e) => set("school", e.target.value)}
              placeholder="예: 보성고"
            />
          </Field>
          <Field label="학년">
            <select
              value={form.grade}
              onChange={(e) => set("grade", e.target.value)}
            >
              <option>중3</option>
              <option>고1</option>
              <option>고2</option>
              <option>고3</option>
            </select>
          </Field>
          <Field label="재원 상태">
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value as StudentStatus)}
            >
              <option>정상</option>
              <option>휴원</option>
              <option>퇴원</option>
            </select>
          </Field>
          <Field label="학생 연락처">
            <input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="010-0000-0000"
            />
          </Field>
          <Field label="학부모 연락처">
            <input
              value={form.parentPhone}
              onChange={(e) => set("parentPhone", e.target.value)}
              placeholder="010-0000-0000"
            />
          </Field>
          <Field label="등록일">
            <input
              type="date"
              value={form.joinedAt}
              onChange={(e) => set("joinedAt", e.target.value)}
            />
          </Field>
          <label className="field full">
            <span>관리 메모</span>
            <textarea
              value={form.memo}
              onChange={(e) => set("memo", e.target.value)}
              placeholder="학생 지도에 필요한 메모를 입력하세요."
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            취소
          </button>
          <button className="primary-button">저장</button>
        </div>
      </form>
    </div>
  );
}

function StudentDrawer({
  student,
  onClose,
  onEdit,
  onDelete,
}: {
  student: Student;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const resetPassword = async () => {
    if (
      !window.confirm(
        `${student.name} 학생의 비밀번호를 전화번호 뒤 4자리로 초기화할까요?`,
      )
    )
      return;
    const response = await fetch("/api/admin/students/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentId: student.id }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      return alert(result.message || "비밀번호 초기화에 실패했습니다.");
    alert(
      `초기화 완료\n아이디: ${result.loginId}\n초기 비밀번호: ${result.temporaryPassword}`,
    );
  };
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="student-drawer"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <span>학생 상세정보</span>
          <button onClick={onClose}>×</button>
        </div>
        <div className="student-profile">
          <i>{student.name.slice(0, 1)}</i>
          <div>
            <h3>{student.name}</h3>
            <p>
              {student.school} · {student.grade}
            </p>
          </div>
          <Status text={student.status} />
        </div>
        <div className="detail-section">
          <h4>기본 정보</h4>
          <Detail label="학생 연락처" value={student.phone || "-"} />
          <Detail label="학부모 연락처" value={student.parentPhone || "-"} />
          <Detail label="등록일" value={student.joinedAt} />
          <Detail label="재원 상태" value={student.status} />
        </div>
        <div className="detail-section">
          <h4>관리 메모</h4>
          <p className="memo-box">
            {student.memo || "등록된 메모가 없습니다."}
          </p>
        </div>
        <div className="drawer-actions">
          <button className="secondary-button danger" onClick={onDelete}>
            학생 삭제
          </button>
          <button
            className="secondary-button"
            onClick={() => void resetPassword()}
          >
            비밀번호 초기화
          </button>
          <button className="primary-button" onClick={onEdit}>
            정보 수정
          </button>
        </div>
      </aside>
    </div>
  );
}


function StudentResultsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedAttemptId, setSelectedAttemptId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/admin/student-performance", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "학생 성적을 불러오지 못했습니다.");
        if (!alive) return;
        const students = data.students ?? [];
        setRows(students);
        const first = students.find((item: any) => item.performance?.history?.length) ?? students[0];
        setSelectedStudentId(String(first?.id ?? ""));
        setSelectedAttemptId(String(first?.performance?.history?.[0]?.attemptId ?? ""));
      })
      .catch((error) => alert(error instanceof Error ? error.message : "학생 성적 조회 실패"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const filtered = rows.filter((student) => `${student.name} ${student.school} ${student.grade}`.toLowerCase().includes(search.toLowerCase()));
  const selectedStudent = rows.find((student) => String(student.id) === selectedStudentId) ?? filtered[0];
  const history = selectedStudent?.performance?.history ?? [];
  const selectedReport = history.find((item: any) => String(item.attemptId) === selectedAttemptId) ?? history[0];
  const sameExamScores = selectedReport
    ? rows.flatMap((student) => student.performance?.history ?? []).filter((item: any) => String(item.examId) === String(selectedReport.examId)).map((item: any) => Number(item.score ?? 0))
    : [];
  const participantCount = sameExamScores.length;
  const examAverage = participantCount ? Math.round(sameExamScores.reduce((sum, value) => sum + value, 0) / participantCount) : null;
  const examBest = participantCount ? Math.max(...sameExamScores) : null;
  const selectedRank = selectedReport && participantCount >= 20
    ? 1 + sameExamScores.filter((value) => value > Number(selectedReport.score ?? 0)).length
    : null;
  const scoreGap = selectedReport && examAverage !== null
    ? Number(selectedReport.score ?? 0) - examAverage
    : null;
  const subjectResults = selectedReport?.subjectResults ?? [];
  const strongestSubject = subjectResults.length
    ? [...subjectResults].sort((a: any, b: any) => b.rate - a.rate || b.correct - a.correct)[0]
    : null;
  const weakestSubject = subjectResults.length
    ? [...subjectResults].sort((a: any, b: any) => a.rate - b.rate || a.correct - b.correct)[0]
    : null;
  const difficultyResults = selectedReport
    ? [1, 2, 3, 4, 5].map((level) => {
        const items = selectedReport.questionResults.filter((item: any) => item.difficulty === level);
        const correct = items.filter((item: any) => item.correct).length;
        return { level, total: items.length, correct, rate: items.length ? Math.round(correct / items.length * 100) : null };
      }).filter((item) => item.total > 0)
    : [];
  const recommendedQuestions = selectedReport
    ? selectedReport.questionResults
        .filter((item: any) => !item.correct)
        .sort((a: any, b: any) => {
          const aDifficulty = a.difficulty ?? 99;
          const bDifficulty = b.difficulty ?? 99;
          return aDifficulty - bDifficulty || a.no - b.no;
        })
        .slice(0, 5)
    : [];
  const nationalEstimate = (() => {
    if (!selectedReport) return null;
    const weights: Record<number, number> = { 1: 1, 2: 1.15, 3: 1.35, 4: 1.65, 5: 2 };
    const questions = selectedReport.questionResults ?? [];
    const totalWeight = questions.reduce((sum: number, item: any) => sum + (weights[item.difficulty] ?? 1.2), 0);
    const earnedWeight = questions.reduce((sum: number, item: any) => sum + (item.correct ? (weights[item.difficulty] ?? 1.2) : 0), 0);
    const weightedMastery = totalWeight ? (earnedWeight / totalWeight) * 100 : Number(selectedReport.score ?? 0);
    const abilityIndex = Math.max(0, Math.min(100, Number(selectedReport.score ?? 0) * 0.62 + weightedMastery * 0.38));
    const percentile = Math.max(1, Math.min(99, Math.round(100 / (1 + Math.exp(-(abilityIndex - 55) / 12)))));
    const grade = percentile >= 96 ? 1 : percentile >= 89 ? 2 : percentile >= 77 ? 3 : percentile >= 60 ? 4 : percentile >= 40 ? 5 : percentile >= 23 ? 6 : percentile >= 11 ? 7 : percentile >= 4 ? 8 : 9;
    return { percentile, grade, topRate: Math.max(1, 100 - percentile), abilityIndex: Math.round(abilityIndex) };
  })();

  const selectStudent = (student: any) => {
    setSelectedStudentId(String(student.id));
    setSelectedAttemptId(String(student.performance?.history?.[0]?.attemptId ?? ""));
  };

  return <>
    <section className="page-title-row">
      <div><h2>학생성적 분석</h2><p>학생을 검색한 뒤 응시한 시험별 개인 성적표를 확인합니다.</p></div>
      <button className="secondary-button" onClick={() => window.print()}>성적표 인쇄</button>
    </section>
    <section className="student-report-layout">
      <aside className="panel student-report-search">
        <label className="global-search large"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="학생 이름·학교 검색" /></label>
        <div className="student-report-count">{loading ? "불러오는 중..." : `${filtered.length}명`}</div>
        <div className="student-report-students">
          {filtered.map((student) => <button key={student.id} className={String(student.id) === String(selectedStudent?.id) ? "selected" : ""} onClick={() => selectStudent(student)}>
            <i>{student.name.slice(0,1)}</i><span><strong>{student.name}</strong><small>{student.school} · {student.grade}</small></span><b>{student.performance?.summary?.latestScore === null ? "-" : `${student.performance?.summary?.latestScore}점`}</b>
          </button>)}
        </div>
      </aside>
      <div className="student-report-main">
        {selectedStudent ? <>
          <section className="panel student-report-profile">
            <div><span className="student-report-avatar">{selectedStudent.name.slice(0,1)}</span><div><h3>{selectedStudent.name}</h3><p>{selectedStudent.school} · {selectedStudent.grade}</p></div></div>
            <div><small>응시</small><b>{selectedStudent.performance?.summary?.examCount ?? 0}회</b></div>
            <div><small>평균</small><b>{selectedStudent.performance?.summary?.averageScore ?? "-"}점</b></div>
            <div><small>최고</small><b>{selectedStudent.performance?.summary?.bestScore ?? "-"}점</b></div>
          </section>
          <section className="panel student-report-exams">
            <div className="student-report-section-head"><div><h3>시험별 성적표</h3><p>시험을 선택하면 아래 성적표가 바뀝니다.</p></div></div>
            {history.length ? <div className="student-report-exam-list">{history.map((exam: any) => <button key={exam.attemptId} className={String(exam.attemptId) === String(selectedReport?.attemptId) ? "selected" : ""} onClick={() => setSelectedAttemptId(String(exam.attemptId))}>
              <span><strong>{exam.title}</strong><small>{exam.examDate || exam.submittedAt?.slice(0,10)}</small></span><b>{exam.score}점</b><em>{exam.correct}/{exam.questionCount}</em>
            </button>)}</div> : <div className="student-report-empty">제출한 시험이 없습니다.</div>}
          </section>
          {selectedReport ? <section className="panel official-score-report">
            <header><div><span>MATHPOOH SOS</span><h2>실전모의고사 성적표</h2><p>{selectedReport.title} · {selectedReport.examDate}</p></div><div className="official-score"><small>총점</small><strong>{selectedReport.score}</strong><span>점</span></div></header>
            <div className="official-score-summary seven-cells">
              <div><small>전국 예상등급</small><b>{nationalEstimate ? `${nationalEstimate.grade}등급` : "-"}</b></div>
              <div><small>전국 예상 백분위</small><b>{nationalEstimate ? nationalEstimate.percentile : "-"}</b></div>
              <div><small>전체 평균</small><b>{examAverage === null ? "-" : `${examAverage}점`}</b></div>
              <div><small>최고점</small><b>{examBest === null ? "-" : `${examBest}점`}</b></div>
              <div><small>응시 인원</small><b>{participantCount}명</b></div>
              <div><small>석차</small><b>{participantCount < 20 ? "미산출" : `${selectedRank}위`}</b></div>
              <div><small>채점</small><b>{selectedReport.scoreSource === "manual" ? "수동점수" : "자동채점"}</b></div>
            </div>
            <div className="national-estimate-card">
              <div className="national-estimate-copy">
                <span>전국단위 예상 위치</span>
                <strong>{nationalEstimate ? `백분위 ${nationalEstimate.percentile} · ${nationalEstimate.grade}등급` : "산출 불가"}</strong>
                <p>{nationalEstimate ? `전국 상위 약 ${nationalEstimate.topRate}% 수준으로 추정됩니다.` : "문항 분석 데이터가 부족합니다."}</p>
              </div>
              <div className="national-percentile-track" aria-label="전국 예상 백분위">
                <i><em style={{width:`${nationalEstimate?.percentile ?? 0}%`}} /></i>
                <div><span>0</span><b>{nationalEstimate?.percentile ?? "-"}</b><span>100</span></div>
              </div>
              <small>※ 총점과 문항 난이도를 이용한 모형 추정치이며, 공식 전국 응시 통계가 아닙니다.</small>
            </div>
            <div className="official-score-summary compact-counts">
              <div><small>정답</small><b>{selectedReport.correct}문항</b></div>
              <div><small>오답</small><b>{selectedReport.wrongNumbers.length}문항</b></div>
              <div><small>미응답</small><b>{selectedReport.unansweredNumbers.length}문항</b></div>
            </div>
            <div className="official-report-insights">
              <div className="insight-card primary"><small>평균 대비</small><b>{scoreGap === null ? "-" : `${scoreGap >= 0 ? "+" : ""}${scoreGap}점`}</b><p>{scoreGap === null ? "비교 데이터 없음" : scoreGap >= 0 ? "전체 평균보다 높습니다." : "평균까지 보완이 필요합니다."}</p></div>
              <div className="insight-card"><small>강점 영역</small><b>{strongestSubject?.label ?? "-"}</b><p>{strongestSubject ? `${strongestSubject.correct}/${strongestSubject.total} · ${strongestSubject.rate}%` : "영역 데이터 없음"}</p></div>
              <div className="insight-card warning"><small>우선 보완 영역</small><b>{weakestSubject?.label ?? "-"}</b><p>{weakestSubject ? `${weakestSubject.correct}/${weakestSubject.total} · ${weakestSubject.rate}%` : "영역 데이터 없음"}</p></div>
            </div>
            <div className="official-subject-grid">
              {selectedReport.subjectResults.length ? selectedReport.subjectResults.map((item: any) => <div key={item.label}><div><strong>{item.label}</strong><b>{item.correct}/{item.total}</b></div><i><em style={{width:`${item.rate}%`}} /></i><small>{item.rate}%</small></div>) : <p>영역별 분석 데이터가 없습니다.</p>}
            </div>
            <div className="official-difficulty-section">
              <div className="official-section-title"><div><h4>난이도별 성취</h4><p>문항 난이도에 따른 해결력을 확인합니다.</p></div></div>
              <div className="official-difficulty-grid">
                {difficultyResults.length ? difficultyResults.map((item: any) => <div key={item.level}><span>{item.level}단계</span><b>{item.correct}/{item.total}</b><i><em style={{width:`${item.rate ?? 0}%`}} /></i><small>{item.rate}%</small></div>) : <p>난이도 분석 데이터가 없습니다.</p>}
              </div>
            </div>
            <div className="official-answer-summary">
              <div><h4>오답 문항</h4><p>{selectedReport.wrongNumbers.length ? selectedReport.wrongNumbers.join(", ") : "없음"}</p></div>
              <div><h4>미응답 문항</h4><p>{selectedReport.unansweredNumbers.length ? selectedReport.unansweredNumbers.join(", ") : "없음"}</p></div>
            </div>
            <div className="official-recommend-section">
              <div className="official-section-title"><div><h4>우선 복습 추천 5문항</h4><p>오답·미응답 중 쉬운 문항부터 최대 5개를 제시합니다.</p></div></div>
              {recommendedQuestions.length ? <div className="official-recommend-list">{recommendedQuestions.map((item: any, index: number) => <div key={item.no}>
                <span className="recommend-order">{index + 1}</span>
                <b>{item.no}번</b>
                <div><strong>{item.unit || "단원 미분류"}</strong><small>{item.type || "유형 미분류"} · {item.subject}</small></div>
                <em>{item.difficulty ? `${item.difficulty}단계` : "난이도 미분류"}</em>
                <i className={item.unanswered ? "unanswered" : "wrong"}>{item.unanswered ? "미응답" : "오답"}</i>
              </div>)}</div> : <div className="official-perfect-message">추천할 오답 문항이 없습니다. 모든 문항을 해결했습니다.</div>}
            </div>
            <div className="official-section-title question-title"><div><h4>문항별 채점 결과</h4><p>학생 답안과 정답, 영역 정보를 함께 확인합니다.</p></div></div>
            <div className="official-question-grid">
              {selectedReport.questionResults.map((item: any) => <div key={item.no} className={item.correct ? "correct" : item.unanswered ? "unanswered" : "wrong"}><b>{item.no}</b><span>{item.correct ? "정답" : item.unanswered ? "미응답" : "오답"}</span><small>{item.subject}</small></div>)}
            </div>
            <div className="official-question-detail-table">
              <div className="detail-head"><span>문항</span><span>학생 답</span><span>정답</span><span>영역 / 단원</span><span>유형</span><span>난이도</span><span>결과</span></div>
              {selectedReport.questionResults.map((item: any) => <div key={item.no} className={item.correct ? "correct" : item.unanswered ? "unanswered" : "wrong"}>
                <b>{item.no}번</b><span>{item.answer || "-"}</span><span>{item.correctAnswer || "-"}</span><span><strong>{item.subject}</strong><small>{item.unit}</small></span><span>{item.type}</span><span>{item.difficulty ? `${item.difficulty}단계` : "-"}</span><em>{item.correct ? "정답" : item.unanswered ? "미응답" : "오답"}</em>
              </div>)}
            </div>
            <div className="mathpooh-report-comment"><h4>매쓰푸의 코멘트</h4><p>{selectedReport.mathpoohComment || "아직 등록된 코멘트가 없습니다."}</p></div>
            <footer><span>해설지 {selectedReport.solutionVisible ? "공개" : "비공개"}</span><small>응시 완료: {selectedReport.submittedAt ? new Date(selectedReport.submittedAt).toLocaleString("ko-KR") : "-"}</small></footer>
          </section> : null}
        </> : <section className="panel student-report-empty">검색된 학생이 없습니다.</section>}
      </div>
    </section>
  </>;
}

function LearningAnalysisPage({ students }: { students: Student[] }) {
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("전체");
  const [rows, setRows] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/admin/student-performance", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "학습 데이터를 불러오지 못했습니다.");
        if (!active) return;
        setRows(data.students ?? []);
        setSelectedId((current) => current || String(data.students?.[0]?.id ?? ""));
      })
      .catch((error) => alert(error instanceof Error ? error.message : "학습 분석 조회 실패"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) return setSessions([]);
    let active = true;
    fetch(`/api/admin/training-engine?studentId=${encodeURIComponent(selectedId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "SOS 운영 이력을 불러오지 못했습니다.");
        if (active) setSessions(data.sessions ?? []);
      })
      .catch(() => active && setSessions([]));
    return () => { active = false; };
  }, [selectedId]);

  const filtered = rows.filter((student) =>
    `${student.name} ${student.school}`.toLowerCase().includes(search.toLowerCase()) &&
    (grade === "전체" || student.grade === grade),
  );
  const selected = rows.find((student) => String(student.id) === selectedId) ?? filtered[0];
  const summary = selected?.performance?.summary ?? {};
  const history = selected?.performance?.history ?? [];
  const diagnosisSessions = sessions.filter((session) => session.phase === "DIAGNOSIS");
  const trainingSessions = sessions.filter((session) => session.phase === "TRAINING");
  const completedDiagnosisItems = diagnosisSessions.flatMap((session) => session.sos_training_items ?? []);
  const completedTrainingItems = trainingSessions.flatMap((session) => session.sos_training_items ?? []);
  const diagnosisAnswered = completedDiagnosisItems.filter((item: any) => item.is_correct !== null && item.is_correct !== undefined);
  const trainingAnswered = completedTrainingItems.filter((item: any) => item.is_correct !== null && item.is_correct !== undefined);
  const diagnosisRate = diagnosisAnswered.length ? Math.round(diagnosisAnswered.filter((item: any) => item.is_correct).length / diagnosisAnswered.length * 100) : null;
  const trainingRate = trainingAnswered.length ? Math.round(trainingAnswered.filter((item: any) => item.is_correct).length / trainingAnswered.length * 100) : null;
  const latestSubjects = history[0]?.subjectResults ?? [];
  const completionRows = latestSubjects.length ? latestSubjects : (selected?.performance?.units ?? []).slice(0, 6);
  const improvement = history.length > 1 ? Number(history[0].score ?? 0) - Number(history[history.length - 1].score ?? 0) : null;
  const latestSession = sessions[0];

  return <>
    <section className="page-title-row">
      <div><h2>학생학습 분석</h2><p>학생의 전략·과정·성과를 장기적으로 확인합니다.</p></div>
    </section>
    <section className="student-learning-layout">
      <aside className="panel student-learning-search">
        <label className="global-search large"><span>⌕</span><input placeholder="학생 이름·학교 검색" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <select value={grade} onChange={(event) => setGrade(event.target.value)}><option>전체</option><option>중3</option><option>고1</option><option>고2</option><option>고3</option></select>
        <div className="student-report-count">{loading ? "불러오는 중..." : `${filtered.length}명`}</div>
        <div className="student-report-students">{filtered.map((student) => <button key={student.id} className={String(student.id) === String(selected?.id) ? "selected" : ""} onClick={() => setSelectedId(String(student.id))}><i>{student.name.slice(0,1)}</i><span><strong>{student.name}</strong><small>{student.school} · {student.grade}</small></span><b>{student.performance?.summary?.latestScore === null ? "-" : `${student.performance?.summary?.latestScore}점`}</b></button>)}</div>
      </aside>
      <div className="student-learning-main">
        {selected ? <>
          <section className="panel learning-hero"><div><span className="student-report-avatar">{selected.name.slice(0,1)}</span><div><h3>{selected.name}</h3><p>{selected.school} · {selected.grade}</p></div></div><div><small>최근 점수</small><b>{summary.latestScore ?? "-"}점</b></div><div><small>누적 응시</small><b>{summary.examCount ?? 0}회</b></div><div><small>첫 시험 대비</small><b>{improvement === null ? "-" : `${improvement >= 0 ? "+" : ""}${improvement}점`}</b></div></section>

          <section className="learning-three-columns">
            <div className="panel learning-card strategy"><span>STRATEGY</span><h3>현재 전략</h3><strong>{latestSession ? (latestSession.phase === "DIAGNOSIS" ? `진단 ${latestSession.round_no ?? 1}차 진행` : "훈련 10문항 진행") : "SOS 전략 설정 전"}</strong><p>{latestSession?.target_snapshot?.units?.map((item: any) => item.label).filter(Boolean).join(" · ") || "시험 결과를 바탕으로 공략 단원을 정합니다."}</p></div>
            <div className="panel learning-card process"><span>PROCESS</span><h3>학습 과정</h3><strong>진단 {diagnosisSessions.length}회 · 훈련 {trainingSessions.length}회</strong><p>진단 3문항 → 훈련 10문항 → 추가훈련 여부를 누적 관리합니다.</p></div>
            <div className="panel learning-card achievement"><span>ACHIEVEMENT</span><h3>현재 성과</h3><strong>{trainingRate === null ? "성과 집계 전" : `훈련 정답률 ${trainingRate}%`}</strong><p>{improvement === null ? "두 번 이상 시험을 응시하면 득점 전환을 확인합니다." : `첫 시험 대비 ${improvement >= 0 ? "+" : ""}${improvement}점 변화`}</p></div>
          </section>

          <section className="panel learning-process-panel"><div className="student-report-section-head"><h3>진단·훈련 과정</h3><p>3문항 진단과 10문항 훈련의 누적 진행 현황입니다.</p></div><div className="learning-process-stats"><div><small>진단 횟수</small><b>{diagnosisSessions.length}회</b><span>{diagnosisRate === null ? "채점 전" : `정답률 ${diagnosisRate}%`}</span></div><div><small>훈련 횟수</small><b>{trainingSessions.length}회</b><span>{trainingRate === null ? "채점 전" : `정답률 ${trainingRate}%`}</span></div><div><small>추가 진단</small><b>{Math.max(0, diagnosisSessions.length - 1)}회</b><span>경계 수준 재확인</span></div><div><small>최근 상태</small><b>{latestSession?.status ?? "미진행"}</b><span>{latestSession ? new Date(latestSession.created_at).toLocaleDateString("ko-KR") : "-"}</span></div></div></section>

          <section className="panel learning-completion-panel"><div className="student-report-section-head"><h3>과목·단원 완성도</h3><p>최근 시험과 누적 정오 데이터를 기준으로 표시합니다.</p></div><div className="learning-completion-grid">{completionRows.length ? completionRows.map((item: any) => <div key={item.label}><div><strong>{item.label}</strong><b>{item.rate}%</b></div><i><em style={{ width: `${item.rate}%` }} /></i><small>{item.correct}/{item.total}문항</small></div>) : <p>완성도 데이터가 아직 없습니다.</p>}</div></section>

          <section className="panel learning-trend-panel"><div className="student-report-section-head"><h3>모의고사 득점 변화</h3><p>SOS 학습이 실제 시험 점수로 전환되는지 확인합니다.</p></div>{history.length ? <div className="learning-score-trend">{[...history].reverse().map((item: any, index: number) => <div key={item.attemptId}><span>{item.examDate || `${index + 1}회`}</span><i><em style={{ height: `${Math.max(8, Math.min(100, item.score))}%` }} /></i><b>{item.score}점</b><small>{item.title}</small></div>)}</div> : <p>제출한 시험이 없습니다.</p>}</section>

          <section className="panel next-strategy-panel"><div><span>다음 추천 전략</span><h3>{trainingRate !== null && trainingRate >= 80 ? "다음 모의고사에서 득점 전환을 검증하세요." : diagnosisSessions.length ? "진단 결과에 맞춘 훈련 10문항을 완료하세요." : "취약 문항을 선택하고 진단 3문항부터 시작하세요."}</h3><p>세부 배정과 피드백은 SOS학습운영에서 진행합니다.</p></div></section>
        </> : <section className="panel student-report-empty">검색된 학생이 없습니다.</section>}
      </div>
    </section>
  </>;
}

function RecommendPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [problemCount, setProblemCount] = useState(0);
  const [sessions, setSessions] = useState<any[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/recommendations", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "추천 데이터를 불러오지 못했습니다.");
      setRows(data.students ?? []);
      setProblemCount(Number(data.problemCount ?? 0));
      setSelectedId((value) => value || String(data.students?.[0]?.id ?? ""));
    } catch (error) { alert(error instanceof Error ? error.message : "추천 조회 실패"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const selected = rows.find((item) => String(item.id) === selectedId) ?? rows[0];
  useEffect(() => { setChecked([]); }, [selectedId]);
  const loadSessions = useCallback(async (studentId: string) => {
    if (!studentId) return setSessions([]);
    const response = await fetch(`/api/admin/training-engine?studentId=${encodeURIComponent(studentId)}`, { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setSessions(data.sessions ?? []);
  }, []);
  useEffect(() => { void loadSessions(selectedId); }, [selectedId, loadSessions]);
  const generate = async (action: "generate-diagnosis" | "additional-diagnosis" | "generate-training") => {
    if (!selected) return;
    const latestDiagnosis = sessions.find((item) => item.phase === "DIAGNOSIS");
    let diagnosticCorrect = 0;
    if (action === "generate-training") {
      if (!latestDiagnosis) return alert("먼저 진단 3문항을 생성해 주세요.");
      const value = window.prompt("가장 최근 진단의 정답 수를 입력하세요. (0~3)", String(latestDiagnosis.correct_count ?? 0));
      if (value === null) return;
      diagnosticCorrect = Math.max(0, Math.min(3, Number(value)));
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/training-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, studentId: selected.id, parentSessionId: latestDiagnosis?.id, diagnosticCorrect, target: { units: selected.weakUnits, types: selected.weakTypes } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "문항 생성 실패");
      await loadSessions(String(selected.id));
      alert(action === "generate-training" ? "훈련 10문항을 생성했습니다." : action === "additional-diagnosis" ? "중복 없는 추가 진단 3문항을 생성했습니다." : "진단 3문항을 생성했습니다.");
    } catch (error) { alert(error instanceof Error ? error.message : "문항 생성 실패"); }
    finally { setSaving(false); }
  };
  const save = async (assign: boolean) => {
    if (!selected || !checked.length) return alert("추천할 문항을 선택해 주세요.");
    setSaving(true);
    try {
      const response = await fetch("/api/admin/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: selected.id, problemIds: checked, assign, weakness: { units: selected.weakUnits, types: selected.weakTypes } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "추천 저장 실패");
      alert(assign ? "학생에게 훈련을 배정했습니다." : "추천안을 저장했습니다.");
    } catch (error) { alert(error instanceof Error ? error.message : "추천 저장 실패"); }
    finally { setSaving(false); }
  };
  return <>
    <section className="page-title-row"><div><h2>SOS 학습운영</h2><p>실전모의고사 결과에서 취약점을 찾아 진단 3문항과 훈련 10문항을 운영합니다.</p></div><button className="secondary-button" onClick={() => void load()}>새로고침</button></section>
    <section className="student-stat-grid"><MiniStat label="운영 대상" value={`${rows.length}명`} note="제출 완료 학생" /><MiniStat label="훈련 문항" value={`${problemCount}문항`} note="문제은행 ACTIVE" /><MiniStat label="매칭 가능" value={`${rows.filter((item) => item.candidates.length).length}명`} note="후보 1개 이상" emphasis /><MiniStat label="문항 부족" value={`${rows.filter((item) => item.performance.summary.examCount && !item.candidates.length).length}명`} note="추가 등록 필요" /></section>
    <section className="panel recommendation-layout">
      <aside className="recommendation-students"><h3>학생별 SOS 대상</h3>{loading ? <p>불러오는 중...</p> : rows.map((item) => <button key={item.id} className={String(item.id) === String(selected?.id) ? "selected" : ""} onClick={() => setSelectedId(String(item.id))}><strong>{item.name}</strong><span>{item.latestExam?.title || `${item.performance.summary.examCount}회 응시`} · {item.performance.summary.latestScore ?? "-"}점</span><small>오답·미응답 {item.missedCount ?? 0}문항 · {item.weakUnits[0]?.label || "취약 단원 분석 전"}</small></button>)}</aside>
      <div className="recommendation-main">{selected ? <><div className="sos-source-summary"><span>분석 원본</span><strong>{selected.latestExam?.title || "최근 실전모의고사"}</strong><b>{selected.performance.summary.latestScore ?? "-"}점 · 오답/미응답 {selected.missedCount ?? 0}문항</b><small>시험 결과 → 취약점 → 진단 3문항 → 훈련 10문항</small></div><div className="recommendation-head"><div><h3>{selected.name} 훈련 후보</h3><p>취약 단원: {selected.weakUnits.map((item: any) => `${item.label} ${item.rate}%`).join(" · ") || "없음"}</p><p>취약 유형: {selected.weakTypes.map((item: any) => `${item.label} ${item.rate}%`).join(" · ") || "없음"}</p></div><div className="engine-actions"><button className="diagnosis-button" disabled={saving} onClick={() => void generate("generate-diagnosis")}>진단 3문항</button><button className="diagnosis-more-button" disabled={saving || !sessions.some((item) => item.phase === "DIAGNOSIS")} onClick={() => void generate("additional-diagnosis")}>추가 진단 3문항</button><button className="training-button" disabled={saving || !sessions.some((item) => item.phase === "DIAGNOSIS")} onClick={() => void generate("generate-training")}>훈련 10문항</button></div></div><div className="training-session-summary"><b>진단·훈련 생성 이력</b>{sessions.length ? sessions.map((session) => <span key={session.id} className={session.phase === "DIAGNOSIS" ? "diagnosis" : "training"}>{session.phase === "DIAGNOSIS" ? `진단 ${session.round_no}차 · 3문항` : "훈련 · 10문항"} · {session.status}</span>) : <span>아직 생성된 문항이 없습니다.</span>}</div>{selected.candidates.length ? <div className="recommendation-candidates">{selected.candidates.map((problem: any) => <label key={problem.id}><input type="checkbox" checked={checked.includes(problem.id)} onChange={(event) => setChecked((current) => event.target.checked ? [...current, problem.id] : current.filter((id) => id !== problem.id))} /><div><strong>{problem.problem_code || problem.title}</strong><span>{problem.unit} · {problem.topic} · {problem.difficulty}단계</span><small>{problem.reasons.join(" / ")} · 매칭 {problem.matchScore}점</small></div></label>)}</div> : <div className="recommendation-empty"><b>현재 매칭되는 훈련 문항이 없습니다.</b><p>문제은행에 취약 단원·유형 문항을 등록하면 이곳에 자동으로 나타납니다.</p><button className="primary-button" onClick={() => { window.location.href = "/problem-bank/ai-upload"; }}>훈련 문항 등록하기</button></div>}</> : <div className="recommendation-empty"><b>학생 데이터가 없습니다.</b></div>}</div>
    </section>
  </>;
}

function examFromRow(row: any): PracticeExam {
  const startAt = row.open_at
    ? new Date(row.open_at)
        .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
        .slice(0, 16)
    : "";
  return {
    id: String(row.id),
    round: Number(row.round ?? 1),
    title: row.title ?? "",
    examCode: row.exam_code ?? "",
    examDate: row.exam_date ?? "",
    startAt,
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
    answers: Array.isArray(row.answer_keys)
      ? row.answer_keys.map(String)
      : Array(Number(row.question_count ?? 30)).fill(""),
    testFilePath: row.test_file_path ?? "",
    solutionFilePath: row.solution_file_path ?? "",
    originalFilePath: row.original_file_path ?? "",
    memo: row.memo ?? "",
    answerVerified: Boolean(row.answer_verified),
    coverVerified: Boolean(row.cover_verified),
    regionVerified: Boolean(row.region_verified),
    studentOpen: Boolean(row.student_open),
  };
}

function examToRow(
  exam: Omit<PracticeExam, "id">,
  paths: {
    testFilePath?: string;
    solutionFilePath?: string;
    originalFilePath?: string;
  },
) {
  return {
    round: exam.round,
    title: exam.title,
    exam_code: exam.examCode,
    exam_date: exam.examDate,
    open_at: exam.startAt ? new Date(exam.startAt).toISOString() : null,
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
    student_open: Boolean(exam.studentOpen),
    test_file_path: paths.testFilePath ?? exam.testFilePath ?? "",
    solution_file_path: paths.solutionFilePath ?? exam.solutionFilePath ?? "",
    original_file_path: paths.originalFilePath ?? exam.originalFilePath ?? "",
    memo: exam.memo,
  };
}

// exam-files 버킷은 비공개입니다. 공개 URL 대신 만료되는 서명 URL을 만듭니다.
async function storageFileUrl(path?: string) {
  if (!path) return "";
  return await signedStorageUrl("exam-files", path);
}

async function uploadExamFile(
  examId: string,
  kind: "test" | "solution" | "original",
  file: File,
) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${examId}/${kind}-${Date.now()}-${safeName}`;
  const response = await fetch(
    `${config.url}/storage/v1/object/exam-files/${path}`,
    {
      method: "POST",
      headers: {
        ...(await authHeaders()),
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true",
      },
      body: file,
    },
  );
  if (!response.ok) throw new Error(await response.text());
  return path;
}

function ExamAssignmentPanel({
  exams,
  students,
}: {
  exams: PracticeExam[];
  students: Student[];
}) {
  const [selectedExamId, setSelectedExamId] = useState(exams[0]?.id ?? "");
  const [assignedIds, setAssignedIds] = useState<(string | number)[]>([]);
  const [requestedIds, setRequestedIds] = useState<(string | number)[]>([]);
  const [statusByStudent, setStatusByStudent] = useState<
    Record<string, string>
  >({});
  const [busy, setBusy] = useState(false);
  const selectedExam =
    exams.find((exam) => exam.id === selectedExamId) ?? exams[0];
  const availableStudents = students.filter(
    (student) => student.status === "정상",
  );
  const assignedCount = assignedIds.filter((id) =>
    availableStudents.some((student) => String(student.id) === String(id)),
  ).length;

  useEffect(() => {
    if (!selectedExamId && exams[0]?.id) setSelectedExamId(exams[0].id);
  }, [exams, selectedExamId]);

  useEffect(() => {
    if (!selectedExamId) return;
    setBusy(true);
    fetch(
      `/api/admin/exam-registrations?examId=${encodeURIComponent(selectedExamId)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        setAssignedIds(result.studentIds ?? []);
        setRequestedIds(result.requestedStudentIds ?? []);
        setStatusByStudent(
          Object.fromEntries(
            (result.registrations ?? []).map(
              (item: { student_id: string; status: string }) => [
                String(item.student_id),
                item.status,
              ],
            ),
          ),
        );
      })
      .catch((error) =>
        alert(
          error instanceof Error
            ? error.message
            : "시험 배정 명단을 불러오지 못했습니다.",
        ),
      )
      .finally(() => setBusy(false));
  }, [selectedExamId]);

  const toggleAssignment = async (studentId: string | number) => {
    if (!selectedExam) return;
    const assigned = assignedIds.map(String).includes(String(studentId));
    setBusy(true);
    const response = await fetch("/api/admin/exam-registrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        examId: selectedExam.id,
        studentId,
        registered: !assigned,
      }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok)
      return alert(result.message || "시험 배정 변경에 실패했습니다.");
    setAssignedIds((previous) =>
      assigned
        ? previous.filter((id) => String(id) !== String(studentId))
        : [...previous, studentId],
    );
    setRequestedIds((previous) =>
      previous.filter((id) => String(id) !== String(studentId)),
    );
  };

  const changeAssignmentStatus = async (
    studentId: string | number,
    status: "assigned" | "cancelled" | "refunded",
  ) => {
    if (!selectedExam) return;
    const label =
      status === "assigned"
        ? "입금완료 및 시험배정"
        : status === "cancelled"
          ? "신청취소"
          : "환불완료";
    if (!window.confirm(`${label} 처리할까요?`)) return;
    setBusy(true);
    const response = await fetch("/api/admin/exam-registrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ examId: selectedExam.id, studentId, status }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok)
      return alert(result.message || "처리 상태를 변경하지 못했습니다.");
    setStatusByStudent((previous) => ({
      ...previous,
      [String(studentId)]: status,
    }));
    setRequestedIds((previous) =>
      previous.filter((id) => String(id) !== String(studentId)),
    );
    setAssignedIds((previous) =>
      status === "assigned"
        ? previous.map(String).includes(String(studentId))
          ? previous
          : [...previous, studentId]
        : previous.filter((id) => String(id) !== String(studentId)),
    );
  };

  const replaceAssignments = async (studentIds: (string | number)[]) => {
    if (!selectedExam) return;
    const message = studentIds.length
      ? `${studentIds.length}명에게 이 시험을 배정할까요?`
      : "이 시험의 학생 배정을 모두 취소할까요?";
    if (!window.confirm(message)) return;
    setBusy(true);
    const response = await fetch("/api/admin/exam-registrations", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ examId: selectedExam.id, studentIds }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok)
      return alert(result.message || "시험 배정 변경에 실패했습니다.");
    setAssignedIds(studentIds);
  };

  return (
    <section className="panel registration-panel">
      <div className="registration-header">
        <div>
          <span className="section-kicker">배정할 시험 선택</span>
          <select
            value={selectedExamId}
            onChange={(event) => setSelectedExamId(event.target.value)}
          >
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.round}회 · {exam.title} · {exam.examDate}
              </option>
            ))}
          </select>
        </div>
        <div className="assignment-flow-note">
          <b>신청 접수 → 입금완료 → 시험배정</b>
          <span>취소와 환불은 기록으로 유지됩니다.</span>
        </div>
      </div>
      <div className="round-summary">
        <div>
          <span>시험</span>
          <strong>
            {selectedExam
              ? `${selectedExam.round}회 · ${selectedExam.title}`
              : "등록된 시험 없음"}
          </strong>
        </div>
        <div>
          <span>시험일</span>
          <strong>{selectedExam?.examDate ?? "-"}</strong>
        </div>
        <div>
          <span>신청 대기</span>
          <strong>{requestedIds.length}명</strong>
        </div>
        <div>
          <span>배정 완료</span>
          <strong>{assignedCount}명</strong>
        </div>
      </div>
      <div className="registration-progress">
        <i
          style={{
            width: `${availableStudents.length ? (assignedCount / availableStudents.length) * 100 : 0}%`,
          }}
        />
      </div>
      <div className="data-table registration-list">
        <div className="table-head">
          <span>학생</span>
          <span>학교 / 학년</span>
          <span>학생 연락처</span>
          <span>학부모 연락처</span>
          <span>신청·결제 상태</span>
          <span>처리</span>
        </div>
        {availableStudents
          .sort(
            (a, b) =>
              Number(requestedIds.map(String).includes(String(b.id))) -
              Number(requestedIds.map(String).includes(String(a.id))),
          )
          .map((student) => {
            const assigned = assignedIds
              .map(String)
              .includes(String(student.id));
            const requested = requestedIds
              .map(String)
              .includes(String(student.id));
            const savedStatus =
              statusByStudent[String(student.id)] ??
              (assigned ? "assigned" : requested ? "requested" : "none");
            const statusLabel =
              savedStatus === "assigned"
                ? "입금완료 · 배정완료"
                : savedStatus === "requested"
                  ? "신청 접수"
                  : savedStatus === "cancelled"
                    ? "신청 취소"
                    : savedStatus === "refunded"
                      ? "환불 완료"
                      : "미신청";
            return (
              <div
                className={`table-row ${requested ? "assignment-requested" : ""}`}
                key={student.id}
              >
                <div className="student-name">
                  <i>{student.name.slice(0, 1)}</i>
                  <div>
                    <strong>{student.name}</strong>
                    <small>{student.school}</small>
                  </div>
                </div>
                <span>
                  {student.school} · {student.grade}
                </span>
                <span>{student.phone}</span>
                <span>{student.parentPhone}</span>
                <span
                  className={`registration-state ${savedStatus === "assigned" ? "registered" : savedStatus === "requested" ? "requested" : savedStatus === "refunded" ? "refunded" : "unregistered"}`}
                >
                  {statusLabel}
                </span>
                <select
                  className={`assignment-action-select ${savedStatus}`}
                  disabled={busy}
                  value=""
                  onChange={(event) => {
                    const nextStatus = event.target.value as
                      | "assigned"
                      | "cancelled"
                      | "refunded"
                      | "";
                    if (nextStatus)
                      void changeAssignmentStatus(student.id, nextStatus);
                  }}
                >
                  <option value="">처리 선택</option>
                  {savedStatus === "requested" ? (
                    <>
                      <option value="assigned">입금완료</option>
                      <option value="cancelled">신청취소</option>
                    </>
                  ) : savedStatus === "assigned" ? (
                    <option value="refunded">환불</option>
                  ) : (
                    <option value="assigned">
                      {savedStatus === "none" ? "직접 배정" : "다시 배정"}
                    </option>
                  )}
                </select>
              </div>
            );
          })}
        {!selectedExam ? (
          <div className="empty-list">먼저 시험을 등록해 주세요.</div>
        ) : availableStudents.length === 0 ? (
          <div className="empty-list">등록 가능한 재원 학생이 없습니다.</div>
        ) : null}
      </div>
    </section>
  );
}

function inferExamArea(info: any, examSubject = "") {
  const text = [info?.major_unit, info?.middle_unit, info?.minor_unit, info?.detailed_topic, ...(info?.problem_types ?? [])].filter(Boolean).join(" ");
  if (/확률|통계|경우의 수|순열|조합|이항분포|정규분포/.test(text)) return "확통";
  if (/수열|지수|로그|삼각함수/.test(text)) return "대수";
  if (/극한|미분|적분|도함수|접선|변화율/.test(text)) return "미적1";
  if (/확통|확률/.test(examSubject)) return "확통";
  if (/대수/.test(examSubject)) return "대수";
  return "미적1";
}

function calculateAreaResult(exam: any, attempt: MonitorAttempt | null) {
  const keys = Array.isArray(exam?.answer_keys) ? exam.answer_keys.map(String) : [];
  const metadata = new Map((exam?.question_metadata ?? []).map((item: any) => [Number(item.question_no), item]));
  const result: Record<string, { correct: number; total: number }> = { 대수: { correct: 0, total: 0 }, 미적1: { correct: 0, total: 0 }, 확통: { correct: 0, total: 0 } };
  for (let no = 1; no <= Number(exam?.question_count ?? 0); no++) {
    const area = inferExamArea(metadata.get(no), String(exam?.subject ?? ""));
    result[area].total += 1;
    const answer = String(attempt?.answers?.[no] ?? attempt?.answers?.[String(no)] ?? "").trim();
    if (answer && answer === String(keys[no - 1] ?? "").trim()) result[area].correct += 1;
  }
  return result;
}

type MonitorAttempt = {
  id: string;
  status: string;
  answers?: Record<string, string>;
  started_at?: string;
  last_saved_at?: string;
  submitted_at?: string;
  score?: number;
  correct_count?: number;
  wrong_numbers?: number[];
  unanswered_numbers?: number[];
  score_source?: "auto" | "manual";
  solution_override?: boolean | null;
  mathpooh_comment?: string;
};
type MonitorRow = {
  student: {
    id: string;
    name: string;
    school: string;
    grade: string;
    phone: string;
  };
  attempt: MonitorAttempt | null;
};

function AdminResultModal({
  examId,
  exam,
  row,
  onClose,
  onSaved,
}: {
  examId: string;
  exam: any;
  row: MonitorRow;
  onClose: () => void;
  onSaved: (attempt: MonitorAttempt) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({
    ...(row.attempt?.answers ?? {}),
  });
  const [saving, setSaving] = useState(false);
  const [manualScore, setManualScore] = useState(
    String(row.attempt?.score ?? ""),
  );
  const [mathpoohComment, setMathpoohComment] = useState(String(row.attempt?.mathpooh_comment ?? ""));
  const keys: string[] = Array.isArray(exam?.answer_keys)
    ? exam.answer_keys.map(String)
    : [];
  const count = Number(exam?.question_count ?? keys.length ?? 0);
  const metadata = new Map<number, any>(
    (Array.isArray(exam?.question_metadata) ? exam.question_metadata : []).map(
      (item: any) => [Number(item.question_no), item],
    ),
  );
  const saveResult = async () => {
    if (!row.attempt) return;
    const parsedScore = Number(manualScore);
    const totalScore = Number(exam?.total_score ?? 100);
    if (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > totalScore) {
      return alert(`점수는 0점부터 ${totalScore}점 사이로 입력해 주세요.`);
    }
    setSaving(true);
    const response = await fetch("/api/admin/exam-monitor", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "update-result",
        examId,
        attemptId: row.attempt.id,
        answers,
        manualScore: parsedScore,
        mathpoohComment,
      }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok)
      return alert(result.message || "시험 결과를 수정하지 못했습니다.");
    onSaved(result.attempt);
    alert("답안과 수동 점수를 저장했습니다.");
  };
  return (
    <div className="result-modal-backdrop" onMouseDown={onClose}>
      <section
        className="result-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <small>제출 결과 상세</small>
            <h2>
              {row.student.name} · {exam?.title}
            </h2>
            <p>
              제출{" "}
              {row.attempt?.submitted_at
                ? new Date(row.attempt.submitted_at).toLocaleString("ko-KR")
                : "-"}
            </p>
          </div>
          <label className="result-score result-score-manual">
            <small>최종 점수</small>
            <span>
              <input
                type="number"
                min="0"
                max={Number(exam?.total_score ?? 100)}
                step="1"
                value={manualScore}
                onChange={(event) => setManualScore(event.target.value)}
              />
              <b>점</b>
            </span>
          </label>
          <button className="result-close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="result-legend">
          <span className="correct">정답</span>
          <span className="wrong">오답</span>
          <span className="blank">미응답</span>
          <b>관리자는 제출 답안을 수정한 뒤 재채점할 수 있습니다.</b>
        </div>
        <ExamResultDiagnosis
          questionCount={count}
          answers={answers}
          keys={keys}
          metadata={
            Array.isArray(exam?.question_metadata) ? exam.question_metadata : []
          }
        />
        <div className="mathpooh-comment-editor">
          <label>매쓰푸의 코멘트</label>
          <textarea value={mathpoohComment} onChange={(event) => setMathpoohComment(event.target.value)} placeholder="학생 성적표에 표시할 코멘트를 입력하세요." rows={4} />
        </div>
        <div className="result-answer-table-wrap">
          <div className="result-answer-table">
            <div className="result-answer-table-head">
              <span>문항</span>
              <span>단원</span>
              <span>문항 유형</span>
              <span>난이도</span>
              <span>학생 답</span>
              <span>정답</span>
              <span>결과</span>
            </div>
            {Array.from({ length: count }, (_, index) => {
              const no = index + 1;
              const answer = String(answers[no] ?? answers[String(no)] ?? "");
              const key = String(keys[index] ?? "");
              const info = metadata.get(no);
              const state = !answer
                ? "blank"
                : answer === key
                  ? "correct"
                  : "wrong";
              return (
                <div className={`result-answer-table-row ${state}`} key={no}>
                  <b>{no}번</b>
                  <span
                    title={[
                      info?.major_unit,
                      info?.middle_unit,
                      info?.minor_unit,
                    ]
                      .filter(Boolean)
                      .join(" > ")}
                  >
                    {info?.minor_unit ||
                      info?.middle_unit ||
                      info?.major_unit ||
                      "정보 없음"}
                  </span>
                  <span
                    title={
                      info?.problem_types?.join(", ") ||
                      info?.detailed_topic ||
                      info?.question_type
                    }
                  >
                    {info?.problem_types?.join(", ") ||
                      info?.detailed_topic ||
                      info?.question_type ||
                      "정보 없음"}
                  </span>
                  <span>
                    <i
                      className={`difficulty difficulty-${info?.difficulty || "none"}`}
                    >
                      {info?.difficulty ? `${info.difficulty}단계` : "-"}
                    </i>
                  </span>
                  <input
                    value={answer}
                    onChange={(event) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [no]: event.target.value
                          .replace(/[^0-9-]/g, "")
                          .slice(0, 5),
                      }))
                    }
                  />
                  <strong>{key || "-"}</strong>
                  <em>
                    {state === "correct"
                      ? "정답"
                      : state === "wrong"
                        ? "오답"
                        : "미응답"}
                  </em>
                </div>
              );
            })}
          </div>
        </div>
        <footer>
          <button className="secondary-button" onClick={onClose}>
            닫기
          </button>
          <button
            className="primary-button"
            onClick={() => void saveResult()}
            disabled={saving}
          >
            {saving ? "저장 중..." : "답안 · 점수 저장"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ExamMonitorPanel({ exams, mode = "progress" }: { exams: PracticeExam[]; mode?: "progress" | "results" }) {
  const [examId, setExamId] = useState(exams[0]?.id ?? "");
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [examInfo, setExamInfo] = useState<any>(null);
  const [openAt, setOpenAt] = useState("");
  const [studentOpen, setStudentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [selectedResult, setSelectedResult] = useState<MonitorRow | null>(null);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [accuracyOpen, setAccuracyOpen] = useState(false);
  const [expandedLogStudentId, setExpandedLogStudentId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const toLocalInput = (value?: string | null) =>
    value
      ? new Date(value)
          .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
          .slice(0, 16)
      : "";
  const loadMonitor = useCallback(
    async (silent = false) => {
      if (!examId) return;
      if (!silent) setBusy(true);
      const response = await fetch(
        `/api/admin/exam-monitor?examId=${encodeURIComponent(examId)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!silent) setBusy(false);
      if (!response.ok)
        return alert(result.message || "시험 진행상황을 불러오지 못했습니다.");
      setRows(result.rows ?? []);
      setExamInfo(result.exam);
      setActivityLogs(result.activity_logs ?? []);
      setCommentDrafts((prev) => {
        const next = { ...prev };
        for (const row of result.rows ?? []) if (row.attempt?.id && next[row.attempt.id] === undefined) next[row.attempt.id] = String(row.attempt.mathpooh_comment ?? "");
        return next;
      });
      if (!silent) {
        setStudentOpen(Boolean(result.exam?.student_open));
        setOpenAt(toLocalInput(result.exam?.open_at));
      }
    },
    [examId],
  );

  useEffect(() => {
    if (!examId && exams[0]?.id) setExamId(exams[0].id);
  }, [examId, exams]);
  useEffect(() => {
    void loadMonitor();
    const timer = window.setInterval(() => void loadMonitor(true), 15000);
    return () => window.clearInterval(timer);
  }, [loadMonitor]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const saveSchedule = async () => {
    if (!examId) return;
    if (!openAt)
      return alert(
        "실전모의고사 입력 화면에서 시험 시작 일시를 먼저 저장해 주세요.",
      );
    setBusy(true);
    const response = await fetch("/api/admin/exam-monitor", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "schedule",
        examId,
        studentOpen: true,
        openAt: new Date(openAt).toISOString(),
      }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok)
      return alert(result.message || "시험 타이머를 생성하지 못했습니다.");
    setExamInfo(result.exam);
    setStudentOpen(true);
  };

  const controlExam = async (action: "pause" | "resume" | "force-end") => {
    if (!examId) return;
    const message = action === "pause"
      ? "시험을 일시정지할까요? 학생 화면의 타이머와 답안 입력이 멈춥니다."
      : action === "resume"
        ? "시험을 재개할까요? 남은 시간부터 다시 진행됩니다."
        : "시험을 지금 강제 종료할까요? 진행 중인 학생 답안이 즉시 제출됩니다.";
    if (!window.confirm(message)) return;
    setBusy(true);
    const response = await fetch("/api/admin/exam-monitor", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, examId }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return alert(result.message || "시험 제어에 실패했습니다.");
    setExamInfo(result.exam);
    setClock(Date.now());
    await loadMonitor(true);
  };

  const setGlobalSolution = async (open: boolean) => {
    if (!examId) return;
    setBusy(true);
    const response = await fetch("/api/admin/exam-monitor", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "solution-global", examId, open }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return alert(result.message || "해설 공개 설정에 실패했습니다.");
    setExamInfo((current: any) => ({ ...current, solution_open: open }));
  };

  const setStudentSolution = async (attemptId: string, override: boolean | null) => {
    const response = await fetch("/api/admin/exam-monitor", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "solution-student", examId, attemptId, override }),
    });
    const result = await response.json();
    if (!response.ok) return alert(result.message || "학생별 해설 설정에 실패했습니다.");
    setRows((current) => current.map((row) => row.attempt?.id === attemptId
      ? { ...row, attempt: { ...row.attempt, solution_override: override } }
      : row));
  };

  const startExamTimer = async () => {
    if (!examId || !openAt)
      return alert("먼저 시작 예정 시각을 입력하고 타이머를 생성해 주세요.");
    if (
      !window.confirm(
        `지금 시험을 시작할까요? 시작 즉시 전체 ${examInfo?.time_limit ?? 100}분 타이머가 작동합니다.`,
      )
    )
      return;
    setBusy(true);
    const response = await fetch("/api/admin/exam-monitor", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start", examId }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok)
      return alert(result.message || "시험을 시작하지 못했습니다.");
    setExamInfo(result.exam);
    setStudentOpen(true);
    setOpenAt(toLocalInput(result.exam.open_at));
    setClock(Date.now());
  };

  const counts = {
    waiting: rows.filter((row) => !row.attempt).length,
    running: rows.filter((row) => row.attempt?.status === "in_progress").length,
    submitted: rows.filter((row) => row.attempt?.status === "submitted").length,
  };
  const formatTime = (value?: string) =>
    value
      ? new Date(value).toLocaleString("ko-KR", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-";
  const isPaused = Boolean(examInfo?.paused_at);
  const isRunning = Boolean(examInfo?.close_at) && !isPaused &&
    new Date(examInfo.close_at).getTime() > clock;
  const timerSeconds = isPaused
    ? Number(examInfo?.paused_remaining_seconds ?? 0)
    : examInfo?.close_at
      ? Math.max(0, Math.ceil((new Date(examInfo.close_at).getTime() - clock) / 1000))
      : null;
  const timerText =
    timerSeconds === null
      ? `${examInfo?.time_limit ?? 100}:00`
      : `${String(Math.floor(timerSeconds / 60)).padStart(2, "0")}:${String(timerSeconds % 60).padStart(2, "0")}`;

  const saveComment = async (attemptId: string, value?: string) => {
    const mathpoohComment = value ?? commentDrafts[attemptId] ?? "";
    setBusy(true);
    const response = await fetch("/api/admin/exam-monitor", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update-comment", examId, attemptId, mathpoohComment }) });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return alert(result.message || "코멘트를 저장하지 못했습니다.");
    setRows((current) => current.map((row) => row.attempt?.id === attemptId
      ? { ...row, attempt: { ...row.attempt, mathpooh_comment: mathpoohComment } }
      : row));
  };

  const submittedRows = rows.filter((row) => row.attempt?.status === "submitted");
  const questionAccuracy = Array.from({ length: Number(examInfo?.question_count ?? 0) }, (_, index) => {
    const no = index + 1;
    const key = String(examInfo?.answer_keys?.[index] ?? "").trim();
    const correct = submittedRows.filter((row) => String(row.attempt?.answers?.[no] ?? row.attempt?.answers?.[String(no)] ?? "").trim() === key).length;
    return { no, correct, total: submittedRows.length, rate: submittedRows.length ? Math.round(correct / submittedRows.length * 100) : 0 };
  });

  const activitySummary = useMemo(() => {
    const map = new Map<string, { consentAt?: string; hiddenCount: number; hiddenSeconds: number }>();
    for (const log of [...activityLogs].reverse()) {
      const current = map.get(log.student_id) ?? { hiddenCount: 0, hiddenSeconds: 0 };
      if (log.event_type === "exam_consent" && !current.consentAt) current.consentAt = log.occurred_at;
      if (log.event_type === "page_hidden") current.hiddenCount += 1;
      if (log.event_type === "page_visible") {
        const matched = String(log.detail ?? "").match(/(\d+)초/);
        if (matched) current.hiddenSeconds += Number(matched[1]);
      }
      map.set(log.student_id, current);
    }
    return map;
  }, [activityLogs]);

  const activityLabel = (eventType: string) => ({
    exam_consent: "응시 동의",
    exam_waiting: "시험 대기",
    exam_started: "시험 시작",
    answer_saved: "답안 저장",
    exam_submitted: "제출 완료",
    page_hidden: "화면 이탈",
    page_visible: "화면 복귀",
    window_blur: "창 포커스 이탈",
    window_focus: "창 포커스 복귀",
    exam_room_open: "응시 화면 진입",
  } as Record<string, string>)[eventType] ?? eventType;

  if (mode === "results") return (
    <div className="exam-results-board">
      <section className="panel results-board-head">
        <div><span className="section-kicker">시험 결과 전광판</span><select value={examId} onChange={(event) => setExamId(event.target.value)}>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.round}회 · {exam.title}</option>)}</select></div>
        <div className="solution-publish-actions"><b>전체 해설 {examInfo?.solution_open ? "공개 중" : "비공개"}</b><button className={examInfo?.solution_open ? "secondary-button" : "primary-button"} disabled={busy} onClick={() => void setGlobalSolution(!examInfo?.solution_open)}>{examInfo?.solution_open ? "전체 해설 닫기" : "제출자 전체 해설 공개"}</button></div>
      </section>
      <section className="panel results-board-table">
        <div className="results-board-row results-board-header"><span>학생</span><span>총점</span><span>영역별 점수(정답 수)</span><span>오답·미응답 문항</span><span>매쓰푸의 코멘트</span><span>해설</span></div>
        {submittedRows.map((row) => {
          const attempt = row.attempt!; const area = calculateAreaResult(examInfo, attempt);
          return <div className="results-board-row" key={row.student.id}>
            <div className="student-name"><i>{row.student.name.slice(0,1)}</i><div><strong>{row.student.name}</strong><small>{row.student.school} · {row.student.grade}</small></div></div>
            <button className="result-detail-button result-board-score" onClick={() => setSelectedResult(row)}><strong>{attempt.score ?? 0}점</strong><span>결과보기</span></button>
            <div className="area-score-cells"><b>대수 {area.대수.correct}/{area.대수.total}</b><b>미적1 {area.미적1.correct}/{area.미적1.total}</b><b>확통 {area.확통.correct}/{area.확통.total}</b></div>
            <span className="wrong-number-list">{attempt.wrong_numbers?.length ? `오답 ${attempt.wrong_numbers.join(", ")}` : "오답 없음"}{attempt.unanswered_numbers?.length ? <><br/><em>미응답 {attempt.unanswered_numbers.join(", ")}</em></> : null}</span>
            <div className="inline-comment"><textarea rows={2} value={commentDrafts[attempt.id] ?? ""} onChange={(event) => setCommentDrafts((prev) => ({ ...prev, [attempt.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void saveComment(attempt.id, event.currentTarget.value); } }} placeholder="코멘트 입력 후 Enter로 저장 (줄바꿈: Shift+Enter)" title="Enter 저장 · Shift+Enter 줄바꿈"/></div>
            <button className={`solution-student-button ${(attempt.solution_override ?? examInfo?.solution_open) ? "open" : "closed"}`} onClick={() => void setStudentSolution(attempt.id, (attempt.solution_override ?? examInfo?.solution_open) ? false : true)}>{(attempt.solution_override ?? examInfo?.solution_open) ? "공개" : "비공개"}</button>
          </div>;
        })}
        {!submittedRows.length ? <div className="empty-list">제출 완료된 학생이 없습니다.</div> : null}
      </section>
      <section className="panel question-accuracy-panel"><button className="small-accuracy-button" onClick={() => setAccuracyOpen((value) => !value)}>문항별 정답률 {accuracyOpen ? "접기" : "보기"}</button>{accuracyOpen ? <div className="question-accuracy-grid">{questionAccuracy.map((item) => <div key={item.no}><b>{item.no}번</b><strong>{item.rate}%</strong><span>{item.correct}/{item.total}명</span></div>)}</div> : null}</section>
      {selectedResult?.attempt ? <AdminResultModal examId={examId} exam={examInfo} row={selectedResult} onClose={() => setSelectedResult(null)} onSaved={(attempt) => { setRows((prev) => prev.map((item) => item.student.id === selectedResult.student.id ? { ...item, attempt } : item)); setSelectedResult((prev) => prev ? { ...prev, attempt } : prev); }} /> : null}
    </div>
  );
  return (
    <div className="exam-monitor-layout">
      <section className="panel monitor-control">
        <div className="monitor-title">
          <div>
            <span className="section-kicker">진행할 시험</span>
            <select
              value={examId}
              onChange={(event) => setExamId(event.target.value)}
            >
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.round}회 · {exam.title}
                </option>
              ))}
            </select>
          </div>
          <button
            className="secondary-button"
            onClick={() => void loadMonitor()}
            disabled={busy}
          >
            ↻ 새로고침
          </button>
        </div>
        <div className="monitor-schedule">
          <div className="monitor-scheduled-at">
            <span>등록된 시험 시작</span>
            <b>
              {openAt
                ? new Date(openAt).toLocaleString("ko-KR", {
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "시험 입력 화면에서 미설정"}
            </b>
          </div>
          <div
            className={`monitor-time-note ${isRunning ? "running" : isPaused ? "paused" : studentOpen && openAt ? "ready" : ""}`}
          >
            <b>{timerText}</b>
            <span>
              {isPaused
                ? "전체 시험 일시정지 중"
                : isRunning
                  ? "전체 시험 타이머 작동 중"
                : studentOpen && openAt
                  ? "✓ 타이머 준비 완료"
                  : `전체 학생 공통 ${examInfo?.time_limit ?? 100}분`}
            </span>
          </div>
          <div
            className={`monitor-ready-card ${isRunning ? "running" : isPaused ? "paused" : studentOpen && openAt ? "ready" : "waiting"}`}
          >
            <strong>
              {isPaused
                ? "시험 일시정지"
                : isRunning
                  ? "시험 진행 중"
                : studentOpen && openAt
                  ? "타이머 생성 완료"
                  : "타이머 생성 전"}
            </strong>
            <span>
              {studentOpen && openAt
                ? "시험지는 시작 1시간 전부터 공개됩니다."
                : "타이머를 생성하면 학생에게 일정이 공개됩니다."}
            </span>
          </div>
          <button
            className="secondary-button"
            onClick={() => void saveSchedule()}
            disabled={busy || !openAt || isRunning || isPaused}
          >
            {busy
              ? "처리 중..."
              : studentOpen && openAt && !examInfo?.close_at
                ? "타이머 다시 생성"
                : "타이머 생성"}
          </button>
          <button
            className="primary-button exam-start-button"
            onClick={() => void startExamTimer()}
            disabled={
              busy ||
              !openAt ||
              !studentOpen ||
              isRunning || isPaused
            }
          >
            시험 시작
          </button>
          {isRunning ? (
            <button className="secondary-button exam-pause-button" onClick={() => void controlExam("pause")} disabled={busy}>
              일시정지
            </button>
          ) : null}
          {isPaused ? (
            <button className="primary-button exam-resume-button" onClick={() => void controlExam("resume")} disabled={busy}>
              시험 재개
            </button>
          ) : null}
          {(isRunning || isPaused) ? (
            <button className="danger-button exam-force-end-button" onClick={() => void controlExam("force-end")} disabled={busy}>
              강제종료
            </button>
          ) : null}
        </div>
      </section>
      <section className="student-stat-grid monitor-stats">
        <MiniStat
          label="배정 완료"
          value={`${rows.length}명`}
          note="입금완료 기준"
        />
        <MiniStat
          label="응시 전"
          value={`${counts.waiting}명`}
          note="아직 시작하지 않음"
        />
        <MiniStat
          label="응시 중"
          value={`${counts.running}명`}
          note="15초 자동 갱신"
          emphasis
        />
        <MiniStat
          label="제출 완료"
          value={`${counts.submitted}명`}
          note="채점 완료"
        />
      </section>
      <section className="panel monitor-table-panel">
        <div className="list-summary exam-result-summary">
          <div><strong>{examInfo?.title ?? "시험 진행관리"}</strong><span>진행 중인 학생은 15초마다 자동 갱신됩니다.</span></div>
        </div>
        <div className="data-table monitor-list">
          <div className="table-head">
            <span>학생</span>
            <span>학교 / 학년</span>
            <span>상태</span>
            <span>응시 동의</span>
            <span>답안 입력</span>
            <span>제출 시각</span>
            <span>로그</span>
          </div>
          {rows.map((row) => {
            const attempt = row.attempt;
            const status = !attempt
              ? "응시 전"
              : attempt.status === "submitted"
                ? "제출 완료"
                : "응시 중";
            const answered = attempt?.answers
              ? Object.values(attempt.answers).filter((answer) =>
                  String(answer).trim(),
                ).length
              : 0;
            const studentLogs = activityLogs.filter((log) => log.student_id === row.student.id);
            const isLogOpen = expandedLogStudentId === row.student.id;
            return (
              <div className="monitor-row-wrap" key={row.student.id}>
                <div className="table-row">
                  <div className="student-name">
                    <i>{row.student.name.slice(0, 1)}</i>
                    <div>
                      <strong>{row.student.name}</strong>
                      <small>{row.student.phone}</small>
                    </div>
                  </div>
                  <span>{row.student.school} · {row.student.grade}</span>
                  <span className={`monitor-state ${attempt?.status ?? "waiting"}`}>{status}</span>
                  <span>{formatTime(activitySummary.get(row.student.id)?.consentAt)}</span>
                  <strong>{answered}개</strong>
                  <span>{formatTime(attempt?.submitted_at)}</span>
                  <button
                    className={`student-log-button ${isLogOpen ? "open" : ""}`}
                    onClick={() => setExpandedLogStudentId(isLogOpen ? null : row.student.id)}
                  >
                    로그 {studentLogs.length}건 {isLogOpen ? "▲" : "▼"}
                  </button>
                </div>
                {isLogOpen ? (
                  <div className="student-log-detail">
                    {studentLogs.length ? studentLogs.map((log) => (
                      <div key={log.id}>
                        <time>{formatTime(log.occurred_at)}</time>
                        <b>{activityLabel(log.event_type)}</b>
                        <span>{log.detail || "-"}</span>
                      </div>
                    )) : <div className="empty-list">기록된 로그가 없습니다.</div>}
                  </div>
                ) : null}
              </div>
            );
          })}
          {rows.length === 0 ? (
            <div className="empty-list">
              이 시험에 배정 완료된 학생이 없습니다.
            </div>
          ) : null}
        </div>
      </section>
      {selectedResult?.attempt ? (
        <AdminResultModal
          examId={examId}
          exam={examInfo}
          row={selectedResult}
          onClose={() => setSelectedResult(null)}
          onSaved={(attempt) => {
            setRows((prev) =>
              prev.map((item) =>
                item.student.id === selectedResult.student.id
                  ? { ...item, attempt }
                  : item,
              ),
            );
            setSelectedResult((prev) => (prev ? { ...prev, attempt } : prev));
          }}
        />
      ) : null}
    </div>
  );
}

function ExamsPage({
  initialTab = "list",
  exams,
  setExams,
  examFiles,
  setExamFiles,
  students,
}: {
  initialTab?: "list" | "input" | "analysis" | "assignment" | "monitor" | "monitor-results";
  exams: PracticeExam[];
  setExams: React.Dispatch<React.SetStateAction<PracticeExam[]>>;
  examFiles: Record<string, ExamFileBundle>;
  setExamFiles: React.Dispatch<
    React.SetStateAction<Record<string, ExamFileBundle>>
  >;
  students: Student[];
}) {
  const [tab, setTab] = useState<"list" | "input" | "analysis" | "assignment" | "monitor" | "monitor-results">(
    initialTab,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftFiles, setDraftFiles] = useState<ExamFileBundle>({});
  const [preview, setPreview] = useState<{
    title: string;
    source: File | string;
    fileName: string;
  } | null>(null);
  const [htmlPreview, setHtmlPreview] = useState<{
    title: string;
    html: string;
  } | null>(null);
  const [regionDrafts, setRegionDrafts] = useState<
    Record<number, "자동인식" | "확인필요">
  >({});
  const [saving, setSaving] = useState(false);
  const [analysisCounts, setAnalysisCounts] = useState<Record<string, number>>(
    {},
  );
  const [analyzingExamId, setAnalyzingExamId] = useState("");
  const [analysisReviewExam, setAnalysisReviewExam] =
    useState<PracticeExam | null>(null);
  const [analysisReviewItems, setAnalysisReviewItems] = useState<
    ExamQuestionAnalysis[]
  >([]);
  const [analysisReviewLoading, setAnalysisReviewLoading] = useState(false);
  const [reanalyzingQuestionNo, setReanalyzingQuestionNo] = useState(0);
  const [reanalyzingAll, setReanalyzingAll] = useState(false);
  const [reanalyzingAllProgress, setReanalyzingAllProgress] = useState({ current: 0, total: 0 });
  const [analysisReviewFiles, setAnalysisReviewFiles] = useState<{
    testUrl?: string;
    solutionUrl?: string;
  }>({});
  const [analysisPreviewItem, setAnalysisPreviewItem] =
    useState<ExamQuestionAnalysis | null>(null);
  const [analysisPreviewTab, setAnalysisPreviewTab] = useState<
    "question" | "solution"
  >("question");

  // 시험 입력 화면은 임시 작업 화면이므로 새로고침 후 복원하지 않습니다.
  // F5를 누르면 항상 안전한 시험 목록에서 시작합니다.
  useEffect(() => {
    window.localStorage.removeItem("matspu-exam-tab");
    setTab(initialTab);
    fetch("/api/admin/exam-analysis", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (response.ok) setAnalysisCounts(result.counts ?? {});
      })
      .catch(() => undefined);
  }, [initialTab]);

  const analyzeExam = async (exam: PracticeExam) => {
    if (!exam.testFilePath) return alert("먼저 PDF 시험지를 등록해 주세요.");
    const current = analysisCounts[exam.id] ?? 0;
    const message = current
      ? `기존 ${current}문항 분석을 같은 기준으로 다시 분석할까요?`
      : `${exam.questionCount}문항을 Problem DNA 기준으로 분석할까요?`;
    if (!window.confirm(message)) return;
    setAnalyzingExamId(exam.id);
    const response = await fetch("/api/admin/exam-analysis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ examId: exam.id }),
    });
    const result = await response.json();
    setAnalyzingExamId("");
    if (!response.ok)
      return alert(result.message || "실전모의고사 문항분석에 실패했습니다.");
    setAnalysisCounts((previous) => ({
      ...previous,
      [exam.id]: Number(result.count ?? exam.questionCount),
    }));
    alert(`${result.count ?? exam.questionCount}문항 분석을 완료했습니다.`);
  };

  const openAnalysisReview = async (exam: PracticeExam) => {
    setAnalysisReviewExam(exam);
    setAnalysisReviewLoading(true);
    try {
      const response = await fetch(
        `/api/admin/exam-analysis?examId=${encodeURIComponent(exam.id)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "분석 결과를 불러오지 못했습니다.");
      setAnalysisReviewItems(result.items ?? []);
      setAnalysisReviewFiles(result.files ?? {});
    } catch (error) {
      alert(error instanceof Error ? error.message : "분석 결과 조회 실패");
    } finally {
      setAnalysisReviewLoading(false);
    }
  };

  const reanalyzeOneQuestion = async (questionNo: number) => {
    if (!analysisReviewExam || reanalyzingQuestionNo || reanalyzingAll) return;
    if (!window.confirm(`${questionNo}번 문항만 다시 분석할까요?`)) return;
    setReanalyzingQuestionNo(questionNo);
    try {
      const response = await fetch("/api/admin/exam-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          examId: analysisReviewExam.id,
          questionNo,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "문항 재분석에 실패했습니다.");
      await openAnalysisReview(analysisReviewExam);
    } catch (error) {
      alert(error instanceof Error ? error.message : "문항 재분석 실패");
    } finally {
      setReanalyzingQuestionNo(0);
    }
  };


  const reanalyzeAllQuestions = async () => {
    if (!analysisReviewExam || reanalyzingAll || reanalyzingQuestionNo) return;
    const total = Math.max(
      analysisReviewExam.questionCount || 0,
      analysisReviewItems.length,
    );
    if (!total) return alert("재분석할 문항이 없습니다.");
    if (
      !window.confirm(
        `전체 ${total}문항을 다시 분석할까요?\n기존 AI 분석 결과가 모두 갱신됩니다.`,
      )
    )
      return;

    setReanalyzingAll(true);
    setReanalyzingAllProgress({ current: 0, total });
    try {
      // 문항별로 PDF를 30번 다시 보내지 않고, 시험지/해설지를 한 번만 전송해
      // 서버에서 전체 문항을 한 번에 분석하고 한 번에 저장한다.
      const response = await fetch("/api/admin/exam-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ examId: analysisReviewExam.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "전체 재분석에 실패했습니다.");
      }
      setReanalyzingAllProgress({ current: total, total });
      await openAnalysisReview(analysisReviewExam);
      alert(`전체 ${result.count ?? total}문항 재분석을 완료했습니다.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "전체 재분석 실패");
    } finally {
      setReanalyzingAll(false);
    }
  };

  const makeEmptyExam = (): Omit<PracticeExam, "id"> => ({
    round: Math.max(0, ...exams.map((exam) => exam.round)) + 1,
    title: "",
    examCode: "",
    examDate: new Date().toISOString().slice(0, 10),
    startAt: "",
    grade: "고1",
    subject: "공통수학1",
    range: "",
    questionCount: 30,
    timeLimit: 100,
    totalScore: 100,
    objectiveCount: 21,
    shortAnswerCount: 9,
    status: "작성중",
    testFile: "",
    solutionFile: "",
    originalFile: "",
    testFilePath: "",
    solutionFilePath: "",
    originalFilePath: "",
    answers: Array(30).fill(""),
    answerVerified: false,
    coverVerified: false,
    regionVerified: false,
    memo: "",
  });
  const [form, setForm] = useState<Omit<PracticeExam, "id">>(() =>
    makeEmptyExam(),
  );
  const set = <K extends keyof Omit<PracticeExam, "id">>(
    key: K,
    value: Omit<PracticeExam, "id">[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const startNew = () => {
    setEditingId(null);
    setDraftFiles({});
    setRegionDrafts({});
    setForm(makeEmptyExam());
    setTab("input");
  };
  const editExam = (exam: PracticeExam) => {
    const { id, ...rest } = exam;
    setEditingId(id);
    setDraftFiles(examFiles[id] ?? {});
    setForm(rest);
    setRegionDrafts({});
    setTab("input");
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (
      !form.title.trim() ||
      !form.examCode.trim() ||
      !form.examDate ||
      !form.startAt
    )
      return alert("시험명, 시험코드, 시험 시작 일시를 입력해 주세요.");
    if (form.objectiveCount + form.shortAnswerCount !== form.questionCount)
      return alert(
        "객관식과 단답형 문항 수의 합이 전체 문항 수와 같아야 합니다.",
      );
    const config = getSupabaseConfig();
    if (!config)
      return alert("Supabase 환경변수가 없습니다. .env.local을 확인해 주세요.");
    setSaving(true);
    try {
      let answersForSave = form.answers;
      const solutionSource =
        draftFiles.solution ?? (await getPdfSource("solution"));
      if (solutionSource && !form.answers.some(Boolean)) {
        answersForSave = await readAnswersFromPdf(solutionSource);
        set("answers", answersForSave);
      }
      const formForSave = { ...form, answers: answersForSave };
      const previousAnswers = editingId ? (exams.find((item) => item.id === editingId)?.answers ?? []) : [];
      const answersChanged = Boolean(editingId) && JSON.stringify(previousAnswers.map(String)) !== JSON.stringify(answersForSave.map(String));
      let examId = editingId;
      if (!examId) {
        const createResponse = await fetch(`${config.url}/rest/v1/exams`, {
          method: "POST",
          headers: {
            ...(await authHeaders()),
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(examToRow(formForSave, {})),
        });
        if (!createResponse.ok) throw new Error(await createResponse.text());
        examId = String((await createResponse.json())[0].id);
      }
      const paths = {
        testFilePath: form.testFilePath,
        solutionFilePath: form.solutionFilePath,
        originalFilePath: form.originalFilePath,
      };
      if (draftFiles.test)
        paths.testFilePath = await uploadExamFile(
          examId,
          "test",
          draftFiles.test,
        );
      if (draftFiles.solution)
        paths.solutionFilePath = await uploadExamFile(
          examId,
          "solution",
          draftFiles.solution,
        );
      if (draftFiles.original)
        paths.originalFilePath = await uploadExamFile(
          examId,
          "original",
          draftFiles.original,
        );
      const row = examToRow(formForSave, paths);
      const updateResponse = await fetch(
        `${config.url}/rest/v1/exams?id=eq.${examId}`,
        {
          method: "PATCH",
          headers: {
            ...(await authHeaders()),
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(row),
        },
      );
      if (!updateResponse.ok) throw new Error(await updateResponse.text());
      const savedExam = examFromRow((await updateResponse.json())[0]);
      setExams((prev) =>
        editingId
          ? prev.map((exam) => (exam.id === savedExam.id ? savedExam : exam))
          : [savedExam, ...prev],
      );
      setExamFiles((prev) => ({
        ...prev,
        [savedExam.id]: { ...prev[savedExam.id], ...draftFiles },
      }));
      let reanalysisNote = "";
      if (answersChanged) {
        const response = await fetch("/api/admin/exam-reanalyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ examId: savedExam.id }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || "정답은 저장했지만 결과 재분석에 실패했습니다.");
        reanalysisNote = `\n제출 완료 ${result.updated ?? 0}명의 점수·정오·취약 분석을 갱신했습니다.${result.manualPreserved ? ` (수동점수 ${result.manualPreserved}명 유지)` : ""}`;
      }
      alert(
        `시험 자료를 저장했습니다. 정답 ${savedExam.answers.filter(Boolean).length}/${savedExam.questionCount}개가 입력되었습니다.${reanalysisNote}`,
      );
      setEditingId(null);
      setDraftFiles({});
      setRegionDrafts({});
      setForm(makeEmptyExam());
      setTab("list");
    } catch (error) {
      console.error(error);
      alert(
        `시험 저장 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("이 실전모의고사를 삭제할까요?")) return;
    const config = getSupabaseConfig();
    if (!config) return alert("Supabase 연결을 확인해 주세요.");
    const response = await fetch(`${config.url}/rest/v1/exams?id=eq.${id}`, {
      method: "DELETE",
      headers: { ...(await authHeaders()) },
    });
    if (!response.ok) return alert(`삭제 실패: ${await response.text()}`);
    setExams((prev) => prev.filter((exam) => exam.id !== id));
  };

  const selectExamFile = (
    kind: "test" | "solution" | "original",
    file?: File,
  ) => {
    if (!file) return;
    if (kind !== "original" && file.type !== "application/pdf")
      return alert("시험지와 해설지는 PDF 파일만 등록할 수 있습니다.");
    if (kind === "original" && !/\.(hwp|hwpx)$/i.test(file.name))
      return alert("한글 통합본은 HWP 또는 HWPX 파일만 등록할 수 있습니다.");
    setDraftFiles((prev) => ({ ...prev, [kind]: file }));
    const key =
      kind === "test"
        ? "testFile"
        : kind === "solution"
          ? "solutionFile"
          : "originalFile";
    set(key, file.name);
  };

  const getFileSource = async (
    kind: "test" | "solution" | "original",
  ): Promise<File | string> => {
    const local = draftFiles[kind];
    if (local) return local;
    const path =
      kind === "test"
        ? form.testFilePath
        : kind === "solution"
          ? form.solutionFilePath
          : form.originalFilePath;
    return await storageFileUrl(path);
  };

  const getPdfSource = (kind: "test" | "solution") => getFileSource(kind);

  // 렌더 중에는 서명 URL을 기다릴 수 없습니다.
  // 화면 표시·버튼 활성화에는 "파일이 있는지"만 동기로 판정합니다.
  const hasPdf = (kind: "test" | "solution" | "original") =>
    Boolean(
      draftFiles[kind] ||
        (kind === "test"
          ? form.testFilePath
          : kind === "solution"
            ? form.solutionFilePath
            : form.originalFilePath),
    );

  const openSavedPdf = async (
    exam: PracticeExam,
    kind: "test" | "solution",
  ) => {
    const local = examFiles[exam.id]?.[kind];
    const path = kind === "test" ? exam.testFilePath : exam.solutionFilePath;
    const source = local ?? (await storageFileUrl(path));
    const label = kind === "test" ? "시험지" : "해설지";
    if (!source) return alert(`${label} PDF가 등록되지 않았습니다.`);
    setPreview({
      title: `${exam.title} · ${label}`,
      source,
      fileName: kind === "test" ? exam.testFile : exam.solutionFile,
    });
  };

  const openOriginal = async (exam: PracticeExam) => {
    const local = examFiles[exam.id]?.original;
    if (local) {
      const url = URL.createObjectURL(local);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return;
    }
    // 서명 URL을 기다린 뒤 window.open을 하면 팝업 차단에 걸립니다.
    // 클릭 시점에 빈 탭을 먼저 연 다음 주소만 채워 넣습니다.
    const tab = window.open("", "_blank");
    try {
      const url = await storageFileUrl(exam.originalFilePath);
      if (!url) {
        tab?.close();
        return alert("한글 통합본이 등록되지 않았습니다.");
      }
      if (tab) tab.location.href = url;
      else window.open(url, "_blank");
    } catch (error) {
      tab?.close();
      alert(error instanceof Error ? error.message : "원본을 열지 못했습니다.");
    }
  };

  const updateAnswer = (index: number, value: string) => {
    const next = Array.from(
      { length: form.questionCount },
      (_, i) => form.answers[i] ?? "",
    );
    next[index] = value.trim();
    set("answers", next);
  };

  const normalizePdfToken = (value: string) =>
    value
      .replace(/[\uE000-\uF8FF]/g, (char) => {
        const code = char.charCodeAt(0);
        // 한글 PDF 수식 글꼴이 숫자를 private-use 영역에 저장하는 경우를 보정합니다.
        const map: Record<number, string> = {
          // 일반적인 private-use 숫자 매핑
          0xe000: "0",
          0xe001: "1",
          0xe002: "2",
          0xe003: "3",
          0xe004: "4",
          0xe005: "5",
          0xe006: "6",
          0xe007: "7",
          0xe008: "8",
          0xe009: "9",
          // 현재 SOS 한글 수식 글꼴 숫자 매핑 (0,1,2,3,4,5,6,7,8,9)
          0xe03d: "0",
          0xe034: "1",
          0xe035: "2",
          0xe036: "3",
          0xe037: "4",
          0xe038: "5",
          0xe039: "6",
          0xe03a: "7",
          0xe03b: "8",
          0xe03c: "9",
        };
        return map[code] ?? char;
      })
      .replace(
        /[①②③④⑤]/g,
        (char) =>
          ({ "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5" })[char] ?? char,
      )
      .replace(/\s+/g, " ")
      .trim();

  const parseSosMeta = (text: string) => {
    const normalized = normalizePdfToken(text);
    const meta = normalized.match(
      /SOS_META\s*\|[^\n\r]*?ANSWERS\s*=\s*([^\n\r]+)/i,
    );
    if (!meta) return null;
    const values = Array(form.questionCount).fill("") as string[];
    for (const pair of meta[1].split(/[;,]/)) {
      const match = pair.trim().match(/^(\d{1,3})\s*[:=]\s*(-?\d+|_)$/);
      if (!match) continue;
      const no = Number(match[1]);
      if (no >= 1 && no <= form.questionCount && match[2] !== "_")
        values[no - 1] = match[2];
    }
    return values.some(Boolean) ? values : null;
  };

  const readAnswersFromPdf = async (source: File | string) => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const data =
      source instanceof File
        ? await source.arrayBuffer()
        : await (await fetch(source)).arrayBuffer();
    const pdf = await pdfjs.getDocument({ data }).promise;
    const existing = Array.from(
      { length: form.questionCount },
      (_, i) => form.answers[i] ?? "",
    );

    // 마지막 페이지부터 역순으로 찾아 '빠른정답'이 있는 한 페이지만 분석합니다.
    // 해설 본문의 문항번호·수식 숫자와 섞이지 않도록 다른 페이지는 절대 파싱하지 않습니다.
    for (
      let pageNo = pdf.numPages;
      pageNo >= Math.max(1, pdf.numPages - 2);
      pageNo -= 1
    ) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const items = (content.items as any[])
        .map((raw) => ({
          text: normalizePdfToken(String(raw.str ?? "")),
          x: Number(raw.transform?.[4] ?? 0),
          y: Number(raw.transform?.[5] ?? 0),
        }))
        .filter((item) => item.text);

      const pageText = items
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ");
      if (!/(빠른\s*정답|정답표)/i.test(pageText)) continue;

      // PDF 텍스트 항목을 실제 읽는 순서(위→아래, 왼쪽→오른쪽)로 정렬합니다.
      const ordered = [...items].sort((a, b) =>
        Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x,
      );
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
        .map(([, parts]) =>
          parts
            .sort((a, b) => a.x - b.x)
            .map((v) => v.text)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
        );

      for (const line of lineTexts) {
        // 표준 형식: 1. ③ / 22. 8 / 30. 50
        const match = line.match(
          /^\s*(\d{1,3})\s*[.．)]?\s*([①②③④⑤]|-?\d+)\s*$/,
        );
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
        const tokens = ordered
          .flatMap((item) => item.text.split(/\s+/))
          .filter(Boolean);
        for (let i = 0; i < tokens.length - 1; i += 1) {
          const noMatch = tokens[i].match(/^(\d{1,3})[.．)]?$/);
          if (!noMatch) continue;
          const no = Number(noMatch[1]);
          if (no < 1 || no > form.questionCount || parsed[no - 1]) continue;
          const answer = normalizePdfToken(tokens[i + 1]).replace(
            /[^0-9-]/g,
            "",
          );
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
    const source = await getPdfSource("solution");
    if (!source) return alert("해설지 PDF를 먼저 등록해 주세요.");
    try {
      const next = await readAnswersFromPdf(source);
      set("answers", next);
      const found = next.filter(Boolean).length;
      alert(
        found === form.questionCount
          ? `정답 ${found}개를 모두 자동 추출했습니다.`
          : `${found}/${form.questionCount}개를 추출했습니다. 비어 있는 답만 확인해 주세요.`,
      );
    } catch (error) {
      console.error(error);
      alert(
        "정답 자동 추출에 실패했습니다. PDF 내부 글자를 읽을 수 있는지 확인해 주세요.",
      );
    }
  };

  const escapeHtml = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const printHtmlSafely = (html: string, title: string) => {
    // 팝업을 열지 않고 현재 화면 안의 독립 iframe 미리보기로 표시합니다.
    // 따라서 브라우저 팝업 허용이 필요 없고, 인쇄 취소 후에도 등록 화면이 멈추지 않습니다.
    setHtmlPreview({ title, html });
  };

  const printAnswerSheet = () => {
    const answers = Array.from(
      { length: form.questionCount },
      (_, i) => form.answers[i] ?? "",
    );
    const cells = answers
      .map(
        (answer, i) =>
          `<div><b>${i + 1}</b><span>${escapeHtml(answer || "-")}</span></div>`,
      )
      .join("");
    const meta = `SOS_META|VERSION=1|CODE=${form.examCode}|COUNT=${form.questionCount}|OBJECTIVE=${form.objectiveCount}|ANSWERS=${answers.map((answer, i) => `${i + 1}:${answer || "_"}`).join(",")}`;
    printHtmlSafely(
      `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(form.examCode)} 정답지</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,'Noto Sans KR',sans-serif;color:#17213a;margin:0}.head{text-align:center;border-bottom:2px solid #17213a;padding-bottom:12px}.head h1{margin:0 0 6px}.meta{font-size:12px;color:#667085}.grid{display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid #999;border-left:1px solid #999;margin-top:20px}.grid div{display:grid;grid-template-columns:36px 1fr;border-right:1px solid #999;border-bottom:1px solid #999;min-height:36px;align-items:center}.grid b{text-align:center;border-right:1px solid #ddd}.grid span{font-weight:800;font-size:17px;text-align:center}.sos-machine{font-size:6px;line-height:1;color:#fff;position:fixed;left:4mm;bottom:3mm;white-space:nowrap}.help{margin-top:12px;text-align:center;font-size:11px;color:#777}</style></head><body><div class="head"><h1>정답표</h1><strong>${escapeHtml(form.title)}</strong><div class="meta">${escapeHtml(form.examCode)} · 객관식 ${form.objectiveCount}문항 · 단답형 ${form.shortAnswerCount}문항</div></div><div class="grid">${cells}</div><div class="help">SOS 표준 정답지 · 이 PDF를 해설지 첫 페이지로 사용하면 정답이 자동 등록됩니다.</div><div class="sos-machine">${escapeHtml(meta)}</div></body></html>`,
      `${form.examCode} 정답지`,
    );
  };

  const printCover = () => {
    printHtmlSafely(
      `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(form.title)}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{font-family:Arial,'Noto Sans KR',sans-serif;margin:0;color:#285c31}.page{width:210mm;min-height:297mm;padding:22mm}.brand{text-align:center;font-weight:900;font-size:34px}.sub{text-align:center;font-size:14px;color:#667085}.line{height:3px;background:#2f6937;margin:24px 0}.title{text-align:center;font-size:28px;font-weight:900;margin:24px 0 34px}.info{display:grid;grid-template-columns:1fr 1fr;border:1px solid #cfd5e6}.info div{padding:14px 16px;border-right:1px solid #cfd5e6;border-bottom:1px solid #cfd5e6}.value{font-size:18px;font-weight:800;margin-top:5px}.student{margin-top:34px;border:1px solid #cfd5e6;padding:22px;line-height:3;font-size:18px}.notice{margin-top:34px;background:#f5f7fb;padding:20px 24px;line-height:1.9}</style></head><body><section class="page"><div class="brand">SOS</div><div class="sub">Score Optimization System · MATHPOOH</div><div class="line"></div><div class="title">${escapeHtml(form.title)}</div><div class="info"><div>대상<div class="value">${escapeHtml(form.grade)}</div></div><div>과목<div class="value">${escapeHtml(form.subject)}</div></div><div>시험일<div class="value">${escapeHtml(form.examDate)}</div></div><div>시험시간<div class="value">${form.timeLimit}분</div></div><div>문항수<div class="value">${form.questionCount}문항</div></div><div>총점<div class="value">${form.totalScore}점</div></div></div><div class="student">학생명 _______________________________<br>학교 _________________________________<br>반 ____________ 번호 ____________</div><div class="notice"><strong>응시 안내</strong><br>1. 감독자의 시작 안내 전까지 시험지를 넘기지 마세요.<br>2. 제한시간을 지키고 답안을 빠짐없이 작성하세요.<br>3. 시험 종료 후 시험지와 답안을 모두 제출하세요.</div></section></body></html>`,
      `${form.examCode} 표지`,
    );
  };

  const createRegionDrafts = () => {
    if (!editingId)
      return alert(
        "먼저 시험을 저장해 주세요. 저장된 시험지로 자동 분석합니다.",
      );
    if (!form.testFilePath) return alert("시험지를 먼저 저장해 주세요.");
    window.location.href = `/pdf-mapper?exam=${encodeURIComponent(editingId)}&questions=${form.questionCount}&auto=1`;
  };

  const openMapper = () => {
    if (!editingId)
      return alert("먼저 시험을 저장한 뒤 영역 편집기를 열어 주세요.");
    if (!form.testFilePath && !draftFiles.test)
      return alert("시험지 PDF를 먼저 등록해 주세요.");
    window.location.href = `/pdf-mapper?exam=${encodeURIComponent(editingId)}&questions=${form.questionCount}`;
  };

  const registrationProgress = (exam: PracticeExam) => {
    const checks = [
      {
        label: "기본정보",
        complete: Boolean(exam.title && exam.examCode && exam.examDate),
      },
      {
        label: "등록 파일",
        complete: Boolean(
          exam.testFilePath && exam.solutionFilePath && exam.originalFilePath,
        ),
      },
      {
        label: "정답 입력·검수",
        complete: Boolean(
          exam.answers.filter(Boolean).length === exam.questionCount &&
            exam.answerVerified,
        ),
      },
      { label: "표지 검수", complete: exam.coverVerified },
      { label: "문항영역 검수", complete: exam.regionVerified },
    ];
    const done = checks.filter((check) => check.complete).length;
    const missing = checks
      .filter((check) => !check.complete)
      .map((check) => check.label);
    return {
      done,
      total: checks.length,
      percent: Math.round((done / checks.length) * 100),
      checks,
      missing,
    };
  };

  const patchExamFields = async (
    examId: string,
    fields: Record<string, unknown>,
  ) => {
    const config = getSupabaseConfig();
    if (!config) return alert("Supabase 환경변수가 없습니다.");
    const response = await fetch(
      `${config.url}/rest/v1/exams?id=eq.${examId}`,
      {
        method: "PATCH",
        headers: {
          ...(await authHeaders()),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(fields),
      },
    );
    if (!response.ok) throw new Error(await response.text());
    const saved = examFromRow((await response.json())[0]);
    setExams((prev) =>
      prev.map((exam) => (exam.id === saved.id ? saved : exam)),
    );
    if (editingId === saved.id) {
      const { id, ...rest } = saved;
      setForm(rest);
    }
  };

  const changeStatusFromList = async (
    exam: PracticeExam,
    status: ExamStatus,
  ) => {
    if (status === "등록완료" && registrationProgress(exam).percent < 100) {
      return alert(
        "모든 등록 단계가 검수 완료되어야 등록완료로 변경할 수 있습니다.",
      );
    }
    try {
      await patchExamFields(exam.id, { status });
    } catch (error) {
      alert(
        `상태 변경 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      );
    }
  };

  const toggleStudentOpen = async (exam: PracticeExam) => {
    if (
      !exam.studentOpen &&
      (!exam.testFilePath ||
        exam.answers.filter(Boolean).length !== exam.questionCount)
    )
      return alert("시험지와 전체 정답을 먼저 등록해 주세요.");
    const next = !exam.studentOpen;
    if (
      !window.confirm(
        next
          ? "학생 페이지에 이 시험을 공개할까요?"
          : "학생 응시를 마감할까요? 진행 중인 학생에게도 더 이상 보이지 않을 수 있습니다.",
      )
    )
      return;
    try {
      await patchExamFields(exam.id, {
        student_open: next,
        status: next ? "등록완료" : exam.status,
      });
      setExams((prev) =>
        prev.map((item) =>
          item.id === exam.id
            ? {
                ...item,
                studentOpen: next,
                status: next ? "등록완료" : item.status,
              }
            : item,
        ),
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "공개 상태 변경 실패");
    }
  };

  const verifyCurrentStep = async (kind: "answer" | "cover" | "region") => {
    if (!editingId) return alert("먼저 시험 자료를 저장해 주세요.");
    if (
      kind === "answer" &&
      form.answers.filter(Boolean).length !== form.questionCount
    )
      return alert("모든 정답을 입력한 뒤 검수 완료해 주세요.");
    const column =
      kind === "answer"
        ? "answer_verified"
        : kind === "cover"
          ? "cover_verified"
          : "region_verified";
    try {
      await patchExamFields(editingId, { [column]: true });
      alert(
        kind === "answer"
          ? "정답 검수 완료로 표시했습니다."
          : kind === "cover"
            ? "표지 검수 완료로 표시했습니다."
            : "문항영역 검수 완료로 표시했습니다.",
      );
    } catch (error) {
      alert(
        `검수 상태 저장 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      );
    }
  };

  return (
    <>
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
      {tab !== "monitor-results" ? <>
      <section className="page-title-row">
        <div>
          <h2>{tab === "analysis" ? "실전모의고사 AI 문항분석" : "실전 모의고사"}</h2>
          <p>{tab === "analysis" ? "등록된 시험지의 문항을 분석하고 완료 상태를 확인합니다." : "모든 컴퓨터가 Supabase의 동일한 시험정보와 PDF를 사용합니다."}</p>
        </div>
        {tab !== "analysis" ? <button className="primary-button" onClick={startNew}>
          ＋ 실전모의고사 입력
        </button> : null}
      </section>
      <div className="student-tabs">
        <button className={tab === "list" ? "active" : ""} onClick={() => setTab("list")}>시험 목록</button>
        <button className={tab === "analysis" ? "active" : ""} onClick={() => setTab("analysis")}>AI 문항분석</button>
        <button className={tab === "assignment" ? "active" : ""} onClick={() => setTab("assignment")}>학생 시험배정</button>
        <button className={tab === "monitor" ? "active" : ""} onClick={() => setTab("monitor")}>시험 진행관리</button>
        <button className={tab === "input" ? "active" : ""} onClick={() => { if (tab !== "input") startNew(); }}>{editingId ? "시험 수정" : "실전모의고사 입력"}</button>
      </div>
      </> : null}
      {tab === "list" || tab === "analysis" ? (
        <>
          <section className="student-stat-grid">
            <MiniStat
              label={tab === "analysis" ? "분석 대상 시험" : "전체 시험"}
              value={`${exams.length}회`}
              note={tab === "analysis" ? "등록된 시험 기준" : "Supabase 등록 기준"}
            />
            <MiniStat
              label={tab === "analysis" ? "문항분석 완료" : "등록 완료"}
              value={`${tab === "analysis" ? exams.filter((e) => (analysisCounts[e.id] ?? 0) === e.questionCount).length : exams.filter((e) => e.status === "등록완료").length}회`}
              note={tab === "analysis" ? "전체 문항 분석 완료" : "응시 등록 가능"}
            />
            <MiniStat
              label={tab === "analysis" ? "분석 필요" : "작성중"}
              value={`${tab === "analysis" ? exams.filter((e) => (analysisCounts[e.id] ?? 0) < e.questionCount).length : exams.filter((e) => e.status === "작성중").length}회`}
              note={tab === "analysis" ? "분석 또는 재분석 필요" : "추가 입력 필요"}
              emphasis
            />
            <MiniStat
              label={tab === "analysis" ? "분석 문항" : "마감"}
              value={tab === "analysis" ? `${Object.values(analysisCounts).reduce((sum, count) => sum + count, 0)}문항` : `${exams.filter((e) => e.status === "마감").length}회`}
              note={tab === "analysis" ? "현재 저장된 분석 결과" : "종료된 시험"}
            />
          </section>
          <section className={`panel exam-list-panel ${tab === "analysis" ? "analysis-list-panel" : ""}`}>
            <div className="list-summary">
              <strong>{tab === "analysis" ? `AI 문항분석 대상 ${exams.length}회` : `실전모의고사 ${exams.length}회`}</strong>
              <span>{tab === "analysis" ? "시험별 분석 진행률과 문항 수를 확인하세요." : "컴퓨터가 달라도 동일한 DB 내용을 표시합니다."}</span>
            </div>
            <div className={`data-table exam-list ${tab === "analysis" ? "analysis-card-list" : ""}`}>
              <div className="table-head">
                <span>회차 / 시험명</span>
                <span>시험코드</span>
                <span>대상 / 과목</span>
                <span>시험일</span>
                <span>문항 / 시간</span>
                <span>등록 파일</span>
                <span>진행률</span>
                <span>등록 상태</span>
                <span>관리</span>
              </div>
              {exams.map((exam) => {
                const progress = registrationProgress(exam);
                return (
                  <div className="table-row" key={exam.id}>
                    <div className="exam-name-cell">
                      <i>{exam.round}</i>
                      <div>
                        <strong>{exam.title}</strong>
                        <small>{exam.range || "범위 미입력"}</small>
                      </div>
                    </div>
                    <b data-label="시험코드">{exam.examCode}</b>
                    <span className="nowrap-cell" data-label="대상 / 과목">
                      {exam.grade} · {exam.subject}
                    </span>
                    <span className="nowrap-cell" data-label="시험일">
                      {exam.examDate}
                    </span>
                    <span className="nowrap-cell" data-label="문항 / 시간">
                      {exam.questionCount}문항 · {exam.timeLimit}분
                    </span>
                    <div className="file-buttons" data-label="등록 파일">
                      <button
                        className={exam.testFilePath ? "ready" : ""}
                        onClick={() => openSavedPdf(exam, "test")}
                        disabled={!exam.testFilePath}
                      >
                        시험지 {exam.testFilePath ? "✓" : "-"}
                      </button>
                      <button
                        className={exam.solutionFilePath ? "ready" : ""}
                        onClick={() => openSavedPdf(exam, "solution")}
                        disabled={!exam.solutionFilePath}
                      >
                        해설지 {exam.solutionFilePath ? "✓" : "-"}
                      </button>
                      <button
                        className={exam.originalFilePath ? "ready" : ""}
                        onClick={() => openOriginal(exam)}
                        disabled={!exam.originalFilePath}
                      >
                        한글 {exam.originalFilePath ? "✓" : "-"}
                      </button>
                    </div>
                    <div
                      className={`exam-progress-cell ${progress.percent === 100 ? "complete" : "incomplete"}`}
                      data-label="진행률"
                    >
                      <div>
                        <strong>{progress.percent}%</strong>
                        <span>
                          {progress.done}/{progress.total}단계
                        </span>
                      </div>
                      <div className="exam-progress-bar">
                        <i style={{ width: `${progress.percent}%` }} />
                      </div>
                      <small>
                        {progress.percent === 100
                          ? "✓ 모든 검수 완료"
                          : `미완료: ${progress.missing.join(" · ")}`}
                      </small>
                    </div>
                    <div className="status-control" data-label="등록 상태">
                      <select
                        value={exam.status}
                        onChange={(e) =>
                          changeStatusFromList(
                            exam,
                            e.target.value as ExamStatus,
                          )
                        }
                      >
                        <option>작성중</option>
                        <option>등록완료</option>
                        <option>마감</option>
                      </select>
                    </div>
                    <div className="row-actions">
                      <button
                        className={
                          (analysisCounts[exam.id] ?? 0) === exam.questionCount
                            ? "exam-analysis-complete"
                            : "exam-analysis-button"
                        }
                        disabled={analyzingExamId === exam.id}
                        onClick={() =>
                          (analysisCounts[exam.id] ?? 0) > 0
                            ? void openAnalysisReview(exam)
                            : void analyzeExam(exam)
                        }
                      >
                        {analyzingExamId === exam.id
                          ? "AI 분석중…"
                          : (analysisCounts[exam.id] ?? 0) ===
                              exam.questionCount
                            ? `분석 결과 확인 ${exam.questionCount}/${exam.questionCount}`
                            : (analysisCounts[exam.id] ?? 0) > 0
                              ? `분석 결과 확인 ${analysisCounts[exam.id]}/${exam.questionCount}`
                            : `AI 문항분석 ${analysisCounts[exam.id] ?? 0}/${exam.questionCount}`}
                      </button>
                      <button onClick={() => void toggleStudentOpen(exam)}>
                        {exam.studentOpen ? "응시 마감" : "학생 공개"}
                      </button>
                      <button onClick={() => editExam(exam)}>수정</button>
                      <button
                        className="delete"
                        onClick={() => remove(exam.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : tab === "assignment" ? (
        <ExamAssignmentPanel exams={exams} students={students} />
      ) : tab === "monitor" || tab === "monitor-results" ? (
        <ExamMonitorPanel exams={exams} mode={tab === "monitor-results" ? "results" : "progress"} />
      ) : (
        <form className="exam-input-layout" onSubmit={save}>
          <section className="panel exam-form-panel">
            <div className="form-section-title">
              <div>
                <span>01</span>
                <div>
                  <h3>시험 기본정보</h3>
                  <p>
                    이 정보는 Supabase에 저장되어 모든 컴퓨터에서 동일하게
                    표시됩니다.
                  </p>
                </div>
              </div>
            </div>
            <div className="form-grid exam-form-grid">
              <Field label="시험 회차 *">
                <input
                  type="number"
                  min="1"
                  value={form.round}
                  onChange={(e) => set("round", Number(e.target.value))}
                />
              </Field>
              <Field label="시험 시작 일시 *">
                <input
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(e) => {
                    const value = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      startAt: value,
                      examDate: value.slice(0, 10),
                    }));
                  }}
                />
              </Field>
              <label className="field full">
                <span>시험명 *</span>
                <input
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                />
              </label>
              <Field label="시험코드 *">
                <input
                  value={form.examCode}
                  onChange={(e) => set("examCode", e.target.value)}
                />
              </Field>
              <div className="field status-readonly">
                <span>등록 상태</span>
                <strong>{form.status}</strong>
                <small>등록 상태는 시험 목록에서만 변경합니다.</small>
              </div>
              <Field label="대상 학년">
                <select
                  value={form.grade}
                  onChange={(e) => set("grade", e.target.value)}
                >
                  <option>중3</option>
                  <option>고1</option>
                  <option>고2</option>
                  <option>고3</option>
                  <option>전체</option>
                </select>
              </Field>
              <Field label="과목">
                <input
                  value={form.subject}
                  onChange={(e) => set("subject", e.target.value)}
                />
              </Field>
              <label className="field full">
                <span>시험 범위</span>
                <input
                  value={form.range}
                  onChange={(e) => set("range", e.target.value)}
                />
              </label>
            </div>
          </section>
          <section className="panel exam-form-panel">
            <div className="form-section-title">
              <div>
                <span>02</span>
                <div>
                  <h3>문항 구성</h3>
                </div>
              </div>
            </div>
            <div className="form-grid exam-form-grid numbers">
              <Field label="전체 문항 수">
                <input
                  type="number"
                  min="1"
                  value={form.questionCount}
                  onChange={(e) => {
                    const count = Number(e.target.value);
                    setForm((prev) => ({
                      ...prev,
                      questionCount: count,
                      answers: Array.from(
                        { length: count },
                        (_, i) => prev.answers[i] ?? "",
                      ),
                    }));
                  }}
                />
              </Field>
              <Field label="총점">
                <input
                  type="number"
                  min="1"
                  value={form.totalScore}
                  onChange={(e) => set("totalScore", Number(e.target.value))}
                />
              </Field>
              <Field label="객관식 문항">
                <input
                  type="number"
                  min="0"
                  value={form.objectiveCount}
                  onChange={(e) =>
                    set("objectiveCount", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="단답형 문항">
                <input
                  type="number"
                  min="0"
                  value={form.shortAnswerCount}
                  onChange={(e) =>
                    set("shortAnswerCount", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="시험 시간(분)">
                <input
                  type="number"
                  min="1"
                  value={form.timeLimit}
                  onChange={(e) => set("timeLimit", Number(e.target.value))}
                />
              </Field>
              <div
                className={`question-check ${form.objectiveCount + form.shortAnswerCount === form.questionCount ? "ok" : "warning"}`}
              >
                <span>문항 합계</span>
                <strong>
                  {form.objectiveCount + form.shortAnswerCount} /{" "}
                  {form.questionCount}
                </strong>
              </div>
            </div>
          </section>
          <section className="panel exam-form-panel">
            <div className="form-section-title">
              <div>
                <span>03</span>
                <div>
                  <h3>시험 자료 3종 등록</h3>
                  <p>
                    한글 통합본은 원본 보관용, 시험지·해설지 PDF는 SOS
                    운영용입니다.
                  </p>
                </div>
              </div>
            </div>
            <div className="upload-grid three-files">
              {(["original", "test", "solution"] as const).map((kind) => {
                const isOriginal = kind === "original";
                const isTest = kind === "test";
                const label = isOriginal
                  ? "한글 통합본"
                  : isTest
                    ? "시험지 PDF"
                    : "해설지 PDF";
                const fileName = isOriginal
                  ? form.originalFile
                  : isTest
                    ? form.testFile
                    : form.solutionFile;
                const localFile = draftFiles[kind];
                const savedPath = isOriginal
                  ? form.originalFilePath
                  : isTest
                    ? form.testFilePath
                    : form.solutionFilePath;
                const hasFile = Boolean(localFile || savedPath);
                return (
                  <div className="upload-card-wrap" key={kind}>
                    <label className="upload-card">
                      <span>{label}</span>
                      <strong>{fileName || "등록된 파일 없음"}</strong>
                      <input
                        type="file"
                        accept={
                          isOriginal
                            ? ".hwp,.hwpx,application/haansofthwp"
                            : "application/pdf,.pdf"
                        }
                        onChange={(e) =>
                          selectExamFile(kind, e.target.files?.[0])
                        }
                      />
                      <em>{hasFile ? "파일 변경" : "파일 선택"}</em>
                    </label>
                    {isOriginal ? (
                      <button
                        type="button"
                        className="pdf-preview-button"
                        disabled={!hasFile}
                        onClick={async () => {
                          if (localFile) {
                            const url = URL.createObjectURL(localFile);
                            window.open(url, "_blank");
                            setTimeout(() => URL.revokeObjectURL(url), 30000);
                            return;
                          }
                          const tab = window.open("", "_blank");
                          try {
                            const url = await getFileSource(kind);
                            if (typeof url === "string" && url) {
                              if (tab) tab.location.href = url;
                              else window.open(url, "_blank");
                            } else tab?.close();
                          } catch (error) {
                            tab?.close();
                            alert(
                              error instanceof Error
                                ? error.message
                                : "파일을 열지 못했습니다.",
                            );
                          }
                        }}
                      >
                        한글 파일 열기
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="pdf-preview-button"
                        disabled={!hasFile}
                        onClick={async () => {
                          try {
                            const source = await getFileSource(kind);
                            if (!source) return;
                            setPreview({
                              title: `${form.title || "현재 시험"} · ${isTest ? "시험지" : "해설지"}`,
                              source,
                              fileName,
                            });
                          } catch (error) {
                            alert(
                              error instanceof Error
                                ? error.message
                                : "PDF를 불러오지 못했습니다.",
                            );
                          }
                        }}
                      >
                        {isTest ? "시험지" : "해설지"} 미리보기
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="upload-save-row">
              <button
                className="primary-button upload-save-button"
                disabled={saving}
              >
                {saving ? "파일 저장 중..." : "시험 자료 한 번에 저장"}
              </button>
              <span>
                선택한 한글·시험지·해설지를 한 번에 저장하고 해설지 정답도
                자동으로 읽습니다.
              </span>
            </div>
            <div className="file-standard-note">
              <b>SOS 표준 등록</b>
              <span>한글 통합본 + 시험지 PDF + 해설지 PDF</span>
            </div>
            <label className="field exam-memo">
              <span>관리 메모</span>
              <textarea
                value={form.memo}
                onChange={(e) => set("memo", e.target.value)}
              />
            </label>
          </section>
          <section className="panel exam-form-panel">
            <div className="form-section-title">
              <div>
                <span>04</span>
                <div>
                  <h3>빠른 정답 자동 추출</h3>
                  <p>
                    해설지 마지막 페이지의 ‘빠른정답’을 읽어 1~30번 답을 자동
                    입력합니다.
                  </p>
                </div>
              </div>
            </div>
            <div className="answer-toolbar">
              <div>
                <strong>
                  {form.answers.filter(Boolean).length}/{form.questionCount}개
                  입력
                </strong>
                <span>
                  1~{form.objectiveCount}번 객관식 · {form.objectiveCount + 1}~
                  {form.questionCount}번 단답형
                </span>
              </div>
              <div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={extractAnswersFromSolution}
                  disabled={!hasPdf("solution")}
                >
                  마지막 빠른정답 읽기
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={printAnswerSheet}
                  disabled={!form.answers.some(Boolean)}
                >
                  정답지 자동 생성
                </button>
                <button
                  type="button"
                  className={`verify-button ${form.answerVerified ? "verified" : ""}`}
                  onClick={() => verifyCurrentStep("answer")}
                >
                  {form.answerVerified ? "정답 검수완료 ✓" : "정답 검수완료"}
                </button>
              </div>
            </div>
            <div className="answer-key-grid">
              {Array.from({ length: form.questionCount }, (_, index) => {
                const no = index + 1;
                const objective = no <= form.objectiveCount;
                return (
                  <label
                    key={no}
                    className={!form.answers[index] ? "answer-missing" : ""}
                  >
                    <b>{no}</b>
                    {objective ? (
                      <select
                        value={form.answers[index] ?? ""}
                        onChange={(e) => updateAnswer(index, e.target.value)}
                      >
                        <option value="">-</option>
                        <option value="1">①</option>
                        <option value="2">②</option>
                        <option value="3">③</option>
                        <option value="4">④</option>
                        <option value="5">⑤</option>
                      </select>
                    ) : (
                      <input
                        inputMode="numeric"
                        value={form.answers[index] ?? ""}
                        onChange={(e) => updateAnswer(index, e.target.value)}
                        placeholder="답"
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </section>
          <section className="panel exam-form-panel">
            <div className="form-section-title">
              <div>
                <span>05</span>
                <div>
                  <h3>SOS 시험 표지</h3>
                </div>
              </div>
            </div>
            <div className="cover-builder">
              <article className="exam-cover-preview">
                <div className="cover-logo">SOS</div>
                <small>Score Optimization System · MATHPOOH</small>
                <div className="cover-rule" />
                <h2>{form.title || "시험명을 입력해 주세요"}</h2>
                <div className="cover-info-grid">
                  <span>대상</span>
                  <b>{form.grade}</b>
                  <span>과목</span>
                  <b>{form.subject || "-"}</b>
                  <span>시험일</span>
                  <b>{form.examDate || "-"}</b>
                  <span>시험시간</span>
                  <b>{form.timeLimit}분</b>
                  <span>문항수</span>
                  <b>{form.questionCount}문항</b>
                  <span>총점</span>
                  <b>{form.totalScore}점</b>
                </div>
                <div className="cover-student-lines">
                  학생명 ____________________
                  <br />
                  학교 ______________________
                  <br />반 ________ 번호 ________
                </div>
              </article>
              <div className="cover-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={printCover}
                >
                  표지 미리보기 · 인쇄
                </button>
                <button
                  type="button"
                  className={`verify-button ${form.coverVerified ? "verified" : ""}`}
                  onClick={() => verifyCurrentStep("cover")}
                >
                  {form.coverVerified ? "표지 검수완료 ✓" : "표지 검수완료"}
                </button>
              </div>
            </div>
          </section>
          <section className="panel exam-form-panel">
            <div className="form-section-title">
              <div>
                <span>06</span>
                <div>
                  <h3>문항영역 자동 초안</h3>
                  <p>
                    03단계에서 이미 올린 시험지를 그대로 불러옵니다. 다시
                    업로드하지 않습니다.
                  </p>
                </div>
              </div>
            </div>
            <div className="region-builder">
              <div className="region-toolbar">
                <div>
                  <strong>{form.questionCount}문항 영역 설정</strong>
                  <p>
                    {hasPdf("test")
                      ? `등록 시험지: ${form.testFile}`
                      : "시험지 PDF가 아직 없습니다."}
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={createRegionDrafts}
                    disabled={!hasPdf("test")}
                  >
                    자동 분석 시작
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={openMapper}
                    disabled={!hasPdf("test")}
                  >
                    등록 시험지로 영역 편집
                  </button>
                  <button
                    type="button"
                    className={`verify-button ${form.regionVerified ? "verified" : ""}`}
                    onClick={() => verifyCurrentStep("region")}
                    disabled={!editingId || !form.testFilePath}
                  >
                    {form.regionVerified
                      ? "문항영역 검수완료 ✓"
                      : "문항영역 검수완료"}
                  </button>
                </div>
              </div>
              {Object.keys(regionDrafts).length ? (
                <>
                  <div className="region-progress">
                    <i
                      style={{
                        width: `${Math.round((Object.values(regionDrafts).filter((v) => v === "자동인식").length / form.questionCount) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="region-chip-grid">
                    {Array.from(
                      { length: form.questionCount },
                      (_, index) => index + 1,
                    ).map((no) => (
                      <button
                        type="button"
                        key={no}
                        className={
                          regionDrafts[no] === "확인필요"
                            ? "needs-check"
                            : "auto-ok"
                        }
                        onClick={() => {
                          if (!editingId)
                            return alert("먼저 시험을 저장해 주세요.");
                          window.location.href = `/pdf-mapper?exam=${encodeURIComponent(editingId)}&questions=${form.questionCount}&active=${no}&auto=1`;
                        }}
                      >
                        <b>{no}</b>
                        <span>
                          {regionDrafts[no] === "확인필요"
                            ? "확인 필요"
                            : "영역 보기"}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="region-empty">
                  {hasPdf("test") ? (
                    <>
                      <b>{form.testFile}</b>을 사용합니다. 추가 업로드는 필요
                      없습니다.
                    </>
                  ) : (
                    <>03단계에서 시험지 PDF를 등록해 주세요.</>
                  )}
                </div>
              )}
            </div>
          </section>
          <div className="exam-form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setTab("list")}
            >
              취소
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? "저장 중..." : editingId ? "수정 저장" : "시험 등록"}
            </button>
          </div>
        </form>
      )}
      {preview ? (
        <PdfPreviewModal
          title={preview.title}
          source={preview.source}
          fileName={preview.fileName}
          onClose={() => setPreview(null)}
        />
      ) : null}
      {htmlPreview ? (
        <HtmlPrintPreviewModal
          title={htmlPreview.title}
          html={htmlPreview.html}
          onClose={() => setHtmlPreview(null)}
        />
      ) : null}
      {analysisReviewExam ? (
        <div
          className="analysis-result-backdrop"
          onMouseDown={() => setAnalysisReviewExam(null)}
        >
          <section
            className="analysis-result-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="analysis-result-head">
              <div>
                <small>실전모의고사 AI 분석 결과</small>
                <h2>{analysisReviewExam.title}</h2>
                <p>
                  문항별 분류·난이도·공식 정답·핵심 풀이를 확인하고 필요한
                  문항만 다시 분석할 수 있습니다.
                </p>
              </div>
              <div className="analysis-result-head-actions">
                <button
                  type="button"
                  className="analysis-reanalyze-all"
                  disabled={reanalyzingAll || reanalyzingQuestionNo > 0}
                  onClick={() => void reanalyzeAllQuestions()}
                >
                  {reanalyzingAll
                    ? `전체 재분석 중 ${reanalyzingAllProgress.current}/${reanalyzingAllProgress.total}`
                    : "↻ 전체 재분석"}
                </button>
                <button
                  type="button"
                  disabled={reanalyzingAll}
                  onClick={() => setAnalysisReviewExam(null)}
                >
                  닫기 ×
                </button>
              </div>
            </header>
            {reanalyzingAll ? (
              <MATHPOOHLoader
                audience="admin"
                title="AI 전체 재분석 중!!"
                detail={`현재 ${Math.min(reanalyzingAllProgress.current + 1, reanalyzingAllProgress.total)}번 문항을 분석하고 있습니다.`}
                current={reanalyzingAllProgress.current}
                total={reanalyzingAllProgress.total}
                kind="analysis"
              />
            ) : null}
            {analysisReviewLoading ? (
              <div className="analysis-result-loading">
                AI 분석 결과를 불러오는 중입니다…
              </div>
            ) : (
              <div className="analysis-result-table-wrap">
                <div className="analysis-result-row analysis-result-labels">
                  <span>문항</span>
                  <span>단원 분류</span>
                  <span>세부 주제</span>
                  <span>문항 유형</span>
                  <span>난이도</span>
                  <span>정답</span>
                  <span>신뢰도</span>
                  <span>AI 핵심 풀이</span>
                  <span>관리</span>
                </div>
                {analysisReviewItems.map((item) => (
                  <div className="analysis-result-row" key={item.question_no}>
                    <button
                      type="button"
                      className="analysis-question-open"
                      onClick={() => {
                        setAnalysisPreviewItem(item);
                        setAnalysisPreviewTab("question");
                      }}
                    >
                      {item.question_no}번 보기
                    </button>
                    <span title={[item.major_unit, item.middle_unit, item.minor_unit].filter(Boolean).join(" > ")}>
                      {[item.major_unit, item.middle_unit, item.minor_unit]
                        .filter(Boolean)
                        .join(" > ") || "-"}
                    </span>
                    <span>{item.detailed_topic || "-"}</span>
                    <span>
                      {(item.problem_types ?? []).join(" · ") ||
                        item.question_type ||
                        "-"}
                    </span>
                    <b className={`analysis-difficulty d${item.difficulty}`}>
                      {item.difficulty}단계
                    </b>
                    <b>{item.analysis_data?.answer || "-"}</b>
                    <span>{Math.round(Number(item.confidence || 0) * 100)}%</span>
                    <span>{item.analysis_data?.summary || "-"}</span>
                    <button
                      type="button"
                      disabled={reanalyzingQuestionNo > 0 || reanalyzingAll}
                      onClick={() => void reanalyzeOneQuestion(item.question_no)}
                    >
                      {reanalyzingQuestionNo === item.question_no
                        ? "재분석 중…"
                        : "이 문항 재분석"}
                    </button>
                  </div>
                ))}
                {analysisReviewItems.length === 0 ? (
                  <div className="analysis-result-empty">
                    저장된 문항분석 결과가 없습니다.
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      ) : null}
      {analysisPreviewItem ? (
        <div
          className="analysis-preview-backdrop"
          onMouseDown={() => setAnalysisPreviewItem(null)}
        >
          <section
            className="analysis-preview-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>{analysisReviewExam?.title}</small>
                <h2>{analysisPreviewItem.question_no}번 문항 · 공식 해설</h2>
              </div>
              <button type="button" onClick={() => setAnalysisPreviewItem(null)}>
                닫기 ×
              </button>
            </header>
            <nav className="analysis-preview-tabs">
              <button
                type="button"
                className={analysisPreviewTab === "question" ? "active" : ""}
                onClick={() => setAnalysisPreviewTab("question")}
              >
                문제 보기
              </button>
              <button
                type="button"
                className={analysisPreviewTab === "solution" ? "active" : ""}
                onClick={() => setAnalysisPreviewTab("solution")}
              >
                공식 해설 보기
              </button>
            </nav>
            <div className="analysis-preview-body">
              {analysisPreviewTab === "question" ? (
                analysisReviewFiles.testUrl ? (
                  <PdfRegionPreview
                    url={analysisReviewFiles.testUrl}
                    pageNo={Math.max(1, Number(analysisPreviewItem.analysis_data?.test_page_no || 1))}
                    bbox={analysisPreviewItem.analysis_data?.test_bbox}
                    label={`${analysisPreviewItem.question_no}번 문제`}
                  />
                ) : (
                  <div className="analysis-preview-empty">등록된 시험지 PDF가 없습니다.</div>
                )
              ) : analysisReviewFiles.solutionUrl && Number(analysisPreviewItem.analysis_data?.solution_page_no || 0) > 0 ? (
                <PdfRegionPreview
                  url={analysisReviewFiles.solutionUrl}
                  pageNo={Math.max(1, Number(analysisPreviewItem.analysis_data?.solution_page_no || 1))}
                  bbox={analysisPreviewItem.analysis_data?.solution_bbox}
                  label={`${analysisPreviewItem.question_no}번 공식 해설`}
                />
              ) : (
                <div className="analysis-preview-empty">등록된 공식 해설 PDF가 없습니다.</div>
              )}
            </div>
            <footer>
              <span>
                정답 <b>{analysisPreviewItem.analysis_data?.answer || "-"}</b>
              </span>
              <p>{analysisPreviewItem.analysis_data?.summary || "AI 핵심 풀이가 아직 없습니다."}</p>
              {!analysisPreviewItem.analysis_data?.test_page_no ? (
                <small>
                  기존 분석 문항은 페이지 정보가 없습니다. ‘이 문항 재분석’을 하면
                  해당 문항·해설 페이지로 바로 열립니다.
                </small>
              ) : null}
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

function PdfRegionPreview({
  url,
  pageNo,
  bbox,
  label,
}: {
  url: string;
  pageNo: number;
  bbox?: [number, number, number, number];
  label: string;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    setLoading(true);
    setError("");
    setImageUrl("");

    void (async () => {
      try {
        if (!bbox || bbox.length !== 4) {
          throw new Error("문항 영역 좌표가 없습니다. 이 문항을 재분석해 주세요.");
        }
        const [rawX, rawY, rawWidth, rawHeight] = bbox.map(Number);
        const x = Math.max(0, Math.min(1, rawX));
        const y = Math.max(0, Math.min(1, rawY));
        const width = Math.max(0.01, Math.min(1 - x, rawWidth));
        const height = Math.max(0.01, Math.min(1 - y, rawHeight));

        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error("PDF를 불러오지 못했습니다.");
        const pdf = await pdfjs.getDocument({
          data: new Uint8Array(await response.arrayBuffer()),
        }).promise;
        const page = await pdf.getPage(Math.min(Math.max(1, pageNo), pdf.numPages));
        const viewport = page.getViewport({ scale: 2 });
        const source = document.createElement("canvas");
        source.width = Math.ceil(viewport.width);
        source.height = Math.ceil(viewport.height);
        const sourceContext = source.getContext("2d", { alpha: false });
        if (!sourceContext) throw new Error("문항 이미지를 만들 수 없습니다.");
        await page.render({ canvas: source, canvasContext: sourceContext, viewport }).promise;

        const padding = 18;
        const sx = Math.max(0, Math.floor(x * source.width) - padding);
        const sy = Math.max(0, Math.floor(y * source.height) - padding);
        const sw = Math.min(source.width - sx, Math.ceil(width * source.width) + padding * 2);
        const sh = Math.min(source.height - sy, Math.ceil(height * source.height) + padding * 2);
        const output = document.createElement("canvas");
        output.width = Math.max(1, sw);
        output.height = Math.max(1, sh);
        const outputContext = output.getContext("2d", { alpha: false });
        if (!outputContext) throw new Error("문항 이미지를 자를 수 없습니다.");
        outputContext.fillStyle = "#ffffff";
        outputContext.fillRect(0, 0, output.width, output.height);
        outputContext.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
        const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("문항 이미지를 저장하지 못했습니다.");
        objectUrl = URL.createObjectURL(blob);
        if (!disposed) setImageUrl(objectUrl);
      } catch (caught) {
        if (!disposed) setError(caught instanceof Error ? caught.message : "미리보기를 만들지 못했습니다.");
      } finally {
        if (!disposed) setLoading(false);
      }
    })();

    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, pageNo, bbox?.join(",")]);

  if (loading) return <div className="analysis-preview-empty">문항 영역을 불러오는 중입니다…</div>;
  if (error) return <div className="analysis-preview-empty">{error}</div>;
  return <div className="analysis-region-image"><img src={imageUrl} alt={label} /></div>;
}

function HtmlPrintPreviewModal({
  title,
  html,
  onClose,
}: {
  title: string;
  html: string;
  onClose: () => void;
}) {
  const printFrame = () => {
    const frame = document.getElementById(
      "sos-html-print-frame",
    ) as HTMLIFrameElement | null;
    const target = frame?.contentWindow;
    if (!target)
      return alert(
        "인쇄 미리보기를 불러오는 중입니다. 잠시 후 다시 눌러 주세요.",
      );
    target.focus();
    target.print();
  };
  return (
    <div className="pdf-modal-backdrop" onMouseDown={onClose}>
      <section
        className="pdf-modal html-print-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <strong>{title}</strong>
            <span>팝업 허용 없이 현재 화면에서 미리보기</span>
          </div>
          <div className="html-print-actions">
            <button type="button" onClick={printFrame}>
              인쇄
            </button>
            <button type="button" onClick={onClose}>
              ×
            </button>
          </div>
        </header>
        <iframe id="sos-html-print-frame" title={title} srcDoc={html} />
      </section>
    </div>
  );
}

function PdfPreviewModal({
  title,
  source,
  fileName,
  onClose,
}: {
  title: string;
  source: File | string;
  fileName: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (typeof source === "string") {
      setUrl(source);
      return;
    }
    const objectUrl = URL.createObjectURL(source);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [source]);
  return (
    <div className="pdf-modal-backdrop" onMouseDown={onClose}>
      <section className="pdf-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div>
            <strong>{title}</strong>
            <span>{fileName}</span>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        {url ? (
          <iframe title={title} src={url} />
        ) : (
          <div className="pdf-loading">PDF를 여는 중입니다.</div>
        )}
      </section>
    </div>
  );
}
function Dashboard({
  students,
  onMove,
}: {
  students: Student[];
  onMove: (menu: AdminMenu) => void;
}) {
  return (
    <>
      <section className="welcome-card">
        <div>
          <span className="pill">MATHPOOH SOS</span>
          <h2>학생의 점수를 데이터로 최적화합니다.</h2>
          <p>진단부터 훈련 추천까지 MATHPOOH의 전체 흐름을 관리하세요.</p>
        </div>
      </section>
      <section className="student-stat-grid">
        <MiniStat
          label="등록 학생"
          value={`${students.length}명`}
          note="전체 회원"
        />
        <MiniStat
          label="재원 학생"
          value={`${students.filter((s) => s.status === "정상").length}명`}
          note="현재 학습중"
        />
        <MiniStat label="AI 분석 대기" value="12건" note="검토 필요" emphasis />
        <MiniStat label="추천 승인 대기" value="7건" note="SOS 추천" />
      </section>
      <section className="empty-page">
        <div className="empty-icon">⌂</div>
        <h2>대시보드 상세 구성 예정</h2>
        <p>현재는 학생관리 기능을 우선 개발했습니다.</p>
        <button className="primary-button" onClick={() => onMove("students")}>
          학생 관리 열기
        </button>
      </section>
    </>
  );
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
  content_role?: "TRAINING" | "REFERENCE";
  training_course?: string;
  analysis_status?: string | null;
  analysis_progress?: number;
  analysis_total_questions?: number;
  bank_count?: number;
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

type SourceWorkflowTone = "new" | "running" | "ready" | "error" | "review";

function getSourceWorkflow(item: SourceFile): { label: string; detail: string; tone: SourceWorkflowTone } {
  const bankCount = Number(item.bank_count || 0);
  const total = Number(item.analysis_total_questions || 0);
  const analysisStatus = String(item.analysis_status || "").toUpperCase();
  const sourceStatus = String(item.status || "").toLowerCase();

  if (analysisStatus === "FAILED" || sourceStatus === "failed") {
    return { label: "분석오류", detail: "오류 확인 필요", tone: "error" };
  }
  if (["RUNNING", "WAITING"].includes(analysisStatus) || ["splitting", "pages_created", "analyzing"].includes(sourceStatus)) {
    const progress = Math.max(0, Math.min(100, Number(item.analysis_progress || 0)));
    return { label: "분석중", detail: progress ? `${progress}% 진행` : "AI 분석 진행", tone: "running" };
  }
  if (bankCount > 0) {
    const complete = total > 0 && bankCount >= total;
    return {
      label: complete || analysisStatus === "DONE" ? "문제은행 등록완료" : "문제은행 등록중",
      detail: total > 0 ? `${bankCount}/${total}문항` : `${bankCount}문항`,
      tone: complete || analysisStatus === "DONE" ? "ready" : "review",
    };
  }
  if (["REVIEW", "DONE"].includes(analysisStatus) || sourceStatus === "completed") {
    return { label: "분석완료·등록대기", detail: total > 0 ? `${total}문항 검토` : "문제은행 등록 대기", tone: "review" };
  }
  return { label: "신규", detail: "AI 분석 전", tone: "new" };
}


type RefreshQuestion = {
  id: string;
  question_no: number;
  page_no: number | null;
  crop_x: number | null;
  crop_y: number | null;
  crop_width: number | null;
  crop_height: number | null;
};

type ReplacementRefreshState = {
  sourceId: string;
  title: string;
  kind: "exam" | "solution";
  analysisId: string;
  questions: RefreshQuestion[];
  selected: number[];
  mode: "image" | "analysis";
};

async function loadPdfDocument(url: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("교체된 PDF를 불러오지 못했습니다.");
  const data = new Uint8Array(await response.arrayBuffer());
  return pdfjs.getDocument({ data }).promise;
}

async function renderPdfPage(pdf: any, pageNo: number) {
  const page = await pdf.getPage(pageNo);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.max(1.7, 1800 / Math.max(1, baseViewport.width));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PDF 렌더링 화면을 만들지 못했습니다.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

async function cropCanvasToWebp(canvas: HTMLCanvasElement, rect: { x: number; y: number; width: number; height: number }) {
  const sx = Math.max(0, Math.floor((canvas.width * rect.x) / 100));
  const sy = Math.max(0, Math.floor((canvas.height * rect.y) / 100));
  const sw = Math.max(1, Math.min(canvas.width - sx, Math.ceil((canvas.width * rect.width) / 100)));
  const sh = Math.max(1, Math.min(canvas.height - sy, Math.ceil((canvas.height * rect.height) / 100)));
  const output = document.createElement("canvas");
  output.width = sw;
  output.height = sh;
  const context = output.getContext("2d");
  if (!context) throw new Error("문항 이미지를 만들지 못했습니다.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, sw, sh);
  context.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return new Promise<Blob>((resolve, reject) => {
    output.toBlob((blob) => blob ? resolve(blob) : reject(new Error("이미지 변환에 실패했습니다.")), "image/webp", .92);
  });
}

function ProblemsPage({
  onOpenAnalysis,
}: {
  onOpenAnalysis: (sourceFileId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("MATHPOOH 자체 제작");
  const [grade, setGrade] = useState("고1");
  const [subject, setSubject] = useState("공통수학1");
  const [contentRole, setContentRole] = useState<"TRAINING" | "REFERENCE">("TRAINING");
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replacingFile, setReplacingFile] = useState<{ id: string; kind: UploadFileKind } | null>(null);
  const [replacementRefresh, setReplacementRefresh] = useState<ReplacementRefreshState | null>(null);
  const [refreshingReplacement, setRefreshingReplacement] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ title: string; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  const openSourcePdfPreview = async (item: SourceFile, kind: "exam" | "solution") => {
    const path = kind === "exam" ? item.exam_pdf_path : item.solution_pdf_path;
    if (!path) {
      setErrorMessage(kind === "exam" ? "등록된 시험지 PDF가 없습니다." : "등록된 해설지 PDF가 없습니다.");
      return;
    }
    setPreviewLoading(`${item.id}:${kind}`);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/source-files/${encodeURIComponent(item.id)}/signed-urls`, { cache: "no-store" });
      const payload = await response.json() as { success?: boolean; examUrl?: string | null; solutionUrl?: string | null; message?: string };
      if (!response.ok || !payload.success) throw new Error(payload.message || "PDF 미리보기 주소를 만들지 못했습니다.");
      const url = kind === "exam" ? payload.examUrl : payload.solutionUrl;
      if (!url) throw new Error(kind === "exam" ? "시험지 PDF 주소가 없습니다." : "해설지 PDF 주소가 없습니다.");
      setPdfPreview({ title: `${item.title} · ${kind === "exam" ? "시험지" : "해설지"}`, url });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "PDF 미리보기를 열지 못했습니다.");
    } finally {
      setPreviewLoading(null);
    }
  };

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
        "id",
        "created_at",
        "title",
        "source",
        "grade",
        "subject",
        "storage_path",
        "hwp_path",
        "exam_pdf_path",
        "solution_pdf_path",
        "original_hwp_name",
        "exam_pdf_name",
        "solution_pdf_name",
        "page_count",
        "status",
        "error_message",
        "content_role",
        "training_course",
      ].join(",");
      const headers = { ...(await authHeaders()) };
      const [sourceResponse, analysisResponse, bankResponse] = await Promise.all([
        fetch(`${config.url}/rest/v1/source_files?select=${fields}&order=created_at.desc`, { headers, cache: "no-store" }),
        fetch(`${config.url}/rest/v1/source_analysis?select=source_file_id,status,progress,total_questions`, { headers, cache: "no-store" }),
        fetch(`${config.url}/rest/v1/problem_bank_questions?select=source_file_id,status`, { headers, cache: "no-store" }),
      ]);
      if (!sourceResponse.ok) throw new Error(await sourceResponse.text());
      const sourceRows = (await sourceResponse.json()) as SourceFile[];
      const analysisRows = analysisResponse.ok
        ? (await analysisResponse.json()) as Array<{ source_file_id: string; status: string; progress: number; total_questions: number }>
        : [];
      const bankRows = bankResponse.ok
        ? (await bankResponse.json()) as Array<{ source_file_id: string; status: string }>
        : [];

      const analysisMap = new Map(analysisRows.map((row) => [row.source_file_id, row]));
      const bankCountMap = new Map<string, number>();
      for (const row of bankRows) bankCountMap.set(row.source_file_id, (bankCountMap.get(row.source_file_id) || 0) + 1);

      setItems(sourceRows.map((row) => {
        const analysis = analysisMap.get(row.id);
        return {
          ...row,
          analysis_status: analysis?.status ?? null,
          analysis_progress: analysis?.progress ?? 0,
          analysis_total_questions: analysis?.total_questions ?? 0,
          bank_count: bankCountMap.get(row.id) ?? 0,
        };
      }));
    } catch (error) {
      setErrorMessage(
        `목록 조회 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const selectFile = (
    kind: UploadFileKind,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
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
    const valid =
      kind === "hwp"
        ? lowerName.endsWith(".hwp") ||
          lowerName.endsWith(".hwpx") ||
          lowerName.endsWith(".pdf")
        : selected.type === "application/pdf" || lowerName.endsWith(".pdf");

    if (!valid) {
      event.target.value = "";
      setErrorMessage(
        kind === "hwp"
          ? "원본 파일(.hwp, .hwpx 또는 .pdf)을 선택해 주세요."
          : "PDF 파일만 선택할 수 있습니다.",
      );
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
      if (!title.trim())
        setTitle(selected.name.replace(/\.pdf$/i, "").replace(/_시험지$/i, ""));
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
      formData.append("contentRole", contentRole);
      formData.append("hwpFile", hwpFile);
      formData.append("examPdf", examPdf);
      formData.append("solutionPdf", solutionPdf);

      const response = await fetch("/api/source-files/upload", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        success: boolean;
        message: string;
      };
      if (!response.ok || !result.success)
        throw new Error(result.message || "시험지 등록에 실패했습니다.");

      setMessage(result.message);
      setTitle("");
      setContentRole("TRAINING");
      setHwpFile(null);
      setExamPdf(null);
      setSolutionPdf(null);
      ["sos-hwp-file", "sos-exam-pdf", "sos-solution-pdf"].forEach((id) => {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (input) input.value = "";
      });
      await loadFiles();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "시험지 등록 중 오류가 발생했습니다.",
      );
    } finally {
      setUploading(false);
    }
  };

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
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

  const removeSource = async (item: SourceFile) => {
    const confirmation = window.prompt(
      `시험지 삭제는 되돌릴 수 없습니다.\n\n삭제할 시험지명:\n${item.title}\n\n계속하려면 시험지명을 똑같이 입력하세요.\n문제은행 등록 문항이 있으면 삭제가 자동 차단됩니다.`,
      "",
    );
    if (confirmation !== item.title) {
      if (confirmation !== null)
        setErrorMessage("시험지명이 일치하지 않아 삭제하지 않았습니다.");
      return;
    }
    setDeletingId(item.id);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/source-files/${item.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as {
        success: boolean;
        message?: string;
      };
      if (!response.ok || !result.success)
        throw new Error(result.message || "삭제에 실패했습니다.");
      if (editingId === item.id) setEditingId(null);
      setItems((current) =>
        current.filter((sourceItem) => sourceItem.id !== item.id),
      );
      setMessage("시험지 세트와 연결된 분석 자료를 삭제했습니다.");
    } catch (error) {
      setErrorMessage(
        `삭제 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      );
    } finally {
      setDeletingId(null);
    }
  };

  const prepareReplacementRefresh = async (item: SourceFile, kind: "exam" | "solution") => {
    const response = await fetch("/api/problem-bank/materialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceFileId: item.id, allowEmptyCrop: true }),
    });
    const payload = await response.json() as {
      success?: boolean;
      message?: string;
      analysisId?: string;
      questions?: RefreshQuestion[];
    };
    if (!response.ok || !payload.success || !payload.analysisId) {
      throw new Error(payload.message || "교체할 문항 목록을 불러오지 못했습니다.");
    }
    const questions = (payload.questions ?? []).sort((a, b) => a.question_no - b.question_no);
    setReplacementRefresh({
      sourceId: item.id,
      title: item.title,
      kind,
      analysisId: payload.analysisId,
      questions,
      selected: [],
      mode: "image",
    });
  };

  const replaceBundleFile = async (item: SourceFile, kind: UploadFileKind, file: File | null) => {
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const valid =
      kind === "hwp"
        ? lowerName.endsWith(".hwp") || lowerName.endsWith(".hwpx") || lowerName.endsWith(".pdf")
        : file.type === "application/pdf" || lowerName.endsWith(".pdf");

    if (!valid) {
      setErrorMessage(kind === "hwp" ? "원본은 HWP/HWPX/PDF만 교체할 수 있습니다." : "PDF 파일만 교체할 수 있습니다.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage("파일 크기는 50MB 이하여야 합니다.");
      return;
    }

    const label = kind === "hwp" ? "원본 파일" : kind === "exam" ? "문제 PDF" : "해설 PDF";
    if (!window.confirm(`${item.title}의 ${label}을 교체할까요?\n기존 시험지/문항 ID는 유지됩니다.`)) return;

    setReplacingFile({ id: item.id, kind });
    setReplacementRefresh(null);
    setMessage("");
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.append("kind", kind);
      formData.append("file", file);
      const response = await fetch(`/api/source-files/${encodeURIComponent(item.id)}/replace`, {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as { success?: boolean; message?: string };
      if (!response.ok || !result.success) throw new Error(result.message || `${label} 교체에 실패했습니다.`);
      await loadFiles();

      if (kind === "exam" || kind === "solution") {
        await prepareReplacementRefresh(item, kind);
        setMessage(`${label} 교체 완료 · 아래에서 다시 가져올 문항만 선택해 주세요.`);
      } else {
        setMessage(result.message || `${label}을 교체했습니다.`);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `${label} 교체에 실패했습니다.`);
    } finally {
      setReplacingFile(null);
    }
  };

  const applyReplacementRefresh = async () => {
    const refresh = replacementRefresh;
    if (!refresh || refresh.selected.length === 0) {
      setErrorMessage("다시 가져올 문항을 선택해 주세요.");
      return;
    }

    setRefreshingReplacement(true);
    setErrorMessage("");
    setMessage("");
    try {
      const signedResponse = await fetch(`/api/source-files/${encodeURIComponent(refresh.sourceId)}/signed-urls`, { cache: "no-store" });
      const signedPayload = await signedResponse.json() as { success?: boolean; examUrl?: string | null; solutionUrl?: string | null; message?: string };
      if (!signedResponse.ok || !signedPayload.success) throw new Error(signedPayload.message || "교체 PDF 주소를 만들지 못했습니다.");

      const selectedQuestions = refresh.questions.filter((question) => refresh.selected.includes(question.question_no));
      if (refresh.kind === "exam") {
        if (!signedPayload.examUrl) throw new Error("교체된 문제 PDF가 없습니다.");
        const pdf = await loadPdfDocument(signedPayload.examUrl);
        for (const question of selectedQuestions) {
          const pageNo = Number(question.page_no);
          const rect = {
            x: Number(question.crop_x),
            y: Number(question.crop_y),
            width: Number(question.crop_width),
            height: Number(question.crop_height),
          };
          if (!(pageNo >= 1) || !Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !(rect.width > 0) || !(rect.height > 0)) {
            throw new Error(`${question.question_no}번의 기존 Crop 좌표가 없어 자동 교체할 수 없습니다. AI 분석관리에서 먼저 Crop을 잡아 주세요.`);
          }
          const canvas = await renderPdfPage(pdf, pageNo);
          const blob = await cropCanvasToWebp(canvas, rect);
          const form = new FormData();
          form.append("image", blob, `${String(question.question_no).padStart(3, "0")}.webp`);
          form.append("analysisId", refresh.analysisId);
          form.append("sourceFileId", refresh.sourceId);
          form.append("questionId", question.id);
          form.append("questionNo", String(question.question_no));
          form.append("pageNo", String(pageNo));
          form.append("cropX", String(rect.x));
          form.append("cropY", String(rect.y));
          form.append("cropWidth", String(rect.width));
          form.append("cropHeight", String(rect.height));
          const upload = await fetch("/api/problem-bank/materialize", { method: "POST", body: form });
          const uploaded = await upload.json() as { success?: boolean; message?: string };
          if (!upload.ok || !uploaded.success) throw new Error(uploaded.message || `${question.question_no}번 이미지 교체 실패`);

          if (refresh.mode === "analysis") {
            const analyzed = await fetch(`/api/analysis/questions/${encodeURIComponent(question.id)}/analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ forceBankRefresh: true }),
            });
            const analyzedPayload = await analyzed.json() as { success?: boolean; message?: string };
            if (!analyzed.ok || !analyzedPayload.success) throw new Error(analyzedPayload.message || `${question.question_no}번 AI 재분석 실패`);
          }
        }

        if (refresh.mode === "analysis") {
          const registered = await fetch("/api/problem-bank/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ analysisId: refresh.analysisId, questionIds: selectedQuestions.map((question) => question.id) }),
          });
          const registeredPayload = await registered.json() as { success?: boolean; message?: string };
          if (!registered.ok || !registeredPayload.success) throw new Error(registeredPayload.message || "재분석 문항의 문제은행 갱신에 실패했습니다.");
        }
      } else {
        if (!signedPayload.solutionUrl) throw new Error("교체된 해설 PDF가 없습니다.");
        const pdf = await loadPdfDocument(signedPayload.solutionUrl);
        const anchors = await buildDocumentAnchors(pdf);
        if (!anchors.hasTextLayer) throw new Error("새 해설 PDF에서 문항번호 텍스트를 찾을 수 없습니다.");

        for (const question of selectedQuestions) {
          const anchor = anchors.byQuestionNo.get(Number(question.question_no));
          if (!anchor) throw new Error(`${question.question_no}번 해설 위치를 새 PDF에서 찾지 못했습니다.`);
          const canvas = await renderPdfPage(pdf, anchor.page);
          const top = Math.max(0, anchor.topPct - 0.45);
          const rect = {
            x: Math.max(0, anchor.columnLeftPct),
            y: top,
            width: Math.max(1, anchor.columnRightPct - anchor.columnLeftPct),
            height: Math.max(1, Math.min(100, anchor.bottomPct) - top),
          };
          const blob = await cropCanvasToWebp(canvas, rect);
          const form = new FormData();
          form.append("image", blob, `solution-${String(question.question_no).padStart(3, "0")}.webp`);
          form.append("analysisId", refresh.analysisId);
          form.append("sourceFileId", refresh.sourceId);
          form.append("questionId", question.id);
          form.append("questionNo", String(question.question_no));
          form.append("pageNo", String(anchor.page));
          const upload = await fetch("/api/problem-bank/materialize-solution", { method: "POST", body: form });
          const uploaded = await upload.json() as { success?: boolean; message?: string };
          if (!upload.ok || !uploaded.success) throw new Error(uploaded.message || `${question.question_no}번 해설 교체 실패`);
        }
      }

      setMessage(`${refresh.selected.join(", ")}번 ${refresh.kind === "exam" ? (refresh.mode === "analysis" ? "문제 이미지·AI 분석" : "문제 이미지") : "해설 이미지"} 갱신 완료`);
      setReplacementRefresh(null);
      await loadFiles();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "선택 문항 갱신에 실패했습니다.");
    } finally {
      setRefreshingReplacement(false);
    }
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
      const response = await fetch(
        `${config.url}/rest/v1/source_files?id=eq.${encodeURIComponent(editingId)}`,
        {
          method: "PATCH",
          headers: {
            ...(await authHeaders()),
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            title: editTitle.trim(),
            source: editSource.trim() || null,
            grade: editGrade,
            subject: editSubject,
          }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      setEditingId(null);
      setMessage("시험지 정보가 수정되었습니다.");
      await loadFiles();
    } catch (error) {
      setErrorMessage(
        `수정 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const allReady = Boolean(title.trim() && hwpFile && examPdf && solutionPdf);

  return (
    <>
      <section className="page-title-row">
        <div>
          <h2>AI 문제등록</h2>
          <p>
            원본(HWP/HWPX/PDF)·시험지 PDF·해설지 PDF를 한 세트로 등록합니다.
          </p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            window.location.href = "/problem-bank";
          }}
        >
          📚 문제은행 열기
        </button>
      </section>

      <form className="panel ai-upload-panel" onSubmit={uploadBundle}>
        <div className="training-role-selector">
          <div><b>등록 용도</b><span>분석 방식은 같고, SOS 추천에 사용할지 여부만 구분합니다.</span></div>
          <label className={contentRole === "TRAINING" ? "selected" : ""}><input type="radio" name="contentRoleView" checked={contentRole === "TRAINING"} onChange={() => setContentRole("TRAINING")} /><strong>훈련용 문항</strong><small>SOS 추천·배정 후보로 사용</small></label>
          <label className={contentRole === "REFERENCE" ? "selected" : ""}><input type="radio" name="contentRoleView" checked={contentRole === "REFERENCE"} onChange={() => setContentRole("REFERENCE")} /><strong>참고·보관용</strong><small>문제은행 보관, 자동 추천 제외</small></label>
        </div>
        <div className="ai-upload-grid four-fields">
          <label className="field">
            <span>시험지명</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: H11 다항식 훈련 01"
              disabled={uploading}
            />
          </label>
          <label className="field">
            <span>출처</span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="예: MATHPOOH 자체 제작"
              disabled={uploading}
            />
          </label>
          <label className="field">
            <span>학년</span>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              disabled={uploading}
            >
              <option>중1</option>
              <option>중2</option>
              <option>중3</option>
              <option>고1</option>
              <option>고2</option>
              <option>고3</option>
            </select>
          </label>
          <label className="field">
            <span>과목</span>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={uploading}
            >
              <option>중등수학</option>
              <option>공통수학1</option>
              <option>공통수학2</option>
              <option>대수</option>
              <option>미적분Ⅰ</option>
              <option>확률과 통계</option>
            </select>
          </label>
        </div>
        <div className="bundle-upload-grid">
          <label className={`bundle-drop-zone ${hwpFile ? "selected" : ""}`}>
            <input
              id="sos-hwp-file"
              type="file"
              accept=".hwp,.hwpx,.pdf,application/pdf"
              onChange={(e) => selectFile("hwp", e)}
              disabled={uploading}
            />
            <b>① 원본 파일</b>
            <strong>{hwpFile ? hwpFile.name : "HWP/HWPX/PDF 선택"}</strong>
            <span>
              {hwpFile
                ? `${(hwpFile.size / 1024 / 1024).toFixed(1)}MB`
                : "분석 기준 원본 파일"}
            </span>
          </label>
          <label className={`bundle-drop-zone ${examPdf ? "selected" : ""}`}>
            <input
              id="sos-exam-pdf"
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => selectFile("exam", e)}
              disabled={uploading}
            />
            <b>② 시험지 PDF</b>
            <strong>{examPdf ? examPdf.name : "시험지 PDF 선택"}</strong>
            <span>
              {examPdf
                ? `${(examPdf.size / 1024 / 1024).toFixed(1)}MB`
                : "문항 분리용 시험지"}
            </span>
          </label>
          <label
            className={`bundle-drop-zone ${solutionPdf ? "selected" : ""}`}
          >
            <input
              id="sos-solution-pdf"
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => selectFile("solution", e)}
              disabled={uploading}
            />
            <b>③ 해설지 PDF</b>
            <strong>
              {solutionPdf ? solutionPdf.name : "해설지 PDF 선택"}
            </strong>
            <span>
              {solutionPdf
                ? `${(solutionPdf.size / 1024 / 1024).toFixed(1)}MB`
                : "정답·해설 분석용"}
            </span>
          </label>
        </div>

        <div className="upload-ready-row">
          <span className={hwpFile ? "ready" : ""}>
            {hwpFile ? "✓" : "○"} 원본 파일
          </span>
          <span className={examPdf ? "ready" : ""}>
            {examPdf ? "✓" : "○"} 시험지 PDF
          </span>
          <span className={solutionPdf ? "ready" : ""}>
            {solutionPdf ? "✓" : "○"} 해설지 PDF
          </span>
        </div>

        {message ? (
          <div className="upload-message success">{message}</div>
        ) : null}
        {errorMessage ? (
          <div className="upload-message error">{errorMessage}</div>
        ) : null}
        <div className="ai-upload-actions">
          <button
            className="primary-button"
            type="submit"
            disabled={uploading || !allReady}
          >
            {uploading ? "3개 파일 등록 중..." : "시험지 세트 등록"}
          </button>
        </div>
      </form>

      <section className="panel source-file-panel">
        <div className="source-workflow-summary">
          {[
            { label: "신규", count: items.filter((item) => getSourceWorkflow(item).tone === "new").length, tone: "new" },
            { label: "분석중", count: items.filter((item) => getSourceWorkflow(item).tone === "running").length, tone: "running" },
            { label: "등록대기", count: items.filter((item) => getSourceWorkflow(item).tone === "review").length, tone: "review" },
            { label: "문제은행 등록완료", count: items.filter((item) => getSourceWorkflow(item).tone === "ready").length, tone: "ready" },
            { label: "분석오류", count: items.filter((item) => getSourceWorkflow(item).tone === "error").length, tone: "error" },
          ].map((stat) => (
            <div key={stat.label} className={`source-workflow-stat ${stat.tone}`}>
              <span>{stat.label}</span><strong>{stat.count}</strong>
            </div>
          ))}
        </div>
        <div className="source-file-title">
          <div>
            <strong>등록된 시험지 세트</strong>
            <span>총 {items.length}개</span>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadFiles()}
            disabled={loading}
          >
            새로고침
          </button>
        </div>
        {loading ? (
          <div className="source-file-empty">목록을 불러오는 중입니다.</div>
        ) : items.length === 0 ? (
          <div className="source-file-empty">등록된 시험지가 없습니다.</div>
        ) : (
          <div className="source-file-list">
            <div className="source-file-head">
              <span>등록일</span>
              <span>시험지명</span>
              <span>학년·과목</span>
              <span>파일 구성</span>
              <span>진행 상태</span>
              <span>관리</span>
            </div>
            {items.map((item) =>
              editingId === item.id ? (
                <div className="source-file-edit-row" key={item.id}>
                  <div className="source-file-edit-grid">
                    <label className="field">
                      <span>시험지명</span>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        disabled={savingEdit}
                      />
                    </label>
                    <label className="field">
                      <span>출처</span>
                      <input
                        value={editSource}
                        onChange={(e) => setEditSource(e.target.value)}
                        disabled={savingEdit}
                      />
                    </label>
                    <label className="field">
                      <span>학년</span>
                      <select
                        value={editGrade}
                        onChange={(e) => setEditGrade(e.target.value)}
                        disabled={savingEdit}
                      >
                        <option>중1</option>
                        <option>중2</option>
                        <option>중3</option>
                        <option>고1</option>
                        <option>고2</option>
                        <option>고3</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>과목</span>
                      <select
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        disabled={savingEdit}
                      >
                        <option>중등수학</option>
                        <option>공통수학1</option>
                        <option>공통수학2</option>
                        <option>대수</option>
                        <option>미적분Ⅰ</option>
                        <option>확률과 통계</option>
                      </select>
                    </label>
                  </div>
                  <div className="source-file-replace-box">
                    <strong>원본 파일 관리</strong>
                    <span>파일을 교체해도 기존 시험지·문항 ID는 유지됩니다. 문제/해설 PDF 교체 후 필요한 문항만 다시 가져올 수 있습니다.</span>
                    <div className="source-file-replace-grid">
                      {[
                        { kind: "hwp" as UploadFileKind, label: "원본 HWP/PDF 교체", accept: ".hwp,.hwpx,.pdf" },
                        { kind: "exam" as UploadFileKind, label: "문제 PDF 교체", accept: ".pdf,application/pdf" },
                        { kind: "solution" as UploadFileKind, label: "해설 PDF 교체", accept: ".pdf,application/pdf" },
                      ].map((entry) => (
                        <label key={entry.kind} className="source-replace-button">
                          {replacingFile?.id === item.id && replacingFile.kind === entry.kind ? "교체 중..." : entry.label}
                          <input
                            type="file"
                            accept={entry.accept}
                            disabled={Boolean(replacingFile) || refreshingReplacement}
                            onChange={(event) => {
                              const file = event.target.files?.[0] ?? null;
                              void replaceBundleFile(item, entry.kind, file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      ))}
                    </div>

                    {replacementRefresh?.sourceId === item.id ? (
                      <div className="replacement-refresh-panel">
                        <div className="replacement-refresh-head">
                          <div>
                            <b>{replacementRefresh.kind === "exam" ? "새 문제 PDF에서 다시 가져오기" : "새 해설 PDF에서 다시 가져오기"}</b>
                            <span>수정한 문항만 선택하면 나머지 문제은행 데이터는 건드리지 않습니다.</span>
                          </div>
                          <button type="button" onClick={() => setReplacementRefresh(null)} disabled={refreshingReplacement}>닫기</button>
                        </div>
                        <div className="replacement-question-tools">
                          <button
                            type="button"
                            onClick={() => setReplacementRefresh((current) => current ? { ...current, selected: current.questions.map((question) => question.question_no) } : current)}
                            disabled={refreshingReplacement}
                          >전체 선택</button>
                          <button
                            type="button"
                            onClick={() => setReplacementRefresh((current) => current ? { ...current, selected: [] } : current)}
                            disabled={refreshingReplacement}
                          >선택 해제</button>
                          <span>선택 {replacementRefresh.selected.length}문항</span>
                        </div>
                        <div className="replacement-question-grid">
                          {replacementRefresh.questions.map((question) => {
                            const checked = replacementRefresh.selected.includes(question.question_no);
                            return (
                              <button
                                type="button"
                                key={question.id}
                                className={checked ? "selected" : ""}
                                disabled={refreshingReplacement}
                                onClick={() => setReplacementRefresh((current) => current ? {
                                  ...current,
                                  selected: checked
                                    ? current.selected.filter((no) => no !== question.question_no)
                                    : [...current.selected, question.question_no].sort((a, b) => a - b),
                                } : current)}
                              >{question.question_no}</button>
                            );
                          })}
                        </div>
                        {replacementRefresh.kind === "exam" ? (
                          <div className="replacement-mode-grid">
                            <label className={replacementRefresh.mode === "image" ? "selected" : ""}>
                              <input type="radio" checked={replacementRefresh.mode === "image"} onChange={() => setReplacementRefresh((current) => current ? { ...current, mode: "image" } : current)} />
                              <b>이미지만 교체</b>
                              <span>오타·수식·그림 수정용 · 기존 정답/단원/유형/DNA 유지</span>
                            </label>
                            <label className={replacementRefresh.mode === "analysis" ? "selected" : ""}>
                              <input type="radio" checked={replacementRefresh.mode === "analysis"} onChange={() => setReplacementRefresh((current) => current ? { ...current, mode: "analysis" } : current)} />
                              <b>이미지 + AI 분석 갱신</b>
                              <span>문제 내용 자체가 바뀐 경우 · 선택 문항만 다시 분석</span>
                            </label>
                          </div>
                        ) : (
                          <div className="replacement-solution-note">선택한 문항의 해설 이미지만 새 해설 PDF에서 다시 가져옵니다.</div>
                        )}
                        <div className="replacement-refresh-actions">
                          <small>{replacementRefresh.selected.length ? `${replacementRefresh.selected.join(", ")}번만 갱신됩니다.` : "갱신할 문항을 선택해 주세요."}</small>
                          <button className="primary-button" type="button" onClick={() => void applyReplacementRefresh()} disabled={refreshingReplacement || replacementRefresh.selected.length === 0}>
                            {refreshingReplacement ? "선택 문항 갱신 중..." : `${replacementRefresh.selected.length || "선택"}문항 적용`}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="source-file-edit-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={cancelEdit}
                      disabled={savingEdit}
                    >
                      취소
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void saveEdit()}
                      disabled={savingEdit}
                    >
                      {savingEdit ? "저장 중..." : "수정 저장"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="source-file-row bundle-row" key={item.id}>
                  <span>{formatDate(item.created_at)}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.source || "-"}</small>
                    <small className={`source-purpose ${item.content_role === "REFERENCE" ? "reference" : "training"}`}>{item.content_role === "REFERENCE" ? "참고·보관용" : "훈련용 문항"}</small>
                  </div>
                  <span>
                    {[item.grade, item.subject].filter(Boolean).join(" · ") ||
                      "-"}
                  </span>
                  <div className="file-badges">
                    <span className={item.hwp_path ? "ok" : "missing"}>HWP</span>
                    <button
                      type="button"
                      className={`${item.exam_pdf_path ? "ok" : "missing"} source-pdf-preview-button`}
                      disabled={!item.exam_pdf_path || previewLoading === `${item.id}:exam`}
                      onClick={() => void openSourcePdfPreview(item, "exam")}
                      title={item.exam_pdf_path ? "시험지 PDF 미리보기" : "시험지 PDF 없음"}
                    >
                      {previewLoading === `${item.id}:exam` ? "여는 중" : "시험지"}
                    </button>
                    <button
                      type="button"
                      className={`${item.solution_pdf_path ? "ok" : "missing"} source-pdf-preview-button`}
                      disabled={!item.solution_pdf_path || previewLoading === `${item.id}:solution`}
                      onClick={() => void openSourcePdfPreview(item, "solution")}
                      title={item.solution_pdf_path ? "해설지 PDF 미리보기" : "해설지 PDF 없음"}
                    >
                      {previewLoading === `${item.id}:solution` ? "여는 중" : "해설지"}
                    </button>
                  </div>
                  {(() => {
                    const workflow = getSourceWorkflow(item);
                    return (
                      <div className={`source-workflow-badge ${workflow.tone}`}>
                        <strong>{workflow.label}</strong>
                        <small>{workflow.detail}</small>
                      </div>
                    );
                  })()}
                  <div className="source-action-buttons">
                    <button
                      className="analysis-open-button"
                      type="button"
                      onClick={() => onOpenAnalysis(item.id)}
                    >
                      AI 분석
                    </button>
                    <button
                      className="source-edit-button"
                      type="button"
                      onClick={() => startEdit(item)}
                      disabled={deletingId === item.id}
                    >
                      수정
                    </button>
                    <button
                      className="source-delete-button"
                      type="button"
                      onClick={() => void removeSource(item)}
                      disabled={deletingId === item.id}
                    >
                      {deletingId === item.id ? "삭제 중" : "삭제"}
                    </button>
                  </div>
                  {item.error_message ? (
                    <small className="bundle-error">{item.error_message}</small>
                  ) : null}
                </div>
              ),
            )}
          </div>
        )}
      </section>

      {pdfPreview ? (
        <div className="source-pdf-preview-backdrop" onMouseDown={() => setPdfPreview(null)}>
          <section className="source-pdf-preview-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><small>MATHPOOH SOS · PDF PREVIEW</small><strong>{pdfPreview.title}</strong></div>
              <div className="source-pdf-preview-actions">
                <button type="button" onClick={() => window.open(pdfPreview.url, "_blank", "noopener,noreferrer")}>새 창 열기</button>
                <button type="button" className="close" onClick={() => setPdfPreview(null)}>닫기 ×</button>
              </div>
            </header>
            <div className="source-pdf-preview-frame">
              <iframe src={`${pdfPreview.url}#view=FitH&toolbar=1&navpanes=0`} title={pdfPreview.title} />
            </div>
            <footer>PDF 상단 도구에서 페이지 이동 · 확대/축소 · 인쇄를 사용할 수 있습니다.</footer>
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        .file-badges .source-pdf-preview-button{border:0;font:inherit;cursor:pointer;transition:.16s ease;line-height:1}
        .file-badges .source-pdf-preview-button.ok:hover{transform:translateY(-1px);box-shadow:0 4px 10px rgba(39,104,55,.16);filter:saturate(1.15)}
        .file-badges .source-pdf-preview-button:disabled{cursor:default;transform:none;box-shadow:none}
        .source-pdf-preview-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.62);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px}
        .source-pdf-preview-modal{width:min(1180px,96vw);height:min(900px,94vh);background:#fff;border-radius:22px;box-shadow:0 30px 90px rgba(0,0,0,.28);overflow:hidden;display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.55)}
        .source-pdf-preview-modal header{min-height:74px;padding:14px 18px 14px 22px;display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:1px solid #e6eaf0;background:linear-gradient(90deg,#f8fbf8,#fff)}
        .source-pdf-preview-modal header>div:first-child{min-width:0;display:flex;flex-direction:column;gap:4px}
        .source-pdf-preview-modal header small{font-size:11px;font-weight:800;letter-spacing:.08em;color:#6d8a73}
        .source-pdf-preview-modal header strong{font-size:16px;color:#17351f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .source-pdf-preview-actions{display:flex;gap:8px;flex:0 0 auto}
        .source-pdf-preview-actions button{height:40px;padding:0 15px;border-radius:10px;border:1px solid #d8e0da;background:#fff;color:#285f35;font-weight:800;cursor:pointer}
        .source-pdf-preview-actions button:hover{background:#f1f7f2}
        .source-pdf-preview-actions .close{background:#2f6d3b;color:#fff;border-color:#2f6d3b}
        .source-pdf-preview-frame{flex:1;min-height:0;background:#e9edf1;padding:10px}
        .source-pdf-preview-frame iframe{width:100%;height:100%;border:0;border-radius:10px;background:#fff}
        .source-pdf-preview-modal footer{padding:9px 18px;text-align:center;font-size:11px;color:#788397;background:#fafbfc;border-top:1px solid #e6eaf0}
        @media(max-width:760px){.source-pdf-preview-backdrop{padding:8px}.source-pdf-preview-modal{width:100%;height:96vh;border-radius:14px}.source-pdf-preview-modal header{align-items:flex-start;flex-direction:column}.source-pdf-preview-actions{width:100%}.source-pdf-preview-actions button{flex:1}}
      `}</style>
    </>
  );
}

function ComingSoon({
  title,
  onMove,
}: {
  title: string;
  onMove: (menu: AdminMenu) => void;
}) {
  return (
    <section className="empty-page">
      <div className="empty-icon">✦</div>
      <h2>{title}</h2>
      <p>학생관리 다음 단계에서 실제 운영 기능을 연결합니다.</p>
      <button className="primary-button" onClick={() => onMove("students")}>
        학생 관리로 돌아가기
      </button>
    </section>
  );
}
function MiniStat({
  label,
  value,
  note,
  emphasis = false,
}: {
  label: string;
  value: string;
  note: string;
  emphasis?: boolean;
}) {
  return (
    <article className={`mini-stat ${emphasis ? "emphasis" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Status({ text }: { text: string }) {
  const tone = ["정상", "분석완료", "등록완료"].includes(text)
    ? "green"
    : ["훈련중"].includes(text)
      ? "blue"
      : ["진단대기", "작성중"].includes(text)
        ? "orange"
        : ["퇴원"].includes(text)
          ? "red"
          : "gray";
  return <span className={`pill ${tone}`}>{text}</span>;
}
