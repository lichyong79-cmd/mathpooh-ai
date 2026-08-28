"use client";

import { ReactNode, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./admin-portal-sidebar.module.css";

type CurrentMenu =
  | "dashboard" | "posters" | "students" | "applications"
  | "exam-list" | "exam-input" | "exam-analysis" | "exam-assignment"
  | "exam-progress" | "problem-sources" | "problem-analysis"
  | "ai-generated-bank" | "sos-bank" | "sos-difficulty" | "sos-learning" | "sos-status" | "exam-results"
  | "student-results" | "learning-analysis";

type Item = { id: CurrentMenu; label: string; icon: string; href?: string };

const groups: { label: string; items: Item[] }[] = [
  { label: "기본 운영", items: [
    { id: "dashboard", label: "대시보드", icon: "⌂" },
    { id: "posters", label: "포스터 관리", icon: "▧" },
    { id: "students", label: "학생정보 관리", icon: "♙" },
    { id: "applications", label: "신청 관리", icon: "✓" },
  ] },
  { label: "실전모의고사 관리", items: [
    { id: "exam-list", label: "시험지 목록", icon: "▤" },
    { id: "exam-input", label: "시험지 입력", icon: "+" },
    { id: "exam-analysis", label: "AI 분석", icon: "✦" },
    { id: "exam-assignment", label: "시험지 배정", icon: "↗" },
  ] },
  { label: "시험 운영", items: [
    { id: "exam-progress", label: "실전모의고사 진행", icon: "▶" },
  ] },
  { label: "문제은행 관리", items: [
    { id: "problem-sources", label: "문제등록", icon: "▦" },
    { id: "problem-analysis", label: "AI 분석", icon: "✦", href: "/problem-bank/ai-upload" },
  ] },
  { label: "SOS 운영", items: [
    { id: "ai-generated-bank", label: "AI 생성 문제은행", icon: "✦", href: "/admin/ai-generated-bank" },
    { id: "sos-bank", label: "SOS 문제은행", icon: "▣", href: "/problem-bank" },
    { id: "sos-difficulty", label: "난이도 관리", icon: "◆", href: "/problem-bank/difficulty" },
    { id: "sos-learning", label: "SOS 학습운영", icon: "◎" },
    { id: "sos-status", label: "SOS 학습현황", icon: "▤", href: "/admin/sos-status" },
  ] },
  { label: "분석", items: [
    { id: "exam-results", label: "시험성적 분석", icon: "▥" },
    { id: "student-results", label: "학생성적 분석", icon: "↗" },
    { id: "learning-analysis", label: "학생학습 분석", icon: "◫" },
  ] },
];

export default function AdminPortalShell({ current, children, defaultCollapsed = false }: { current: CurrentMenu; children: ReactNode; defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    const saved = window.localStorage.getItem("mathpooh-admin-sidebar-collapsed");
    if (saved != null) setCollapsed(saved === "1");
  }, []);

  const toggle = () => setCollapsed((value) => {
    window.localStorage.setItem("mathpooh-admin-sidebar-collapsed", value ? "0" : "1");
    return !value;
  });

  const [mobileOpen, setMobileOpen] = useState(false);
  // SOS306: 막힌 AI 생성 작업을 관리자 화면 어디에서든 알려준다.
  const [stuck, setStuck] = useState<{ stuck: number; students: number; names: string[] } | null>(null);
  const [email, setEmail] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await createClient().auth.getUser();
        if (alive) setEmail(data.user?.email?.split("@")[0] ?? "");
      } catch { /* 프록시가 이미 막으므로 무시합니다. */ }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/admin/stuck-jobs", { cache: "no-store" });
        const data = await res.json();
        if (alive && data?.success) setStuck(data);
      } catch { /* 배지는 부가 기능이라 실패해도 무시한다 */ }
    };
    void check();
    // 5분마다, 탭이 화면에 보일 때만 확인한다.
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void check(); }, 300000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    try { await createClient().auth.signOut(); }
    finally { window.location.href = "/auth/signout"; }  // 서버 쿠키까지 확실히 지운다
  };

  const hrefOf = (item: Item) => item.href ?? `/admin?menu=${encodeURIComponent(item.id)}`;

  return <div className={`${styles.shell} ${collapsed ? styles.collapsed : ""} ${mobileOpen ? styles.mobileOpen : ""}`}>
    {/* SOS283: 모바일 세로 화면에서 사이드바가 78px 아이콘 막대로만 남고 라벨이 사라져
        아이콘만으로는 메뉴를 구분할 수 없었다(같은 기호가 여러 번 쓰인다).
        게다가 접힌 상태에서 footer가 숨겨져 로그아웃 버튼까지 사라졌다.
        모바일에서는 서랍(drawer) 방식으로 바꾼다. */}
    <button type="button" className={styles.hamburger} onClick={() => setMobileOpen(true)} aria-label="메뉴 열기">☰</button>
    <div className={styles.backdrop} onClick={() => setMobileOpen(false)} aria-hidden="true" />
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <img src="/mathpooh-logo.png" alt="MATHPOOH" />
        <div className={styles.brandCopy}><strong>MATHPOOH SOS</strong><span>SCORE OPTIMIZATION SYSTEM</span></div>
        <button className={styles.collapse} type="button" onClick={toggle} aria-label={collapsed ? "메뉴 펼치기" : "메뉴 접기"}>{collapsed ? "›" : "‹"}</button>
        <button className={styles.closeDrawer} type="button" onClick={() => setMobileOpen(false)} aria-label="메뉴 닫기">✕</button>
      </div>
      <div className={styles.workspace}><b>매</b><div><strong>MATHPOOH</strong><span>관리자 워크스페이스</span></div></div>
      <nav className={styles.nav}>
        {groups.map((group) => <section className={`${styles.group} ${group.items.length > 1 ? styles.nested : ""}`} key={group.label}>
          <p className={styles.groupTitle}>{group.label}</p>
          {group.items.map((item) => <a className={`${styles.item} ${current === item.id ? styles.active : ""}`} href={hrefOf(item)} key={item.id} title={item.label} onClick={() => setMobileOpen(false)}>
            <i className={styles.icon}>{item.icon}</i><span className={styles.label}>{item.label}</span>
          </a>)}
        </section>)}
      </nav>
      {/* SOS282: 로그아웃이 /admin 사이드바에만 있어서, 문제은행·난이도 화면에서는
          주소를 직접 쳐야 했다. 권한 문제로 잠겼을 때 나갈 길이 필요하다. */}
      <div className={styles.footer}>
        <strong>{email || "MATHPOOH SOS 관리자"}</strong>
        <span>통합 관리 메뉴</span>
        <button type="button" className={styles.signout} onClick={signOut} disabled={signingOut} title="로그아웃">
          {signingOut ? "로그아웃 중..." : "⏻ 로그아웃"}
        </button>
      </div>
    </aside>
    <div className={styles.content}>
      {stuck && stuck.stuck > 0 ? <a className={styles.stuckBar} href="/admin/ai-generated-bank">
        <b>⚠ 막힌 AI 생성 작업 {stuck.stuck}건</b>
        <span>{stuck.students ? `학생 ${stuck.students}명 대기 중${stuck.names.length ? ` · ${stuck.names.join(", ")}` : ""}` : "확인이 필요합니다"}</span>
        <em>보러 가기 →</em>
      </a> : null}
      {children}
    </div>
  </div>;
}

