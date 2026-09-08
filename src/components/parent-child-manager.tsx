"use client";
import { useState } from "react";

/**
 * SOS324 · 자녀 관리
 *
 * - required: 연결된 자녀가 없을 때 쓴다. 닫기 버튼이 없고 배경을 눌러도 닫히지 않는다.
 *   학부모가 무엇을 해야 할지 모른 채 빈 화면에 머무는 상황을 없애기 위해서다.
 * - linked: 이미 연결된 자녀 목록. 현재 상태를 함께 보여준다.
 */
export default function ParentChildManager({
  onDone,
  onClose,
  required = false,
  linked = [],
}: {
  onDone: () => void;
  onClose?: () => void;
  required?: boolean;
  linked?: any[];
}) {
  const [mode, setMode] = useState<"link" | "create">(required ? "create" : "link");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("고1");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async () => {
    setMsg("");
    if (mode === "create" && password !== passwordConfirm) {
      setMsg("학생 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/parent/children", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: mode, name, phone, school, grade, password }),
      });
      const j = await r.json();
      // SOS327: 학부모 번호와 자녀 번호가 같으면 한 번 확인받는다.
      if (!r.ok && j.needsConfirm === "samePhone") {
        if (!window.confirm(`${j.message}\n\n그대로 진행할까요?`)) { setBusy(false); return; }
        const retry = await fetch("/api/parent/children", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: mode, name, phone, school, grade, password, confirmSamePhone: true }),
        });
        const rj = await retry.json();
        if (!retry.ok) throw new Error(rj.message);
        setMsg(mode === "link" ? "기존 자녀가 연결되었습니다." : "새 학생 계정이 만들어졌습니다.");
        setTimeout(onDone, 500);
        return;
      }
      if (!r.ok) throw new Error(j.message);
      setMsg(mode === "link" ? "기존 자녀가 연결되었습니다." : "새 학생 계정이 만들어졌습니다.");
      setTimeout(onDone, 500);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pcm" onClick={() => { if (!required && onClose) onClose(); }}>
      <div className="pcm-card" onClick={(e) => e.stopPropagation()}>
        <div className="pcm-head">
          <div>
            <small>MATHPOOH SOS</small>
            <h2>{required ? "자녀 등록" : "자녀 관리"}</h2>
          </div>
          {onClose && !required ? <button className="x" onClick={onClose}>×</button> : null}
        </div>

        {required ? (
          <p className="notice">등록된 자녀가 없습니다. 자녀를 등록해야 학습 현황을 볼 수 있습니다.</p>
        ) : null}

        {linked.length ? (
          <div className="linked">
            <b>연결된 자녀 {linked.length}명</b>
            <ul>
              {linked.map((c: any) => (
                <li key={c.id}>
                  <span>{c.name}</span>
                  <small>{c.school || "학교 미입력"} · {c.grade || "학년 미입력"}</small>
                </li>
              ))}
            </ul>
            <p>연결을 끊어야 할 때는 학원으로 문의해 주세요.</p>
          </div>
        ) : null}

        <div className="pcm-tabs">
          <button className={mode === "link" ? "on" : ""} onClick={() => { setMode("link"); setMsg(""); }}>기존 자녀 연결</button>
          <button className={mode === "create" ? "on" : ""} onClick={() => { setMode("create"); setMsg(""); }}>새 자녀 계정 만들기</button>
        </div>

        <p className="guide">
          {mode === "link"
            ? "이미 MathPooh에 등록된 학생은 기존 학습기록을 그대로 연결합니다. 연결해도 학생의 기존 비밀번호는 바뀌지 않습니다."
            : "처음 이용하는 학생의 로그인 계정을 새로 만듭니다. 학생은 아래에서 정한 별도의 비밀번호로 로그인합니다."}
        </p>

        {mode === "create" ? (
          <div className="account-separation">
            <b>학부모용과 학생용은 서로 다른 계정입니다.</b>
            <span>학생 비밀번호는 학부모 비밀번호와 다르게 정해 주세요. 이후 학생이 자기 페이지에서 별도로 변경할 수 있습니다.</span>
          </div>
        ) : null}

        <label>학생 이름<input value={name} onChange={(e) => setName(e.target.value)} placeholder="학생 이름" /></label>
        <label>학생 휴대폰번호<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01012345678" /></label>

        {mode === "create" ? (
          <>
            <label>학교<input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="학교명" /></label>
            <label>학년
              <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option>중3</option><option>고1</option><option>고2</option><option>고3</option>
              </select>
            </label>
            <label>학생 비밀번호<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="학부모 비밀번호와 다르게 · 6자리 이상" /></label>
            <label>학생 비밀번호 확인<input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="학생 비밀번호를 한 번 더 입력" /></label>
          </>
        ) : null}

        {msg ? <p className="msg">{msg}</p> : null}

        <button className="save" disabled={busy} onClick={() => void submit()}>
          {busy ? "처리 중..." : mode === "link" ? "기존 자녀 연결하기" : "학생 계정 만들기"}
        </button>
      </div>

      <style jsx>{`
        .pcm{position:fixed;inset:0;z-index:1000;background:rgba(15,32,21,.46);display:grid;place-items:center;padding:20px;font-family:Arial,"Noto Sans KR",sans-serif}
        .pcm-card{width:min(440px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;padding:25px;box-shadow:0 24px 70px rgba(0,0,0,.2)}
        .pcm-head{display:flex;justify-content:space-between;align-items:start}
        .pcm-head small{font-weight:900;color:#4d7d46}
        .pcm-head h2{margin:4px 0 16px;color:#285c31}
        .x{border:0;background:none;font-size:28px;color:#77827a;cursor:pointer}
        .notice{margin:0 0 14px;padding:12px 14px;background:#fff5e9;border:1px solid #f0d3a8;border-radius:10px;color:#8a5312;font-size:13px;font-weight:800;line-height:1.6}
        .linked{margin-bottom:16px;padding:13px 15px;background:#f4f9f5;border:1px solid #d9e8de;border-radius:11px}
        .linked>b{font-size:13px;color:#2b5a38}
        .linked ul{margin:8px 0 6px;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
        .linked li{display:flex;align-items:baseline;gap:8px}
        .linked li span{font-size:14px;font-weight:800;color:#28402f}
        .linked li small{font-size:11.5px;color:#7d8a82}
        .linked p{margin:0;font-size:11.5px;color:#8b968f}
        .pcm-tabs{display:grid;grid-template-columns:1fr 1fr;background:#eef4ef;border-radius:10px;padding:4px;gap:4px}
        .pcm-tabs button{border:0;border-radius:8px;padding:11px;background:transparent;font-weight:800;color:#65736a;cursor:pointer}
        .pcm-tabs .on{background:#2f6937;color:#fff}
        .guide{font-size:13px;line-height:1.55;color:#68766d;background:#f7faf7;padding:10px;border-radius:8px}
        .account-separation{display:grid;gap:4px;padding:11px 13px;background:#fff7e9;border:1px solid #efd5a8;border-radius:9px;line-height:1.5}.account-separation b{font-size:12.5px;color:#704715}.account-separation span{font-size:11.5px;color:#846643}
        label{display:grid;gap:6px;margin-top:12px;font-size:13px;font-weight:800;color:#45544a}
        input,select{height:44px;border:1px solid #d5e0d8;border-radius:9px;padding:0 12px;font-size:14px;background:#fff}
        .msg{font-size:13px;color:#9a4d28}
        .save{width:100%;height:48px;border:0;border-radius:10px;background:#2f6937;color:#fff;font-weight:900;margin-top:16px;cursor:pointer}
        .save:disabled{opacity:.6}
      `}</style>
    </div>
  );
}
