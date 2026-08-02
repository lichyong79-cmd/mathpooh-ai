"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import "./login.css";

type LoginMode = "student" | "parent" | "admin";

const modeInfo = {
  student: {
    tab: "학생 로그인",
    eyebrow: "STUDENT",
    title: "오늘의 성장을 시작합니다",
    lead: "본인 전화번호와 비밀번호로 로그인하세요.",
    idLabel: "학생 전화번호",
    idPlaceholder: "01012345678",
    help: "초기 비밀번호는 전화번호 뒤 4자리이며, 로그인 후 변경할 수 있습니다.",
  },
  parent: {
    tab: "학부모 로그인",
    eyebrow: "PARENT",
    title: "자녀의 성장을 확인합니다",
    lead: "등록된 학부모 전화번호와 비밀번호를 입력하세요.",
    idLabel: "학부모 전화번호",
    idPlaceholder: "01012345678",
    help: "학부모 계정은 관리자에게 등록을 요청해 주세요.",
  },
  admin: {
    tab: "관리자 로그인",
    eyebrow: "ADMIN",
    title: "SOS 관리 시스템",
    lead: "관리자 이메일과 비밀번호를 입력하세요.",
    idLabel: "관리자 이메일",
    idPlaceholder: "admin@mathpooh.com",
    help: "관리 권한이 등록된 계정만 접속할 수 있습니다.",
  },
} as const;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [nextPath, setNextPath] = useState("/");
  const [loginMode, setLoginMode] = useState<LoginMode>("student");

  useEffect(() => {
    const pathname = window.location.pathname;
    setLoginMode(pathname === "/admin/login" ? "admin" : pathname === "/parent-login" ? "parent" : "student");
    const raw = new URLSearchParams(window.location.search).get("next");
    if (raw && raw.startsWith("/") && !raw.startsWith("//")) setNextPath(raw);
  }, []);

  const changeMode = (mode: LoginMode) => {
    setLoginMode(mode);
    setEmail("");
    setPassword("");
    setError("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return setError("아이디와 비밀번호를 입력해 주세요.");

    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const rawId = email.trim();
      const phone = rawId.replace(/\D/g, "");
      if ((loginMode === "student" || loginMode === "parent") && !/^\d{10,11}$/.test(phone)) {
        setError(`${loginMode === "student" ? "학생" : "학부모"} 전화번호를 정확히 입력해 주세요.`);
        return;
      }
      if (loginMode === "admin" && !rawId.includes("@")) {
        setError("관리자 이메일을 입력해 주세요.");
        return;
      }
      const loginEmail = loginMode === "student" ? `${phone}@student.matspu.local` : loginMode === "parent" ? `${phone}@parent.matspu.local` : rawId;
      const loginPassword = loginMode !== "admin" && /^\d{4}$/.test(password) ? `Mp!${password}` : password;
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });

      if (signInError) {
        setError(signInError.message === "Invalid login credentials" ? "아이디 또는 비밀번호가 올바르지 않습니다." : signInError.message);
        return;
      }

      const role = data.user?.user_metadata?.role;
      if (loginMode === "student" && role !== "student") { await supabase.auth.signOut(); setError("학생 계정으로 로그인해 주세요."); return; }
      if (loginMode === "parent" && role !== "parent") { await supabase.auth.signOut(); setError("학부모 계정으로 로그인해 주세요."); return; }
      if (loginMode === "admin" && (role === "student" || role === "parent")) { await supabase.auth.signOut(); setError("관리자 계정으로 로그인해 주세요."); return; }
      window.location.href = role === "student" ? "/" : role === "parent" ? "/p" : (nextPath === "/" ? "/admin" : nextPath);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const info = modeInfo[loginMode];

  return (
    <main className="mp-login-page">
      <section className="mp-login-shell">
        <aside className="mp-brand-panel">
          <div className="mp-wordmark">
            <span className="mp-mark"><i>m</i><b>+</b></span>
            <div><strong>MATHPOOH</strong><em>매쓰푸 수학연구소</em></div>
          </div>
          <div className="mp-brand-copy">
            <small>SCORE OPTIMIZATION SYSTEM</small>
            <h1>점수는 우연이 아니라<br />정확한 훈련의 결과입니다.</h1>
            <p>진단부터 훈련, 실전까지 학생의 모든 학습 흐름을 하나로 연결합니다.</p>
          </div>
          <div className="mp-brand-footer"><b>SOS</b><span>Analyze · Train · Improve</span></div>
        </aside>

        <form onSubmit={submit} className="mp-login-card">
          <div className="mp-mobile-wordmark">
            <span className="mp-mark"><i>m</i><b>+</b></span>
            <div><strong>MATHPOOH</strong><em>매쓰푸</em></div>
          </div>

          <nav className="mp-role-tabs" aria-label="로그인 종류 선택">
            {(Object.keys(modeInfo) as LoginMode[]).map((mode) => (
              <button type="button" key={mode} className={loginMode === mode ? "active" : ""} onClick={() => changeMode(mode)}>{modeInfo[mode].tab}</button>
            ))}
          </nav>

          <div className="mp-login-heading">
            <small>{info.eyebrow} LOGIN</small>
            <h2>{info.title}</h2>
            <p>{info.lead}</p>
          </div>

          <label className="mp-login-field">
            <span>{info.idLabel}</span>
            <input type={loginMode === "admin" ? "email" : "tel"} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={info.idPlaceholder} autoComplete="username" autoFocus />
          </label>

          <label className="mp-login-field">
            <span>비밀번호</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호를 입력하세요" autoComplete="current-password" />
          </label>

          {error ? <div className="mp-login-error">{error}</div> : null}

          <button type="submit" disabled={loading} className="mp-login-submit">
            {loading ? <><i className="mp-spinner" /> 로그인 확인 중</> : <>{info.tab} <span>→</span></>}
          </button>

          <p className="mp-login-help">{info.help}</p>
          <div className="mp-login-copyright">© MATHPOOH. All rights reserved.</div>
        </form>
      </section>
    </main>
  );
}
