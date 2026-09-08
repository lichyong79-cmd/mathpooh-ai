import type { ReactNode } from "react";
import { BUSINESS } from "@/lib/legal";

/** SOS323 · 이용약관·개인정보처리방침 공통 레이아웃. 로그인 없이 볼 수 있어야 합니다. */
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="legal">
      <header>
        <a href="/" className="home">← {BUSINESS.service}</a>
        <h1>{title}</h1>
        <p>시행일 {updated}</p>
      </header>

      <article>{children}</article>

      <footer>
        <div>
          <b>{BUSINESS.name}</b>
          <span>대표 {BUSINESS.owner}</span>
        </div>
        <div>
          <span>사업자등록번호 {BUSINESS.registrationNo}</span>
          <span>통신판매업신고 {BUSINESS.mailOrderNo}</span>
        </div>
        <div>
          <span>{BUSINESS.address}</span>
          <span>{BUSINESS.phone} · {BUSINESS.email}</span>
        </div>
        <nav>
          <a href="/terms">이용약관</a>
          <a href="/privacy">개인정보처리방침</a>
        </nav>
      </footer>

      <style>{`
        .legal{max-width:860px;margin:0 auto;padding:34px 20px 70px;font-family:Arial,'Noto Sans KR',sans-serif;color:#2b3a31;line-height:1.8}
        .legal header{border-bottom:2px solid #2f6937;padding-bottom:16px;margin-bottom:26px}
        .legal .home{display:inline-block;margin-bottom:12px;color:#2f6937;font-weight:800;font-size:13px;text-decoration:none}
        .legal h1{margin:0;font-size:27px;color:#1f4a27}
        .legal header p{margin:6px 0 0;font-size:13px;color:#71807a}
        .legal h2{margin:32px 0 10px;font-size:18px;color:#1f4a27;border-left:4px solid #cfe3d7;padding-left:10px}
        .legal h3{margin:20px 0 6px;font-size:15px;color:#2b5a38}
        .legal p{margin:0 0 10px;font-size:15px}
        .legal ul,.legal ol{margin:0 0 12px;padding-left:20px;font-size:15px}
        .legal li{margin-bottom:5px}
        .legal table{width:100%;border-collapse:collapse;margin:10px 0 16px;font-size:13.5px}
        .legal th,.legal td{border:1px solid #dde5e0;padding:9px 10px;text-align:left;vertical-align:top}
        .legal th{background:#f2f7f4;font-weight:800;white-space:nowrap}
        .legal .note{background:#f7faf8;border:1px solid #dde7e1;border-radius:10px;padding:14px 16px;margin:14px 0;font-size:14px}
        .legal footer{margin-top:48px;padding-top:20px;border-top:1px solid #e2e9e5;display:flex;flex-direction:column;gap:5px;font-size:12.5px;color:#71807a}
        .legal footer div{display:flex;gap:12px;flex-wrap:wrap}
        .legal footer b{color:#2b3a31}
        .legal footer nav{display:flex;gap:14px;margin-top:8px}
        .legal footer nav a{color:#2f6937;font-weight:800;text-decoration:none}
        @media(max-width:640px){.legal{padding:22px 16px 50px}.legal h1{font-size:22px}}
      `}</style>
    </main>
  );
}
