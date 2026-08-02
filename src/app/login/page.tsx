"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [nextPath, setNextPath] = useState("/");
  const [studentLoginPage, setStudentLoginPage] = useState(false);

  // useSearchParams 대신 직접 읽어 Suspense 경계 요구를 피합니다.
  useEffect(() => {
    setStudentLoginPage(window.location.pathname === "/student-login");
    const raw = new URLSearchParams(window.location.search).get("next");
    // 외부 사이트로 튕기는 open redirect를 막습니다.
    if (raw && raw.startsWith("/") && !raw.startsWith("//")) setNextPath(raw);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return setError("아이디와 비밀번호를 입력해 주세요.");

    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const rawId = email.trim();
      const phone = rawId.replace(/\D/g, "");
      const loginEmail = rawId.includes("@") ? rawId : `${phone}@student.matspu.local`;
      const loginPassword = !rawId.includes("@") && /^\d{4}$/.test(password) ? `Mp!${password}` : password;
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (signInError) {
        setError(
          signInError.message === "Invalid login credentials"
            ? "아이디 또는 비밀번호가 올바르지 않습니다."
            : signInError.message
        );
        return;
      }

      // 미들웨어가 쿠키를 다시 읽도록 전체 새로고침으로 이동합니다.
      const role = data.user?.user_metadata?.role;
      if (studentLoginPage && role !== "student") { await supabase.auth.signOut(); setError("학생 계정으로 로그인해 주세요."); return; }
      window.location.href = role === "student" ? "/" : (nextPath === "/" ? "/admin" : nextPath);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={styles.page}>
      <form onSubmit={submit} style={styles.card}>
        <div style={styles.brandRow}>
          <div style={styles.logo}>S</div>
          <div>
            <strong style={styles.brandName}>SOS</strong>
            <div style={styles.brandSub}>Score Optimization System</div>
          </div>
        </div>

        <h1 style={styles.title}>{studentLoginPage ? "학생 로그인" : "SOS 로그인"}</h1>
        <p style={styles.lead}>{studentLoginPage ? "본인 전화번호와 초기 비밀번호 뒤 4자리를 입력하세요." : "학생은 본인 전화번호를 아이디로 입력하세요."}</p>

        <label style={styles.label}>
          아이디 · 전화번호
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoFocus
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={styles.input}
          />
        </label>

        {error ? <div style={styles.error}>{error}</div> : null}

        <button type="submit" disabled={loading} style={{ ...styles.button, opacity: loading ? 0.6 : 1 }}>
          {loading ? "확인 중..." : "로그인"}
        </button>

        <p style={styles.help}>
          학생 초기 비밀번호는 전화번호 뒤 4자리입니다.
        </p>
      </form>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "var(--bg, #f4f6fa)",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    background: "#fff",
    border: "1px solid var(--line, #e5e8f0)",
    borderRadius: 16,
    padding: "30px 28px 24px",
    display: "grid",
    gap: 14,
    boxShadow: "0 18px 44px rgba(29,39,68,.10)",
  },
  brandRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: "linear-gradient(135deg,#6679ff,#9d75ef)",
    display: "grid",
    placeItems: "center",
    color: "#fff",
    fontWeight: 900,
    fontSize: 17,
  },
  brandName: { fontSize: 16, color: "var(--navy, #1d2744)", letterSpacing: ".04em" },
  brandSub: { fontSize: 10, color: "var(--muted, #8b93a7)", marginTop: 2 },
  title: { margin: "6px 0 0", fontSize: 19, color: "var(--text, #20263a)" },
  lead: { margin: 0, fontSize: 12.5, color: "var(--muted, #8b93a7)" },
  label: { display: "grid", gap: 6, fontSize: 12.5, color: "var(--navy, #1d2744)", fontWeight: 700 },
  input: {
    height: 42,
    padding: "0 12px",
    border: "1px solid var(--line, #e5e8f0)",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 400,
    outlineColor: "var(--blue, #5268e8)",
  },
  error: {
    background: "#fdeef0",
    color: "var(--red, #cf5260)",
    border: "1px solid #f6d3d8",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 12.5,
  },
  button: {
    height: 44,
    marginTop: 4,
    border: 0,
    borderRadius: 10,
    background: "var(--blue, #5268e8)",
    color: "#fff",
    fontSize: 14.5,
    fontWeight: 800,
  },
  help: { margin: 0, fontSize: 11.5, color: "var(--muted, #8b93a7)", textAlign: "center" },
};
