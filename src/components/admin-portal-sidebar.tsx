"use client";

import { ReactNode, useEffect, useState } from "react";
import styles from "./admin-portal-sidebar.module.css";

type CurrentMenu =
  | "dashboard" | "posters" | "students" | "applications"
  | "exam-list" | "exam-input" | "exam-analysis" | "exam-assignment"
  | "exam-progress" | "problem-sources" | "problem-analysis"
  | "sos-bank" | "sos-learning" | "exam-results"
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
    { id: "sos-bank", label: "SOS 문제은행", icon: "▣", href: "/problem-bank" },
    { id: "sos-learning", label: "SOS 학습관리", icon: "◎" },
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

  const hrefOf = (item: Item) => item.href ?? `/admin?menu=${encodeURIComponent(item.id)}`;

  return <div className={`${styles.shell} ${collapsed ? styles.collapsed : ""}`}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <img src="/mathpooh-logo.png" alt="MATHPOOH" />
        <div className={styles.brandCopy}><strong>MATHPOOH SOS</strong><span>SCORE OPTIMIZATION SYSTEM</span></div>
        <button className={styles.collapse} type="button" onClick={toggle} aria-label={collapsed ? "메뉴 펼치기" : "메뉴 접기"}>{collapsed ? "›" : "‹"}</button>
      </div>
      <div className={styles.workspace}><b>매</b><div><strong>MATHPOOH</strong><span>관리자 워크스페이스</span></div></div>
      <nav className={styles.nav}>
        {groups.map((group) => <section className={`${styles.group} ${group.items.length > 1 ? styles.nested : ""}`} key={group.label}>
          <p className={styles.groupTitle}>{group.label}</p>
          {group.items.map((item) => <a className={`${styles.item} ${current === item.id ? styles.active : ""}`} href={hrefOf(item)} key={item.id} title={item.label}>
            <i className={styles.icon}>{item.icon}</i><span className={styles.label}>{item.label}</span>
          </a>)}
        </section>)}
      </nav>
      <div className={styles.footer}><strong>MATHPOOH SOS 관리자</strong><span>통합 관리 메뉴</span></div>
    </aside>
    <div className={styles.content}>{children}</div>
  </div>;
}

