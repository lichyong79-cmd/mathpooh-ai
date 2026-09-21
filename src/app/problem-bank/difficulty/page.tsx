"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPortalShell from "@/components/admin-portal-sidebar";
import { getSupabaseConfig } from "@/lib/supabase";
import { authHeaders } from "@/lib/supabase/rest";
import {
  DIFFICULTY_SCALE,
  DIFFICULTY_SCALE_VERSION,
  difficultyLabel,
  normalizeProblemDifficulty,
} from "@/lib/difficulty-scale";
import { SUBJECTS, canonicalSubject } from "@/lib/subject";

type Problem = {
  id: string;
  question_no: number;
  problem_code: string;
  title: string;
  grade: string;
  subject: string;
  unit: string;
  topic: string;
  difficulty: string | number;
  source_name: string;
  status: string;
  question_image_path?: string | null;
  dna_difficulty?: any;
  created_at?: string;
};

function norm(value: unknown, dnaDifficulty?: any) {
  return normalizeProblemDifficulty(
    value,
    dnaDifficulty ? { difficulty: dnaDifficulty } : null,
    "",
  );
}

function searchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-zA-Z가-힣]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ProblemPreview({ id, no }: { id: string; no: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/problem-bank/questions/${encodeURIComponent(id)}/image`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (alive) setUrl(ok && j?.success ? j.imageUrl ?? null : null);
      })
      .catch(() => alive && setUrl(null))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  if (loading) return <div className="preview-empty">문항 이미지 불러오는 중...</div>;
  if (!url) return <div className="preview-empty">문항 이미지를 불러오지 못했습니다.</div>;
  return (
    <div className="preview-box">
      <img src={url} alt={`${no}번 문항`} />
    </div>
  );
}

export default function DifficultyManagementPage() {
  const [items, setItems] = useState<Problem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [difficulty, setDifficulty] = useState("전체");
  const [subject, setSubject] = useState("전체");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const config = getSupabaseConfig();
    if (!config) {
      setError("Supabase 환경변수를 확인해 주세요.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const fields = [
        "id","question_no","problem_code","title","grade","subject","unit","topic",
        "difficulty","source_name","status","question_image_path",
        "dna_difficulty:problem_dna->difficulty","created_at",
      ].join(",");
      const all: Problem[] = [];
      let cursor = "";
      const batchSize = 250;
      for (;;) {
        const res = await fetch(
          `${config.url}/rest/v1/problem_bank_questions?select=${fields}&status=eq.ACTIVE&order=id.asc&limit=${batchSize}${cursor ? `&id=gt.${encodeURIComponent(cursor)}` : ""}`,
          { headers: { ...(await authHeaders()) }, cache: "no-store" },
        );
        if (!res.ok) {
          const failure = await res.json().catch(() => ({}));
          throw new Error(failure.message || "문항을 불러오지 못했습니다.");
        }
        const rows = (await res.json()) as Problem[];
        all.push(...rows);
        if (rows.length < batchSize) break;
        cursor = String(rows[rows.length - 1].id);
      }
      setItems(all.sort((a,b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "문항을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const subjects = useMemo(() => {
    const present = new Set(items.map((x) => canonicalSubject(x.subject)));
    return [
      "전체",
      ...SUBJECTS.filter((v) => present.has(v)),
      ...(present.has("미분류") ? ["미분류"] : []),
    ];
  }, [items]);

  const counts = useMemo(
    () => DIFFICULTY_SCALE.map((d) => items.filter((x) => norm(x.difficulty, x.dna_difficulty) === d.value).length),
    [items],
  );

  const unclassified = useMemo(
    () => items.filter((x) => !norm(x.difficulty, x.dna_difficulty)).length,
    [items],
  );

  const filtered = useMemo(() => {
    const tokens = searchText(keyword).split(" ").filter(Boolean);
    return items.filter((x) => {
      const d = norm(x.difficulty, x.dna_difficulty);
      if (difficulty === "미분류" && d) return false;
      if (difficulty !== "전체" && difficulty !== "미분류" && d !== difficulty) return false;
      if (subject !== "전체" && canonicalSubject(x.subject) !== subject) return false;
      if (!tokens.length) return true;
      const hay = searchText([
        x.question_no, `${x.question_no}번`, x.problem_code, x.title,
        x.subject, x.unit, x.topic, x.source_name,
      ].join(" "));
      return tokens.every((token) => hay.includes(token));
    });
  }, [items, keyword, difficulty, subject]);

  async function changeDifficulty(problem: Problem, value: string) {
    const config = getSupabaseConfig();
    if (!config) return;
    setSavingId(problem.id);
    setMessage("");
    setError("");
    try {
      const dnaRes = await fetch(
        `${config.url}/rest/v1/problem_bank_questions?select=problem_dna&id=eq.${encodeURIComponent(problem.id)}`,
        { headers: { ...(await authHeaders()) }, cache: "no-store" },
      );
      if (!dnaRes.ok) throw new Error("문항 DNA를 불러오지 못했습니다.");
      const dnaRows = await dnaRes.json().catch(() => []);
      const baseDna = dnaRows?.[0]?.problem_dna ?? {};
      const nextDifficulty: Record<string, unknown> = {
        ...(baseDna?.difficulty ?? {}),
        final_grade: Number(value),
        scale_version: DIFFICULTY_SCALE_VERSION,
        classification_policy: "manual-override",
        difficulty_source: "admin-manual",
        admin_fixed: true,
        admin_fixed_at: new Date().toISOString(),
      };
      for (const key of [
        "ai_regrade_version","ai_regraded_at","dna_recalculate_version","dna_recalculated_at",
        "difficulty_review_required","difficulty_review_reason","verification_attempted",
        "verification_deferred","verification_version","verification_role",
      ]) delete nextDifficulty[key];

      const nextDna = { ...baseDna, difficulty: nextDifficulty };
      const res = await fetch(
        `${config.url}/rest/v1/problem_bank_questions?id=eq.${encodeURIComponent(problem.id)}`,
        {
          method: "PATCH",
          headers: {
            ...(await authHeaders()),
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ difficulty: value, problem_dna: nextDna }),
        },
      );
      if (!res.ok) throw new Error(`난이도 저장 실패: ${await res.text()}`);
      setItems((prev) => prev.map((x) => x.id === problem.id
        ? { ...x, difficulty: value, dna_difficulty: nextDifficulty }
        : x,
      ));
      setMessage(`${problem.question_no}번 → ${difficultyLabel(value)} 저장 완료`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "난이도 저장에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AdminPortalShell current="sos-difficulty">
      <main className="difficulty-page">
        <section className="header">
          <div>
            <div className="eyebrow">MATHPOOH SOS</div>
            <h1>난이도 관리</h1>
            <p>
              난이도는 <b>실전모의고사 입력 시 문항분석</b>과 <b>문제은행 입력 시 Problem DNA 분석</b>에서만 판정합니다.
              별도 재풀이·백그라운드 재판정·DNA 재계산은 사용하지 않습니다.
            </p>
          </div>
          <div className="header-actions">
            <button onClick={() => void load()}>새로고침</button>
            <button onClick={() => { location.href = "/problem-bank"; }}>SOS 문제은행</button>
          </div>
        </section>

        {message && <div className="notice success">{message}</div>}
        {error && <div className="notice error">{error}</div>}

        <section className="kpis">
          {DIFFICULTY_SCALE.map((d,i) => (
            <button key={d.value} onClick={() => setDifficulty(d.value)} className={difficulty === d.value ? "active" : ""}>
              <span>{d.label}</span><b>{loading ? "—" : counts[i]}</b>
            </button>
          ))}
          <button onClick={() => setDifficulty("미분류")} className={difficulty === "미분류" ? "active warn" : "warn"}>
            <span>미분류</span><b>{loading ? "—" : unclassified}</b>
          </button>
        </section>

        <section className="filters">
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="문항번호 · 학교/교재 · 단원 검색" />
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            {subjects.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="전체">전체 난이도</option>
            {DIFFICULTY_SCALE.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            <option value="미분류">미분류</option>
          </select>
          <span>{filtered.length.toLocaleString()}문항</span>
        </section>

        <section className="table-wrap">
          <table>
            <thead><tr><th>문항</th><th>과목</th><th>단원</th><th>현재 난이도</th><th>수동 수정</th></tr></thead>
            <tbody>
              {filtered.slice(0, 1000).map((item) => {
                const current = norm(item.difficulty, item.dna_difficulty);
                const open = previewId === item.id;
                return [
                  <tr key={item.id} className={open ? "selected" : ""}>
                    <td>
                      <button className="title-button" onClick={() => setPreviewId(open ? "" : item.id)}>
                        <b>{item.question_no}번</b>
                        <span>{item.title}</span>
                        <small>{item.source_name || item.problem_code || ""}</small>
                      </button>
                    </td>
                    <td>{canonicalSubject(item.subject)}</td>
                    <td><b>{item.unit || "-"}</b><small>{item.topic || ""}</small></td>
                    <td><strong>{difficultyLabel(current)}</strong></td>
                    <td>
                      <select
                        value={current || ""}
                        disabled={savingId === item.id}
                        onChange={(e) => void changeDifficulty(item, e.target.value)}
                      >
                        <option value="" disabled>선택</option>
                        {DIFFICULTY_SCALE.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                    </td>
                  </tr>,
                  open ? (
                    <tr key={`${item.id}-preview`} className="preview-row">
                      <td colSpan={5}><ProblemPreview id={item.id} no={item.question_no} /></td>
                    </tr>
                  ) : null,
                ];
              })}
              {!loading && filtered.length === 0 && <tr><td colSpan={5} className="empty">조건에 맞는 문항이 없습니다.</td></tr>}
            </tbody>
          </table>
        </section>

        {filtered.length > 1000 && <div className="footnote">화면에는 검색 결과 중 최근 1,000문항까지만 표시합니다.</div>}

        <style jsx>{`
          .difficulty-page{padding:24px;background:#f4f6f5;min-height:100vh;color:#18201c}
          .header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;background:white;border:1px solid #dfe5e1;border-radius:18px;padding:24px;margin-bottom:16px}
          .eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;color:#6c7a72}.header h1{margin:5px 0 8px;font-size:30px}.header p{margin:0;max-width:800px;line-height:1.65;color:#5a665f}
          .header-actions{display:flex;gap:8px;flex-wrap:wrap}.header-actions button,.kpis button{border:1px solid #d6ddd9;background:#fff;border-radius:10px;padding:10px 14px;cursor:pointer}
          .notice{padding:12px 14px;border-radius:10px;margin-bottom:12px}.success{background:#ecf8f0;color:#176134}.error{background:#fff0f0;color:#9b2727}
          .kpis{display:grid;grid-template-columns:repeat(9,minmax(82px,1fr));gap:8px;margin-bottom:12px}.kpis button{display:flex;flex-direction:column;gap:4px;align-items:flex-start}.kpis button b{font-size:20px}.kpis button.active{border-color:#244c39;background:#eaf3ee}.kpis button.warn{background:#fff8e6}
          .filters{display:grid;grid-template-columns:minmax(260px,1fr) 180px 160px auto;gap:8px;align-items:center;background:#fff;border:1px solid #dfe5e1;border-radius:14px;padding:12px;margin-bottom:12px}.filters input,.filters select,td select{height:38px;border:1px solid #d2dad5;border-radius:8px;background:#fff;padding:0 10px}.filters span{text-align:right;font-weight:700}
          .table-wrap{background:#fff;border:1px solid #dfe5e1;border-radius:16px;overflow:auto}table{width:100%;border-collapse:collapse;min-width:960px}th,td{padding:12px 14px;border-bottom:1px solid #edf0ee;text-align:left;vertical-align:middle}th{font-size:12px;color:#6f7a74;background:#fafbfa;position:sticky;top:0;z-index:1}td small{display:block;color:#88928c;margin-top:4px}tr.selected{background:#f5faf7}
          .title-button{display:flex;flex-direction:column;align-items:flex-start;gap:3px;border:0;background:transparent;text-align:left;cursor:pointer;padding:0;color:inherit}.title-button b{font-size:13px;color:#3d6c54}.title-button span{font-weight:700}.preview-row td{background:#f7f9f8;padding:16px}.preview-box{max-height:580px;overflow:auto;background:#fff;border:1px solid #dfe5e1;border-radius:12px;padding:14px}.preview-box img{display:block;max-width:100%;height:auto;margin:auto}.preview-empty{padding:36px;text-align:center;color:#7c8781}.empty{padding:40px;text-align:center;color:#7c8781}.footnote{padding:10px;color:#737f78;font-size:12px}
          @media(max-width:900px){.difficulty-page{padding:12px}.header{flex-direction:column}.kpis{grid-template-columns:repeat(3,1fr)}.filters{grid-template-columns:1fr 1fr}.filters input{grid-column:1/-1}.filters span{text-align:left}}
        `}</style>
      </main>
    </AdminPortalShell>
  );
}
