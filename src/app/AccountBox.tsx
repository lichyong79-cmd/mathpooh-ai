"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 사이드바 하단의 계정 영역입니다.
 * 이름을 코드에 박아두는 대신 실제 로그인 계정을 보여주고 로그아웃을 제공합니다.
 */
export default function AccountBox() {
  const [email, setEmail] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await createClient().auth.getUser();
        if (alive) setEmail(data.user?.email ?? "");
      } catch {
        /* proxy가 이미 막으므로 무시합니다. */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
    } finally {
      // 서버 쿠키까지 확실히 지우기 위해 라우트를 거쳐 이동합니다.
      window.location.href = "/auth/signout";
    }
  };

  const initial = email ? email.slice(0, 1).toUpperCase() : "?";
  const label = email ? email.split("@")[0] : "불러오는 중";

  return (
    <div className="sidebar-bottom">
      <div className="admin-avatar">{initial}</div>
      <div>
        <strong>{label}</strong>
        <span>{email || "\u00a0"}</span>
      </div>
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        title="로그아웃"
        aria-label="로그아웃"
      >
        {signingOut ? "…" : "⏻"}
      </button>
    </div>
  );
}
