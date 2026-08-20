"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseConfig } from "@/lib/supabase";
import { authHeaders } from "@/lib/supabase/rest";
import AdminPortalShell from "@/components/admin-portal-sidebar";
import { DIFFICULTY_SCALE, DIFFICULTY_SCALE_VERSION, difficultyAiJudged, difficultyFromBand, difficultyLabel, normalizeProblemDifficulty, problemDifficultyNeedsReview } from "@/lib/difficulty-scale";
import { SUBJECTS, canonicalSubject } from "@/lib/subject";
import { evidenceDifficultyLevel } from "@/lib/problem-dna";

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
  problem_dna?: any;
  created_at?: string;
};

type RegradeResult = {
  success?: boolean;
  ok?: boolean;
  problemId?: string;
  difficulty?: string;
  previousDifficulty?: string | null;
  reason?: string;
  confidence?: number;
  csatPointEquivalent?: number;
  csatDifficultyBand?: string;
  message?: string;
  decision?: "graded" | "unclassified";
  reviewRequired?: boolean;
  reviewReason?: string;
  solutionVerified?: boolean;
  answerConsistency?: "match" | "mismatch" | "unknown";
  solvedAnswer?: string;
  solveConfidence?: number;
  reasoningSteps?: number;
  conditionTransformations?: number;
  calculationLoad?: number;
  insightLoad?: number;
  failureType?: string;
  failureStage?: string;
  failureDetail?: string;
  previewJudgement?: any;
};

type TestRow = Problem & { before: string; result?: RegradeResult };

const D = DIFFICULTY_SCALE.map((x) => x.value);
function norm(v: unknown, dna?: any) { return normalizeProblemDifficulty(v, dna, ""); }

function confidenceLabel(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

function bandLabel(value?: string) {
  const map: Record<string,string> = { two_point:"2점",three_point:"3점",three_hard:"어3",four_easy:"쉬4",four_medium:"적4",four_hard:"어4",semi_killer:"준킬러",semi_killer_easy:"준킬러",semi_killer_hard:"준킬러",killer:"킬러" };
  return value ? map[value] ?? value : "-";
}

function failureTypeLabel(value:unknown) {
  const key=String(value??"unknown");
  return ({
    timeout:"시간초과", http_429:"API 사용량/속도 제한", http_4xx:"API 요청 오류", http_5xx:"AI 서버 오류",
    response_json_parse:"응답 형식 오류", incomplete_max_output_tokens:"출력 토큰 한도", incomplete_content_filter:"콘텐츠 필터",
    incomplete_other:"미완료 응답", empty_response:"빈 응답", structured_json_parse:"구조화 JSON 파싱 실패", unknown:"원인 미확정"
  } as Record<string,string>)[key] ?? key;
}

function failureStageLabel(value:unknown) {
  const key=String(value??"");
  if(key.includes("solve")) return "독립 재풀이";
  if(key.includes("judge")) return "난이도 판정";
  return key || "미확정";
}

function TestProblemImage({ problemId, questionNo }: { problemId: string; questionNo: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/problem-bank/questions/${encodeURIComponent(problemId)}/image`, { cache: "no-store" });
        const result = await response.json() as { success?: boolean; imageUrl?: string };
        if (alive) setUrl(response.ok && result.success ? result.imageUrl ?? null : null);
      } catch {
        if (alive) setUrl(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [problemId]);

  // SOS277: 이 컴포넌트의 DOM에는 styled-jsx 스코프 클래스가 붙지 않는다.
  // 부모의 <style jsx> 안에 있는 .test-image-scroll / .test-image-scroll img 규칙은
  // 선택자 앞부분에서 이미 매칭이 깨져 한 번도 적용된 적이 없었고,
  // 그래서 이미지가 원본 크기(760px 등) 그대로 그려져 카드 밖으로 잘려나갔다.
  // CSS에 기대지 말고 인라인 스타일로 고정한다.
  const emptyStyle: React.CSSProperties = {
    height:"100%", display:"flex", alignItems:"center", justifyContent:"center",
    color:"#7b857f", fontSize:13,
  };
  if (loading) return <div style={emptyStyle}>문항 이미지 불러오는 중...</div>;
  if (!url) return <div style={emptyStyle}>문항 이미지를 불러오지 못했습니다.</div>;
  return (
    <div
      title="문항을 위아래로 스크롤해서 확인하세요"
      style={{
        width:"100%", height:"100%", overflowY:"auto", overflowX:"auto",
        background:"#fff", padding:8, boxSizing:"border-box", overscrollBehavior:"contain",
      }}
    >
      <img
        src={url}
        alt={`${questionNo}번 문항`}
        style={{ display:"block", width:"100%", maxWidth:"100%", height:"auto" }}
      />
    </div>
  );
}

export default function DifficultyManagementPage() {
  const [items, setItems] = useState<Problem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [difficulty, setDifficulty] = useState("전체");
  const [subject, setSubject] = useState("전체");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testResults, setTestResults] = useState<TestRow[]>([]);
  const [progress, setProgress] = useState<{ mode: "anomaly" | "sample" | "full"; done: number; total: number; ok: number; fail: number } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [savedDifficulty, setSavedDifficulty] = useState<Record<string,string>>({});
  const [queue, setQueue] = useState<any>(null);
  const [queueBusy, setQueueBusy] = useState(false);
  const [fullPreviewResults, setFullPreviewResults] = useState<TestRow[]>([]);
  const [previewGeneratedAt, setPreviewGeneratedAt] = useState<string>("");

  const load = useCallback(async () => {
    const config = getSupabaseConfig();
    if (!config) { setError("Supabase 환경변수를 확인해 주세요."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const fields = ["id","question_no","problem_code","title","grade","subject","unit","topic","difficulty","source_name","status","question_image_path","problem_dna","created_at"].join(",");
      const all: Problem[] = [];
      for (let offset=0;;offset+=1000) {
        const res = await fetch(`${config.url}/rest/v1/problem_bank_questions?select=${fields}&status=eq.ACTIVE&order=created_at.desc&offset=${offset}&limit=1000`, { headers:{ ...(await authHeaders()) }, cache:"no-store" });
        if (!res.ok) throw new Error(await res.text());
        const rows = await res.json() as Problem[];
        all.push(...rows.map(x => ({...x, difficulty:norm(x.difficulty,x.problem_dna)})));
        if (rows.length < 1000) break;
      }
      setItems(all);
    } catch (e) { setError(e instanceof Error ? e.message : "문항을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // SOS278: 백그라운드 재판정 진행 현황
  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/problem-bank/difficulty-queue", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (data?.success) setQueue(data);
    } catch { /* 진행 표시가 실패해도 화면을 막지 않는다 */ }
  }, []);

  useEffect(() => {
    void loadQueue();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadQueue();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [loadQueue]);

  async function queueAction(action: "enqueue" | "retry" | "clear") {
    if (queueBusy) return;
    const label = action === "enqueue" ? "AI 미검증 문항을 재판정 대기열에 넣습니다."
      : action === "retry" ? "실패한 문항을 다시 대기열에 넣습니다."
      : "아직 처리하지 않은 대기 건을 모두 비웁니다. 이미 끝난 결과는 그대로 둡니다.";
    if (!window.confirm(label + "\n\n서버가 10분마다 조금씩 처리하며, 브라우저를 닫아도 계속 진행됩니다.\n\n진행할까요?")) return;
    setQueueBusy(true); setMessage(""); setError("");
    try {
      const res = await fetch("/api/problem-bank/difficulty-queue", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data?.success) throw new Error(data?.message || "큐 처리에 실패했습니다.");
      if (action === "enqueue") setMessage(`대기열에 ${data.inserted}문항을 넣었습니다. (대상 ${data.candidates}문항 중 이미 등록된 건 제외)`);
      else if (action === "retry") setMessage(`실패 ${data.requeued}문항을 다시 대기열에 넣었습니다.`);
      else setMessage(`대기 ${data.cleared}건을 비웠습니다.`);
      await loadQueue();
    } catch (e) {
      setError(e instanceof Error ? e.message : "큐 처리에 실패했습니다.");
    } finally { setQueueBusy(false); }
  }

  const subjects = useMemo(() => {
    const present = new Set(items.map(x => canonicalSubject(x.subject)));
    return ["전체", ...SUBJECTS.filter(v => present.has(v)), ...(present.has("미분류") ? ["미분류"] : [])];
  }, [items]);
  const filtered = useMemo(() => items.filter(x => {
    if (difficulty === "미분류" && norm(x.difficulty,x.problem_dna)) return false;
    // SOS275: AI 검증이 필요한 문항만 골라 작업할 수 있게 한다.
    if (difficulty === "AI미검증" && difficultyAiJudged(x.problem_dna)) return false;
    if (difficulty !== "전체" && difficulty !== "미분류" && difficulty !== "AI미검증" && norm(x.difficulty,x.problem_dna) !== difficulty) return false;
    if (subject !== "전체" && canonicalSubject(x.subject) !== subject) return false;
    const q = keyword.trim().toLowerCase();
    if (q && ![x.problem_code,x.title,x.unit,x.topic,x.source_name].join(" ").toLowerCase().includes(q)) return false;
    return true;
  }), [items, keyword, difficulty, subject]);

  const counts = useMemo(() => D.map(d => items.filter(x=>norm(x.difficulty,x.problem_dna)===d).length), [items]);
  const unclassifiedCount = useMemo(() => items.filter(x=>!norm(x.difficulty,x.problem_dna)).length, [items]);
  const reviewCount = useMemo(() => items.filter(x=>problemDifficultyNeedsReview(x.difficulty,x.problem_dna)).length, [items]);
  // SOS274: scale_version은 8단계 전환 SQL이 옛 1~5 환산값에도 도장을 찍어놨기 때문에
  // "검증됨"의 근거가 되지 못한다. 실제 AI 재판정 흔적(ai_regrade_version)으로 센다.
  const notJudgedCount = useMemo(() => items.filter(x=>!difficultyAiJudged(x.problem_dna)).length, [items]);
  const legacyStampCount = useMemo(() => items.filter(x=>String(x.problem_dna?.difficulty?.scale_version ?? "") !== DIFFICULTY_SCALE_VERSION).length, [items]);
  const sampleSummary = useMemo(() => {
    // SOS245: 한 문항은 반드시 하나의 최종 상태로만 집계한다.
    const unique=[...new Map(testResults.map(x=>[x.id,x])).values()];
    const reviewRows=unique.filter(x=>x.result?.ok && !!x.result?.reviewRequired);
    const unclassifiedRows=unique.filter(x=>x.result?.ok && !x.result?.reviewRequired && (x.result?.decision==="unclassified" || !x.result?.difficulty));
    const graded=unique.filter(x=>x.result?.ok && !x.result?.reviewRequired && x.result?.decision!=="unclassified" && x.result?.difficulty);
    const changedRows=graded.filter(x=>x.before!==String(x.result?.difficulty));
    const keptRows=graded.filter(x=>x.before===String(x.result?.difficulty));
    const failedRows=unique.filter(x=>!x.result?.ok);
    const matrix=new Map<string,number>();
    for(const x of graded){const key=`${x.before||"미분류"}→${String(x.result?.difficulty)}`;matrix.set(key,(matrix.get(key)||0)+1);}
    const accounted=keptRows.length+changedRows.length+unclassifiedRows.length+reviewRows.length+failedRows.length;
    return {total:unique.length,kept:keptRows.length,changed:changedRows.length,unclassified:unclassifiedRows.length,review:reviewRows.length,failed:failedRows.length,accounted,matrix:[...matrix.entries()].sort((a,b)=>b[1]-a[1])};
  },[testResults]);

  const fullPreviewSummary = useMemo(() => {
    const unique=[...new Map(fullPreviewResults.map(x=>[x.id,x])).values()];
    const reviewRows=unique.filter(x=>x.result?.ok && !!x.result?.reviewRequired);
    const unclassifiedRows=unique.filter(x=>x.result?.ok && !x.result?.reviewRequired && (x.result?.decision==="unclassified" || !x.result?.difficulty));
    const graded=unique.filter(x=>x.result?.ok && !x.result?.reviewRequired && x.result?.decision==="graded" && !!x.result?.difficulty);
    const changedRows=graded.filter(x=>x.before!==String(x.result?.difficulty));
    const keptRows=graded.filter(x=>x.before===String(x.result?.difficulty));
    const failedRows=unique.filter(x=>!x.result?.ok);
    const matrix=new Map<string,number>();
    for(const x of graded){
      const key=`${x.before||"미분류"}→${String(x.result?.difficulty)}`;
      matrix.set(key,(matrix.get(key)||0)+1);
    }

    const expected=new Map<string,number>();
    for(const d of D) expected.set(d,items.filter(x=>norm(x.difficulty,x.problem_dna)===d).length);
    expected.set("",items.filter(x=>!norm(x.difficulty,x.problem_dna)).length);
    for(const x of graded){
      const before=x.before||"";
      const after=String(x.result?.difficulty||"");
      if(before===after) continue;
      expected.set(before,Math.max(0,(expected.get(before)||0)-1));
      expected.set(after,(expected.get(after)||0)+1);
    }
    return {
      total:unique.length,
      kept:keptRows.length,
      changed:changedRows.length,
      review:reviewRows.length,
      unclassified:unclassifiedRows.length,
      failed:failedRows.length,
      applicable:graded.length,
      matrix:[...matrix.entries()].sort((a,b)=>b[1]-a[1]),
      expected,
    };
  },[fullPreviewResults,items]);

  async function changeDifficulty(id:string, value:string) {
    const config = getSupabaseConfig(); if (!config) return;
    const target = items.find(x=>x.id===id); if (!target) return;
    const previous = norm(target.difficulty,target.problem_dna);
    const dna = { ...(target.problem_dna || {}), difficulty: { ...((target.problem_dna || {}).difficulty || {}), final_grade:Number(value), scale_version:DIFFICULTY_SCALE_VERSION, admin_fixed:true, admin_fixed_at:new Date().toISOString(), difficulty_decision:"graded", difficulty_review_required:false, difficulty_review_reason:"", solution_verified:true } };
    setSavingId(id); setError("");
    const res = await fetch(`${config.url}/rest/v1/problem_bank_questions?id=eq.${encodeURIComponent(id)}`, {
      method:"PATCH", headers:{ ...(await authHeaders()), "Content-Type":"application/json", Prefer:"return=representation" },
      body: JSON.stringify({ difficulty:value, problem_dna:dna }),
    });
    if (!res.ok) {
      setError(`난이도 저장 실패: ${await res.text()}`);
      setSavingId(null);
      return;
    }
    const saved = await res.json().catch(()=>[]) as Array<{difficulty?: string|number; problem_dna?: any}>;
    const confirmed = norm(saved?.[0]?.difficulty ?? value, saved?.[0]?.problem_dna ?? dna);
    const confirmedDna = saved?.[0]?.problem_dna ?? dna;
    setItems(prev => prev.map(x=>x.id===id ? {...x,difficulty:confirmed,problem_dna:confirmedDna} : x));
    setTestResults(prev => prev.map(x=>x.id===id ? {...x,difficulty:confirmed,problem_dna:confirmedDna} : x));
    setSavedDifficulty(prev => ({...prev, [id]:confirmed}));
    setMessage(`${target.question_no}번 난이도 ${difficultyLabel(previous)} → ${difficultyLabel(confirmed)} 저장 완료`);
    setSavingId(null);
  }


  async function runFullEightScaleReview() {
    if (running) return;
    // SOS275(A안): AI가 확정한 난이도는 이 보조 계산의 대상이 아니다.
    const targets = items.filter((x) => x.problem_dna?.difficulty?.admin_fixed !== true && !difficultyAiJudged(x.problem_dna));
    const fixed = items.filter((x) => x.problem_dna?.difficulty?.admin_fixed === true).length;
    const verified = items.length - targets.length - fixed;
    if (!window.confirm(
      `저장된 DNA 점수만으로 난이도를 추정합니다. AI가 문제를 풀어보는 검증이 아닙니다.

`
      + `대상 ${targets.length}문항 (AI 미검증분)
`
      + `보존: 관리자 확정 ${fixed}문항 · AI 확정 ${verified}문항
`
      + `AI/OpenAI 호출 0회 · 추가 AI 비용 0원

결과는 '추정치'로 저장되며 AI 검증 대상으로 남습니다.

진행할까요?`
    )) return;

    setRunning(true); setMessage(""); setError(""); setTestResults([]);
    setProgress({mode:"anomaly",done:0,total:items.length,ok:0,fail:0});
    let offset=0, ok=0, fail=0, fixedSkipped=0, noDna=0;
    try {
      while (true) {
        const res=await fetch("/api/problem-bank/recalculate-difficulty-from-dna",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({offset,limit:250}),
        });
        const data=await res.json().catch(()=>({}));
        if(!res.ok||data?.success!==true) throw new Error(data?.message||`DNA 재계산 실패 (${res.status})`);
        ok += Number(data.updated)||0;
        fail += Number(data.failed)||0;
        fixedSkipped += Number(data.skippedFixed)||0;
        noDna += Number(data.skippedNoDna)||0;
        offset = Number(data.nextOffset)||offset;
        setProgress({mode:"anomaly",done:Math.min(offset,items.length),total:items.length,ok,fail});
        setMessage(`DNA 난이도 재계산 중 · ${Math.min(offset,items.length)}/${items.length} · 변경 ${ok} · 관리자확정 보존 ${fixedSkipped} · DNA없음 ${noDna} · 실패 ${fail}`);
        if(data.done===true) break;
      }
      await load();
      setMessage(`DNA 난이도 재계산 완료 · 변경 ${ok} · 관리자확정 보존 ${fixedSkipped} · DNA없음 ${noDna}${fail?` · 실패 ${fail}`:""} · AI 호출 0회`);
    } catch(e) {
      setError(e instanceof Error?e.message:"DNA 난이도 재계산에 실패했습니다.");
    } finally { setRunning(false); setProgress(null); }
  }


  function buildReferenceIds() {
    const validFixed = items.filter(x => x.problem_dna?.difficulty?.admin_fixed === true && x.problem_dna?.difficulty?.scale_version === DIFFICULTY_SCALE_VERSION);
    return DIFFICULTY_SCALE.flatMap(scale => validFixed.filter(x => norm(x.difficulty,x.problem_dna)===scale.value).slice(0,3).map(x=>x.id));
  }

  function buildBalancedSample(perGrade=4) {
    // SOS275(A안): 검증이 필요한 문항을 우선 표본으로 뽑는다.
    const all = items.filter(x=>x.problem_dna?.difficulty?.admin_fixed !== true && !!x.question_image_path);
    const unverified = all.filter(x=>!difficultyAiJudged(x.problem_dna));
    const candidates = unverified.length >= 24 ? unverified : all;
    const chosen: Problem[]=[];
    for (const scale of DIFFICULTY_SCALE) {
      const pool=candidates.filter(x=>norm(x.difficulty,x.problem_dna)===scale.value);
      chosen.push(...pool.slice(0,perGrade));
    }
    chosen.push(...candidates.filter(x=>!norm(x.difficulty,x.problem_dna)).slice(0,8));
    // 3점 과밀 구간을 별도로 더 검사한다.
    chosen.push(...candidates.filter(x=>norm(x.difficulty,x.problem_dna)==="2").slice(perGrade,perGrade+12));
    return [...new Map(chosen.map(x=>[x.id,x])).values()].slice(0,48);
  }

  async function runSampleRecheck() {
    if (running) return;
    const targets=buildBalancedSample(4);
    if(!targets.length){setMessage("표본 재검증 대상이 없습니다.");return;}
    if(!window.confirm(`새 SOS245 엔진이 ${targets.length}문항을 실제로 다시 풀고 난이도를 검증합니다.\n\nDB 난이도는 변경하지 않습니다.\n결과를 먼저 비교해 본 뒤 전체 적용 여부를 결정할 수 있습니다.\n\n진행할까요?`)) return;
    setRunning(true);setMessage("");setError("");setTestResults([]);setProgress({mode:"sample",done:0,total:targets.length,ok:0,fail:0});
    const referenceIds=buildReferenceIds(); const rows:TestRow[]=[]; let ok=0,fail=0;
    try{
      for(let i=0;i<targets.length;i+=8){
        const batch=targets.slice(i,i+8);
        const res=await fetch("/api/problem-bank/regrade-difficulty-batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({problemIds:batch.map(x=>x.id),dryRun:true,referenceIds})});
        const data=await res.json().catch(()=>({})); const results=Array.isArray(data.results)?data.results:[]; const map=new Map(results.map((r:any)=>[String(r.problemId),r]));
        for(const target of batch){const result:any=map.get(String(target.id)); if(result?.ok||result?.success){ok++;rows.push({...target,before:norm(target.difficulty,target.problem_dna),result:{...result,ok:true}});}else{fail++;rows.push({...target,before:norm(target.difficulty,target.problem_dna),result:{...result,ok:false}});}}
        setTestResults([...rows]); const done=Math.min(i+8,targets.length);setProgress({mode:"sample",done,total:targets.length,ok,fail});setMessage(`표본 재검증 중 · ${done}/${targets.length} · 성공 ${ok} · 미판정/실패 ${fail}`);
      }
      setMessage(`SOS249 표본 재검증 완료 · ${targets.length}문항. 아래에서 기존↔신규 판정과 미판정/검토필요를 확인하세요. DB 난이도는 아직 변경하지 않았습니다.`);
    }catch(e){setError(e instanceof Error?e.message:"표본 재검증에 실패했습니다.");}finally{setRunning(false);setProgress(null);}
  }

  async function retryVerification(problemId:string) {
    if (running || retryingId) return;
    const target=testResults.find(x=>x.id===problemId) ?? items.find(x=>x.id===problemId);
    if(!target) return;
    setRetryingId(problemId);setError("");setMessage(`${target.question_no}번 검증을 다시 시도합니다...`);
    try {
      const referenceIds=buildReferenceIds();
      const res=await fetch("/api/problem-bank/regrade-difficulty-batch",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({problemIds:[problemId],dryRun:true,referenceIds})
      });
      const data=await res.json().catch(()=>({}));
      const result=Array.isArray(data.results)?data.results[0]:null;
      const normalizedResult = result?.ok || result?.success ? {...result,ok:true} : {...(result||{}),ok:false,message:result?.message||data?.message||`검증 실패 (${res.status})`,failureType:result?.failureType||data?.failureType||"unknown",failureStage:result?.failureStage||data?.failureStage||"unknown",failureDetail:result?.failureDetail||data?.failureDetail||""};
      setTestResults(prev=>prev.map(row=>row.id===problemId?{...row,result:normalizedResult}:row));
      if(normalizedResult.ok) setMessage(`${target.question_no}번 재검증 완료 · ${normalizedResult.decision==="unclassified"||!normalizedResult.difficulty?"미판정":difficultyLabel(normalizedResult.difficulty)}`);
      else setMessage(`${target.question_no}번 재검증도 실패했습니다. 기존 난이도는 그대로 유지됩니다.`);
    } catch(e) {
      setError(e instanceof Error?e.message:"재검증에 실패했습니다.");
    } finally { setRetryingId(null); }
  }

  async function retryAllFailures() {
    if (running || retryingId) return;
    const failedIds=[...new Set(testResults.filter(x=>!x.result?.ok).map(x=>x.id))];
    if(!failedIds.length){setMessage("재검증할 실패 문항이 없습니다.");return;}
    setRunning(true);setError("");setMessage(`검증실패 ${failedIds.length}문항을 다시 검증합니다...`);
    const referenceIds=buildReferenceIds();
    const replacements=new Map<string,any>();
    try {
      for(let i=0;i<failedIds.length;i+=4){
        const ids=failedIds.slice(i,i+4);
        const res=await fetch("/api/problem-bank/regrade-difficulty-batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({problemIds:ids,dryRun:true,referenceIds})});
        const data=await res.json().catch(()=>({}));
        const results=Array.isArray(data.results)?data.results:[];
        const map=new Map(results.map((r:any)=>[String(r.problemId),r]));
        for(const id of ids){
          const r:any=map.get(id);
          const next=r?.ok||r?.success
            ? {...r,ok:true}
            : {...(r||{}),ok:false,message:r?.message||data?.message||`재검증 실패 (${res.status})`,failureType:r?.failureType||data?.failureType||"unknown",failureStage:r?.failureStage||data?.failureStage||"unknown",failureDetail:r?.failureDetail||data?.failureDetail||""};
          replacements.set(id,next);
        }
      }
      setTestResults(prev=>prev.map(row=>replacements.has(row.id)?{...row,result:replacements.get(row.id)}:row));
      const recovered=failedIds.filter(id=>replacements.get(id)?.ok).length;
      const stillFailed=failedIds.length-recovered;
      setMessage(`검증실패 재시도 완료 · 복구 ${recovered} · 여전히 실패 ${stillFailed}. 실패 문항은 기존 난이도를 유지합니다.`);
    } catch(e){setError(e instanceof Error?e.message:"실패 문항 재검증에 실패했습니다.");}
    finally{setRunning(false);}
  }

  async function runVerifiedFullPreview() {
    if(running)return;
    const targets=items.filter(x=>x.problem_dna?.difficulty?.admin_fixed!==true && !!x.question_image_path);
    if(!targets.length){setMessage("전체 재검증 대상이 없습니다.");return;}
    if(!window.confirm(`SOS248 검증 엔진으로 ${targets.length}문항의 전체 재판정 '미리보기'를 계산합니다.

- DB difficulty는 절대 변경하지 않음
- 관리자 확정 문항 보존
- AI 실제 재풀이/검증
- 미판정/검토필요/실패는 적용 후보에서 제외
- 완료 후 예상 분포와 이동표를 먼저 확인

AI 호출량이 많고 시간이 걸릴 수 있습니다. 미리보기를 시작할까요?`))return;

    setRunning(true);setMessage("");setError("");setFullPreviewResults([]);setPreviewGeneratedAt("");
    setProgress({mode:"full",done:0,total:targets.length,ok:0,fail:0});
    const referenceIds=buildReferenceIds();
    const rows:TestRow[]=[];
    let ok=0,fail=0,review=0;
    try{
      for(let i=0;i<targets.length;i+=8){
        const batch=targets.slice(i,i+8);
        const res=await fetch("/api/problem-bank/regrade-difficulty-batch",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({problemIds:batch.map(x=>x.id),dryRun:true,referenceIds})
        });
        const data=await res.json().catch(()=>({}));
        const results=Array.isArray(data.results)?data.results:[];
        const map=new Map(results.map((r:any)=>[String(r.problemId),r]));
        for(const target of batch){
          const result:any=map.get(String(target.id));
          const normalized=result?.ok||result?.success
            ? {...result,ok:true}
            : {...(result||{}),ok:false,message:result?.message||data?.message||`미리보기 실패 (${res.status})`};
          if(normalized.ok){
            ok++;
            if(normalized.reviewRequired || normalized.decision==="unclassified" || !normalized.difficulty) review++;
          } else fail++;
          rows.push({...target,before:norm(target.difficulty,target.problem_dna),result:normalized});
        }
        const done=Math.min(i+8,targets.length);
        setProgress({mode:"full",done,total:targets.length,ok,fail});
        setMessage(`전체 난이도 미리보기 계산 중 · ${done}/${targets.length} · 정상 ${ok} · 검토/미판정 ${review} · 실패 ${fail} · DB 변경 0건`);
      }
      setFullPreviewResults([...rows]);
      setPreviewGeneratedAt(new Date().toISOString());
      setMessage(`SOS248 전체 미리보기 완료 · ${targets.length}문항 · DB 변경 0건. 아래 예상 분포와 이동표를 확인한 뒤 최종 적용하세요.`);
    }catch(e){
      setError(e instanceof Error?e.message:"전체 재판정 미리보기에 실패했습니다.");
    }finally{
      setRunning(false);setProgress(null);
    }
  }

  async function applyFullPreview() {
    if(running)return;
    const eligible=fullPreviewResults.filter(x=>
      x.result?.ok &&
      x.result?.decision==="graded" &&
      !!x.result?.difficulty &&
      !x.result?.reviewRequired &&
      !!x.result?.previewJudgement
    );
    if(!eligible.length){setMessage("적용 가능한 미리보기 결과가 없습니다.");return;}

    const changed=eligible.filter(x=>x.before!==String(x.result?.difficulty)).length;
    if(!window.confirm(`미리보기에서 검증 통과한 ${eligible.length}문항을 DB에 적용합니다.

실제 난이도 변경: ${changed}문항
현재값 유지(검증 메타데이터 갱신): ${eligible.length-changed}문항
검토필요/미판정/실패: 적용하지 않음
관리자 확정: 적용하지 않음

미리보기에서 받은 AI 판정값을 그대로 저장하며 AI를 다시 호출하지 않습니다.

최종 적용할까요?`))return;

    setRunning(true);setError("");
    setProgress({mode:"full",done:0,total:eligible.length,ok:0,fail:0});
    let applied=0,failed=0,stale=0;
    try{
      for(let i=0;i<eligible.length;i+=100){
        const batch=eligible.slice(i,i+100);
        const res=await fetch("/api/problem-bank/apply-difficulty-preview-batch",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            rows:batch.map(x=>({
              problemId:x.id,
              previousDifficulty:x.before||null,
              judgement:x.result?.previewJudgement
            }))
          })
        });
        const data=await res.json().catch(()=>({}));
        if(!res.ok||data?.success!==true) throw new Error(data?.message||`미리보기 적용 실패 (${res.status})`);
        applied+=Number(data.applied)||0;
        failed+=Number(data.failed)||0;
        stale+=Number(data.stale)||0;
        const done=Math.min(i+100,eligible.length);
        setProgress({mode:"full",done,total:eligible.length,ok:applied,fail:failed+stale});
        setMessage(`미리보기 결과 DB 적용 중 · ${done}/${eligible.length} · 적용 ${applied} · 중간변경으로 건너뜀 ${stale} · 실패 ${failed}`);
      }
      await load();
      setFullPreviewResults([]);
      setPreviewGeneratedAt("");
      setMessage(`SOS248 난이도 최종 적용 완료 · 적용 ${applied} · 중간변경 건너뜀 ${stale} · 실패 ${failed}. 검토필요/미판정/실패 문항은 기존 난이도를 유지했습니다.`);
    }catch(e){
      setError(e instanceof Error?e.message:"미리보기 결과 적용에 실패했습니다.");
    }finally{
      setRunning(false);setProgress(null);
    }
  }

  async function runAnomalyReview() {
    if (running) return;

    const fixed = items.filter(x => x.problem_dna?.difficulty?.admin_fixed === true);
    const validFixed = fixed.filter(x => x.problem_dna?.difficulty?.scale_version === DIFFICULTY_SCALE_VERSION);
    const referenceIds = DIFFICULTY_SCALE.flatMap(scale =>
      validFixed.filter(x => norm(x.difficulty, x.problem_dna) === scale.value).slice(0, 3).map(x => x.id)
    );

    // 먼저 저장된 AI 메타데이터에서 의심 신호가 있는 문항을 우선 선별한다.
    const ranked = items
      .filter(x => x.problem_dna?.difficulty?.admin_fixed !== true)
      .map(x => {
        const current = norm(x.difficulty, x.problem_dna);
        const d = x.problem_dna?.difficulty ?? {};
        const bandValue = difficultyFromBand(d.csat_difficulty_band);
        const finalValue = String(d.final_grade ?? "");
        const confidence = Number(d.ai_regrade_confidence ?? x.problem_dna?.confidence ?? 1);
        // v164: 문항 근거(개념·조건해석·발상·계산·시간)만으로 계산한 난이도.
        // 밴드만 보고 3점으로 몰려 등록된 문항을 찾아내는 핵심 신호다.
        const evidence = d && Object.keys(d).length ? String(evidenceDifficultyLevel(d)) : "";
        const evidenceGap = evidence && current ? Math.abs(Number(evidence) - Number(current)) : 0;
        let suspicion = 0;
        if (bandValue && bandValue !== current) suspicion += 100;
        if (/^[1-8]$/.test(finalValue) && finalValue !== current) suspicion += 90;
        if (evidenceGap >= 2) suspicion += 60 + evidenceGap * 25;
        if (d.band_conflict === true) suspicion += 85;
        if (!d.ai_regrade_version) suspicion += 40; // 8단계 전용 재판정을 한 번도 안 거친 문항
        if (d.scale_version !== DIFFICULTY_SCALE_VERSION) suspicion += 80;
        if (Number.isFinite(confidence) && confidence < .72) suspicion += 70 + Math.round((.72-confidence)*100);
        if (Number(current) >= 7) suspicion += 30; // 준킬러/킬러는 소수이므로 정기 재확인
        return { x, suspicion, confidence: Number.isFinite(confidence) ? confidence : 1 };
      })
      .sort((a,b) => b.suspicion-a.suspicion || a.confidence-b.confidence);

    // 의심 신호가 있는 문항 + 최신 일반 문항 일부를 2차 AI 검토한다.
    const suspicious = ranked.filter(r => r.suspicion > 0).map(r => r.x);
    const fallback = ranked.filter(r => r.suspicion === 0).slice(0, 40).map(r => r.x);
    const targets = [...suspicious, ...fallback].slice(0, 120);
    if (!targets.length) { setMessage("AI 이상 난이도 검토 대상이 없습니다."); return; }

    if (!window.confirm(`AI가 ${targets.length}문항을 2차 검토하고, 현재 난이도와 다르게 판단한 문항만 보여줍니다. DB는 자동 변경하지 않습니다. 진행할까요?`)) return;

    setRunning(true); setMessage(""); setError(""); setTestResults([]);
    setProgress({ mode:"anomaly", done:0, total:targets.length, ok:0, fail:0 });
    const anomalies: TestRow[] = [];
    let ok=0, fail=0;
    try {
      for (let i=0; i<targets.length; i+=20) {
        const batch = targets.slice(i,i+20);
        const res = await fetch("/api/problem-bank/regrade-difficulty-batch", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({problemIds:batch.map(x=>x.id),dryRun:true,referenceIds})
        });
        const data = await res.json().catch(()=>({}));
        const results = Array.isArray(data.results) ? data.results : [];
        const map = new Map(results.map((r:any)=>[String(r.problemId),r]));
        for (const target of batch) {
          const result:any = map.get(String(target.id));
          if (result?.ok || result?.success) {
            ok++;
            const proposed = String(result.difficulty ?? "");
            const current = norm(target.difficulty,target.problem_dna);
            if (proposed && proposed !== current && Number(result.confidence ?? 0) >= .60) {
              anomalies.push({...target,before:current,result:{...result,ok:true}});
            }
          } else fail++;
        }
        const done=Math.min(i+20,targets.length);
        setTestResults([...anomalies]);
        setProgress({mode:"anomaly",done,total:targets.length,ok,fail});
        setMessage(`AI 이상 난이도 검토 중 · ${done}/${targets.length} · 이상 의심 ${anomalies.length} · 검토 실패 ${fail}`);
      }
      setMessage(`AI 이상 난이도 검토 완료 · ${targets.length}문항 확인 · 이상 의심 ${anomalies.length}문항${fail ? ` · 실패 ${fail}` : ""}. 자동 변경은 하지 않았습니다.`);
    } catch(e) { setError(e instanceof Error ? e.message : "AI 이상 난이도 검토에 실패했습니다."); }
    finally { setRunning(false); setProgress(null); }
  }

  return <AdminPortalShell current="sos-difficulty">
  <main className="difficulty-page">
    <div className="difficulty-wrap">
      <div className="difficulty-header">
        <div><div className="eyebrow">MATHPOOH SOS</div><h1>난이도 관리</h1><p>AI가 문제를 먼저 재풀이한 뒤 8단계 난이도를 판정합니다. 관리자가 확정한 난이도는 자동으로 덮어쓰지 않습니다. <b>AI 미검증</b>은 저장된 난이도가 AI 재풀이로 확정된 값이 아닌 문항 수입니다. DNA 점수로 계산한 추정치, 옛 1~5단계 환산값, AI 판정 뒤에 보조 계산이 덮어쓴 문항이 모두 포함됩니다. 등급은 나왔으나 정답 대조나 신뢰도에 확인이 필요한 문항은 미판정이 아니라 <b>검토필요</b>로 분리되어 여기서 직접 확정할 수 있습니다.</p></div>
        <div className="header-buttons"><button onClick={()=>location.href="/problem-bank/barometer"}>학생·문항 바로미터</button><button onClick={()=>location.href="/admin?menu=sos-learning"}>관리자 홈</button><button onClick={()=>location.href="/problem-bank"}>SOS 문제은행</button></div>
      </div>

      {progress && <div className="progress-card">
        <div className="progress-copy"><b>{progress.mode==="sample"?"표본 재풀이 검증 중입니다...":progress.mode==="full"?"전체 난이도 미리보기/적용 작업 중입니다...":"AI 이상 난이도 검토 중입니다..."}</b><span>{progress.done}/{progress.total} · 성공 {progress.ok} · 실패 {progress.fail}</span></div>
        <div className="progress-track"><i style={{width:`${progress.total ? Math.round(progress.done/progress.total*100) : 0}%`}} /></div>
      </div>}
      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}

      <div className="difficulty-kpis">{D.map((d,i)=><div key={d}><b>{difficultyLabel(d)}</b><strong>{counts[i]}</strong></div>)}<div className="kpi-warn"><b>미분류</b><strong>{unclassifiedCount}</strong></div><div className="kpi-review"><b>검토필요</b><strong>{reviewCount}</strong></div><div className="kpi-warn"><b>AI 미검증</b><strong>{notJudgedCount}</strong></div></div>

      <section className="queue-card">
        <div className="queue-head">
          <div>
            <b>백그라운드 난이도 재판정</b>
            <span>서버가 10분마다 몇 문항씩 처리합니다. 이 화면을 닫아도 계속 진행됩니다.</span>
          </div>
          <strong>{queue ? `${queue.finished ?? 0} / ${queue.total ?? 0}` : "-"}</strong>
        </div>
        <div className="queue-track"><i style={{ width: `${queue?.percent ?? 0}%` }}/></div>
        <div className="queue-stats">
          <div><b>{queue?.counts?.QUEUED ?? 0}</b><span>대기</span></div>
          <div><b>{queue?.counts?.RUNNING ?? 0}</b><span>처리 중</span></div>
          <div><b>{queue?.counts?.DONE ?? 0}</b><span>완료</span></div>
          <div className="bad"><b>{queue?.counts?.FAILED ?? 0}</b><span>실패</span></div>
          <div><b>{queue?.counts?.SKIPPED ?? 0}</b><span>건너뜀</span></div>
        </div>
        <div className="queue-actions">
          <button disabled={queueBusy} onClick={()=>void queueAction("enqueue")} className="primary">AI 미검증 문항 대기열에 넣기</button>
          <button disabled={queueBusy || !(queue?.counts?.FAILED)} onClick={()=>void queueAction("retry")}>실패 {queue?.counts?.FAILED ?? 0}건 재시도</button>
          <button disabled={queueBusy || !(queue?.counts?.QUEUED)} onClick={()=>void queueAction("clear")} className="legacy-action">대기 비우기</button>
          <button disabled={queueBusy} onClick={()=>void loadQueue()}>새로고침</button>
        </div>
        <p className="queue-note">처리 순서: 미분류 → 3점·어3 → 나머지. 관리자 확정 문항과 AI 확정 문항은 대상에서 제외됩니다.</p>
      </section>

      <div className="filter-bar">
        <input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="문항명·단원·유형·출처 검색"/>
        <select value={subject} onChange={e=>setSubject(e.target.value)}>{subjects.map(x=><option key={x}>{x}</option>)}</select>
        <select value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option>전체</option>{DIFFICULTY_SCALE.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}<option value="미분류">미분류</option><option value="AI미검증">AI 미검증</option></select>
        <button disabled={running} onClick={runSampleRecheck} className="primary">① 표본 재풀이 검증</button>
        {sampleSummary.failed>0 && <button disabled={running} onClick={retryAllFailures} className="retry-all">↻ 검증실패 {sampleSummary.failed}문항 다시 검증</button>}
        <button disabled={running || testResults.length===0} title={!testResults.length?"먼저 표본 재풀이 검증을 실행하세요":sampleSummary.failed>0?`표본에 검증실패 ${sampleSummary.failed}문항이 있습니다. 그 문항은 미리보기 대상에서 제외됩니다.`:"DB를 바꾸지 않고 전체 예상 난이도를 계산합니다"} onClick={runVerifiedFullPreview}>② 전체 재판정 미리보기</button>
        <button disabled={running} onClick={runAnomalyReview}>AI 이상 난이도 검토</button>
        <button disabled={running} onClick={runFullEightScaleReview} className="legacy-action">DNA만 재계산(보조)</button>
      </div>

      {fullPreviewResults.length>0 && <section className="preview-section">
        <div className="preview-head">
          <div><b>② 전체 재판정 미리보기</b><span>DB는 아직 변경되지 않았습니다.{previewGeneratedAt?` · 계산 ${new Date(previewGeneratedAt).toLocaleString("ko-KR")}`:""}</span></div>
          <strong>{fullPreviewSummary.total}문항</strong>
        </div>
        <div className="preview-stats">
          <div><b>{fullPreviewSummary.kept}</b><span>기준 유지</span></div>
          <div><b>{fullPreviewSummary.changed}</b><span>난이도 변경 예상</span></div>
          <div><b>{fullPreviewSummary.review}</b><span>검토필요 · 보존</span></div>
          <div><b>{fullPreviewSummary.unclassified}</b><span>미판정 · 보존</span></div>
          <div className={fullPreviewSummary.failed?"bad":""}><b>{fullPreviewSummary.failed}</b><span>검증실패 · 보존</span></div>
        </div>
        <div className="distribution-compare">
          <div>
            <strong>현재 분포</strong>
            <div className="dist-grid">{DIFFICULTY_SCALE.map((d,i)=><span key={`cur-${d.value}`}><small>{d.label}</small><b>{counts[i]}</b></span>)}</div>
          </div>
          <div>
            <strong>미리보기 예상 분포</strong>
            <div className="dist-grid">{DIFFICULTY_SCALE.map(d=><span key={`next-${d.value}`}><small>{d.label}</small><b>{fullPreviewSummary.expected.get(d.value)||0}</b></span>)}</div>
          </div>
        </div>
        <div className="preview-matrix"><b>주요 이동</b><span>{fullPreviewSummary.matrix.slice(0,20).map(([k,v])=>`${difficultyLabel(k.split("→")[0])}→${difficultyLabel(k.split("→")[1])} ${v}`).join(" · ") || "이동 없음"}</span></div>
        <div className="preview-warning"><b>아직 DB 변경 0건</b><span>검토필요·미판정·실패는 최종 적용에서도 기존 난이도를 유지합니다. 미리보기 결과가 납득될 때만 아래 버튼을 누르세요.</span></div>
        <button className="apply-preview" disabled={running || fullPreviewSummary.applicable===0} onClick={()=>void applyFullPreview()}>③ 미리보기 검증 결과 DB에 최종 적용</button>
      </section>}

      {testResults.length>0 && <section className="test-section">
        <div className="test-section-head"><div><b>SOS249 난이도 표본 재검증 결과</b><span>현재값과 새 재풀이 검증 결과를 비교합니다. 미판정/검토필요는 자동 적용하지 않습니다.</span></div><strong>{testResults.length}문항</strong></div>
        <div className="sample-summary"><div><b>{sampleSummary.kept}</b><span>기준 유지</span></div><div><b>{sampleSummary.changed}</b><span>기준과 변경</span></div><div><b>{sampleSummary.unclassified}</b><span>미판정</span></div><div><b>{sampleSummary.review}</b><span>검토필요</span></div><div className="failure-summary"><b>{sampleSummary.failed}</b><span>검증실패</span></div><div className="matrix"><strong>집계</strong><span>{sampleSummary.accounted}/{sampleSummary.total} · {sampleSummary.accounted===sampleSummary.total?"정상":"⚠ 중복/누락 확인"}</span><strong>주요 이동</strong><span>{sampleSummary.matrix.slice(0,8).map(([key,count])=>`${key.replace(/^(\d)→(\d)$/,(m,a,b)=>`${difficultyLabel(a)}→${difficultyLabel(b)}`)} ${count}`).join(" · ")||"변경 없음"}</span></div></div>
        <div className="test-grid">{testResults.map((x)=><article key={x.id} className={`test-card ${x.result?.ok ? (x.before !== String(x.result.difficulty) ? "changed" : "same") : "failed"}`}>
          <div className="test-card-head"><div><b>{x.question_no}번</b><span>{x.subject} · {x.unit}</span></div><code>{x.problem_code}</code></div>
          <div className="test-image-wrap"><TestProblemImage problemId={x.id} questionNo={x.question_no}/></div>
          <div className="test-title">{x.title}</div>
          <div className="difficulty-compare">
            <div><small>현재 저장 난이도{x.before !== norm(x.difficulty,x.problem_dna) ? ` · 테스트 당시 ${x.before}` : ""}</small><strong>{difficultyLabel(norm(x.difficulty,x.problem_dna))}</strong></div><span>→</span><div><small>AI 제안</small><strong className={x.result?.ok ? "proposal" : "fail-text"}>{x.result?.ok ? (x.result.decision==="unclassified" || !x.result.difficulty ? "미판정" : difficultyLabel(x.result.difficulty)) : "실패"}</strong></div>
          </div>
          {x.result?.ok ? <>
            <div className="ai-meta"><span>{bandLabel(x.result.csatDifficultyBand)}</span><span>난이도 신뢰도 {confidenceLabel(x.result.confidence)}</span><span>재풀이 {x.result.solutionVerified?"검증완료":"검증필요"}</span><span>정답대조 {x.result.answerConsistency||"unknown"}</span>{x.result.reviewRequired&&<span className="warn-chip">검토필요</span>}</div><div className="solve-box"><b>AI 독립 재풀이</b><span>산출답 {x.result.solvedAnswer||"-"}</span><span>추론 {x.result.reasoningSteps??0}단계 · 조건변환 {x.result.conditionTransformations??0} · 계산부담 {x.result.calculationLoad??0}/5 · 발상부담 {x.result.insightLoad??0}/5</span>{x.result.reviewReason&&<small>{x.result.reviewReason}</small>}</div>
            <div className="reason-box"><b>AI 판정 근거</b><p>{x.result.reason || "판정 근거가 없습니다."}</p></div>
            <div className="review-actions">
              <button className="keep" disabled={savingId===x.id} onClick={()=>setTestResults(prev=>prev.filter(row=>row.id!==x.id))}>현재 유지</button><button className="accept" disabled={savingId===x.id || x.result.decision==="unclassified" || !x.result.difficulty || x.result.reviewRequired || norm(x.difficulty,x.problem_dna)===String(x.result.difficulty)} onClick={()=>void changeDifficulty(x.id,String(x.result?.difficulty ?? x.before))}>{savingId===x.id ? "저장 중..." : x.result.decision==="unclassified" || !x.result.difficulty ? "미판정 · 자동적용 금지" : x.result.reviewRequired ? "검토필요 · 직접 확인" : norm(x.difficulty,x.problem_dna)===String(x.result.difficulty) ? "현재값과 동일" : `AI 제안 ${difficultyLabel(x.result.difficulty)} 적용`}</button>
              <label><span>직접 수정</span><select disabled={savingId===x.id} value={norm(x.difficulty,x.problem_dna)} onChange={e=>void changeDifficulty(x.id,e.target.value)}><option value="" disabled>미분류</option>{DIFFICULTY_SCALE.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
            </div>
            {savedDifficulty[x.id] && <div className="saved-inline">✓ DB에 {difficultyLabel(savedDifficulty[x.id])}로 저장됨</div>}
          </> : <>
            <div className="reason-box failure"><b>검증실패 · 기존 난이도 유지</b><p>{x.result?.message || "AI 판정에 실패했습니다."}</p><small>원인: {failureTypeLabel(x.result?.failureType)}{x.result?.failureStage?` · 단계 ${failureStageLabel(x.result.failureStage)}`:""}</small>{x.result?.failureDetail?<details><summary>기술 상세</summary><pre>{String(x.result.failureDetail).slice(0,1600)}</pre></details>:null}</div>
            <div className="failure-actions"><button disabled={running || !!retryingId} onClick={()=>void retryVerification(x.id)}>{retryingId===x.id?"다시 검증 중...":"↻ 이 문항 다시 검증"}</button><span>검증이 성공하기 전에는 전체 재판정에 사용되지 않습니다.</span></div>
          </>}
        </article>)}</div>
      </section>}

      <div className="bank-table">
        <div className="bank-row head"><span>문항</span><span>코드</span><span>단원 · 유형</span><span>출처</span><span>난이도</span></div>
        {loading ? <div className="loading-row">불러오는 중...</div> : filtered.map(x=><div key={x.id} className="bank-row"><b>{x.question_no}번</b><span>{x.problem_code}</span><span><b>{x.unit}</b><small>{x.topic || x.title}</small></span><span>{x.source_name}</span><select value={norm(x.difficulty,x.problem_dna)} onChange={e=>void changeDifficulty(x.id,e.target.value)}><option value="" disabled>미분류</option>{DIFFICULTY_SCALE.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}</select></div>)}
      </div>
    </div>
    <style jsx>{`
      .difficulty-page{height:100vh;min-height:0;overflow-y:auto;overflow-x:hidden;background:#f5f7f6;padding:28px;font-family:Arial,"Noto Sans KR",sans-serif;color:#15231c}.difficulty-wrap{max-width:1560px;margin:0 auto}.difficulty-header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}.eyebrow{font-size:12px;font-weight:900;color:#247a4b;letter-spacing:1px}.difficulty-header h1{margin:6px 0;font-size:30px}.difficulty-header p{margin:0;color:#66736c}.header-buttons{display:flex;gap:8px}.header-buttons button,.filter-bar button{border:1px solid #d9e1dc;background:#fff;border-radius:9px;padding:10px 14px;font-weight:800;cursor:pointer}.progress-card{background:#eff8f2;border:1px solid #b9dcc7;border-radius:13px;padding:14px 16px;margin-bottom:12px}.progress-copy{display:flex;justify-content:space-between;gap:12px;margin-bottom:9px}.progress-copy span{color:#4f6658;font-size:13px}.progress-track{height:10px;background:#dcebe1;border-radius:999px;overflow:hidden}.progress-track i{display:block;height:100%;background:#247a4b;transition:width .2s}.notice{padding:12px;border-radius:10px;margin-bottom:12px}.notice.success{background:#eaf7ef;border:1px solid #b7dfc6}.notice.error{background:#fff0f0;border:1px solid #efc0c0;color:#a52020}.difficulty-kpis{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:10px;margin-bottom:16px}.difficulty-kpis>div{background:#fff;border:1px solid #dfe6e2;border-radius:12px;padding:16px}.difficulty-kpis strong{display:block;font-size:28px;margin-top:6px}.difficulty-kpis .kpi-warn{background:#fff8ee;border-color:#ecd4a9}.difficulty-kpis .kpi-review{background:#fff1f1;border-color:#ecc5c5}.queue-card{background:#fff;border:1px solid #cfe3d7;border-radius:14px;padding:16px;margin-bottom:14px}.queue-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}.queue-head>div{display:flex;flex-direction:column;gap:4px}.queue-head b{font-size:17px}.queue-head span{font-size:12px;color:#66756c}.queue-head>strong{font-size:19px;color:#247a4b;white-space:nowrap}.queue-track{height:10px;background:#e6efe9;border-radius:999px;overflow:hidden;margin-bottom:12px}.queue-track i{display:block;height:100%;background:#247a4b;transition:width .3s}.queue-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:12px}.queue-stats>div{background:#f3f7f4;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:3px}.queue-stats b{font-size:20px;color:#255f3b}.queue-stats span{font-size:11px;color:#64756b}.queue-stats .bad{background:#fff1f1}.queue-stats .bad b{color:#a83333}.queue-actions{display:flex;gap:8px;flex-wrap:wrap}.queue-actions button{border:1px solid #d9e1dc;background:#fff;border-radius:9px;padding:10px 14px;font-weight:800;cursor:pointer}.queue-actions .primary{background:#207a49;color:#fff;border-color:#207a49}.queue-actions .legacy-action{color:#78847d;background:#f7f8f7}.queue-actions button:disabled{opacity:.5;cursor:not-allowed}.queue-note{margin:10px 0 0;font-size:12px;color:#6d7c73}@media(max-width:760px){.queue-stats{grid-template-columns:repeat(2,1fr)}}.filter-bar{background:#fff;border:1px solid #dfe6e2;border-radius:14px;padding:14px;margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap}.filter-bar input{min-width:300px;flex:1;padding:10px;border:1px solid #d9e1dc;border-radius:8px}.filter-bar select,.bank-row select,.review-actions select{padding:9px;border:1px solid #d9e1dc;border-radius:8px;background:#fff}.filter-bar .primary{background:#207a49;color:#fff;border-color:#207a49}.filter-bar .legacy-action{color:#78847d;background:#f7f8f7}.filter-bar .retry-all{color:#a33;background:#fff2f2;border-color:#efcaca}.filter-bar button:disabled,.review-actions button:disabled{opacity:.5;cursor:not-allowed}.preview-section{background:#fff;border:2px solid #8fc7a6;border-radius:14px;padding:18px;margin-bottom:16px}.preview-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.preview-head>div{display:flex;flex-direction:column;gap:4px}.preview-head b{font-size:19px}.preview-head span{font-size:12px;color:#607168}.preview-head>strong{font-size:18px;color:#247a4b}.preview-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:14px}.preview-stats>div{background:#f2f7f4;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:4px}.preview-stats b{font-size:23px;color:#235e3a}.preview-stats span{font-size:12px;color:#617168}.preview-stats .bad{background:#fff1f1}.preview-stats .bad b{color:#a83333}.distribution-compare{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}.distribution-compare>div{border:1px solid #e0e7e3;border-radius:11px;padding:12px}.distribution-compare>div>strong{display:block;margin-bottom:9px}.dist-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px}.dist-grid span{background:#f5f8f6;border-radius:8px;padding:8px 5px;text-align:center;display:flex;flex-direction:column;gap:3px}.dist-grid small{font-size:10px;color:#68766f}.dist-grid b{font-size:17px}.preview-matrix{background:#f5f8f6;border-radius:10px;padding:11px 12px;display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}.preview-matrix b{white-space:nowrap;color:#2b5f3f}.preview-matrix span{font-size:12px;line-height:1.55;color:#53665b}.preview-warning{background:#fff8ea;border:1px solid #ead3a5;border-radius:10px;padding:11px 12px;margin-bottom:10px;display:flex;flex-direction:column;gap:4px}.preview-warning b{color:#8a5a12}.preview-warning span{font-size:12px;color:#705f40}.apply-preview{width:100%;border:1px solid #176c3d;background:#176c3d;color:#fff;border-radius:10px;padding:13px 16px;font-size:15px;font-weight:900;cursor:pointer}.apply-preview:disabled{opacity:.45;cursor:not-allowed}.test-section{background:#fff;border:1px solid #dfe6e2;border-radius:14px;padding:16px;margin-bottom:16px}.test-section-head{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-bottom:14px}.test-section-head>div{display:flex;flex-direction:column;gap:4px}.test-section-head b{font-size:18px}.test-section-head span{font-size:13px;color:#6e7a73}.test-section-head>strong{color:#247a4b}.sample-summary{display:grid;grid-template-columns:repeat(5,110px) minmax(240px,1fr);gap:8px;margin-bottom:14px}.sample-summary>div{padding:10px 12px;border-radius:10px;background:#f3f7f4;display:flex;flex-direction:column;gap:3px}.sample-summary b{font-size:20px;color:#255f3b}.sample-summary span{font-size:11px;color:#64756b}.sample-summary .failure-summary{background:#fff1f1}.sample-summary .failure-summary b{color:#a83333}.sample-summary .matrix{justify-content:center}.sample-summary .matrix strong{font-size:11px;color:#315f43}.sample-summary .matrix span{line-height:1.45}.test-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.test-card{border:1px solid #dfe6e2;border-radius:13px;padding:14px;background:#fcfdfc;min-width:0}.test-card.changed{border-color:#e2bd74;box-shadow:inset 4px 0 0 #d49a2d}.test-card.failed{border-color:#edc7c7;box-shadow:inset 4px 0 0 #c94d4d}.test-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.test-card-head>div{display:flex;flex-direction:column;gap:3px}.test-card-head b{font-size:18px}.test-card-head span{font-size:12px;color:#6f7b74}.test-card-head code{font-size:11px;color:#607168;max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.test-image-wrap{height:560px;background:#eef2ef;border:1px solid #e0e6e2;border-radius:10px;overflow:hidden;display:block}:global(.test-image-scroll){width:100%;height:100%;overflow-y:auto;overflow-x:auto;background:#fff;padding:8px;box-sizing:border-box;overscroll-behavior:contain;scrollbar-gutter:stable}:global(.test-image-scroll img){display:block;width:100%;max-width:100%;height:auto}.test-image-empty{height:100%;display:flex;align-items:center;justify-content:center;color:#7b857f;font-size:13px}.test-title{font-weight:800;font-size:14px;line-height:1.45;margin:10px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.difficulty-compare{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;background:#f3f6f4;border-radius:10px;padding:10px}.difficulty-compare>div{display:flex;align-items:center;justify-content:center;gap:8px}.difficulty-compare small{color:#748078}.difficulty-compare strong{font-size:24px}.difficulty-compare .proposal{color:#1d7545}.difficulty-compare .fail-text{color:#b63737;font-size:16px}.ai-meta{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.ai-meta span{background:#eef5f1;color:#3b6650;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:800}.ai-meta .warn-chip{background:#fff0e6;color:#a34c18}.solve-box{display:grid;grid-template-columns:auto 1fr;gap:5px 12px;margin:10px 0;padding:10px 12px;background:#f7faf8;border:1px solid #e0e8e3;border-radius:10px;font-size:12px}.solve-box b{grid-row:1/4;color:#315f43}.solve-box span{color:#50665a}.solve-box small{color:#a34c18;font-weight:800}.reason-box{border:1px solid #e3e9e5;border-radius:10px;padding:10px 12px;background:#fff}.reason-box b{font-size:12px;color:#607168}.reason-box p{margin:5px 0 0;line-height:1.55;font-size:13px}.reason-box.failure{background:#fff5f5;border-color:#efcece}.failure-actions{margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.failure-actions button{border:1px solid #c94d4d;background:#fff;color:#a52f2f;border-radius:9px;padding:10px 12px;font-weight:900;cursor:pointer}.failure-actions button:disabled{opacity:.5;cursor:not-allowed}.failure-actions span{font-size:12px;color:#8a5a5a}.review-actions{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-top:10px}.review-actions .keep{border:1px solid #cfd8d2;background:#fff;color:#41564a;border-radius:9px;padding:10px;font-weight:900;cursor:pointer}.review-actions .accept{flex:1;border:1px solid #247a4b;background:#247a4b;color:#fff;border-radius:9px;padding:10px;font-weight:900;cursor:pointer}.review-actions label{display:flex;flex-direction:column;gap:4px}.review-actions label span{font-size:11px;color:#6f7b74;font-weight:800}.saved-inline{margin-top:8px;padding:8px 10px;border-radius:8px;background:#eaf7ef;color:#17663b;font-size:12px;font-weight:900;text-align:center}.bank-table{background:#fff;border:1px solid #dfe6e2;border-radius:14px;overflow:hidden}.bank-row{display:grid;grid-template-columns:80px 150px 1.2fr 1fr 130px;gap:10px;padding:12px;border-top:1px solid #edf0ee;align-items:center}.bank-row.head{font-weight:800;background:#f0f5f2;border-top:0}.bank-row>span:nth-child(3){display:flex;flex-direction:column;gap:3px}.bank-row small{color:#78847d}.loading-row{padding:30px}@media(max-width:1050px){.distribution-compare{grid-template-columns:1fr}.dist-grid{grid-template-columns:repeat(4,1fr)}.preview-stats{grid-template-columns:repeat(3,1fr)}.test-grid{grid-template-columns:1fr}.difficulty-kpis{grid-template-columns:repeat(3,1fr)}.sample-summary{grid-template-columns:repeat(2,1fr)}.sample-summary .matrix{grid-column:1/-1}}@media(max-width:760px){.preview-stats{grid-template-columns:repeat(2,1fr)}.dist-grid{grid-template-columns:repeat(2,1fr)}.difficulty-page{padding:14px}.difficulty-header{flex-direction:column}.difficulty-kpis{grid-template-columns:repeat(2,1fr)}.test-image-wrap{height:460px}.bank-row{grid-template-columns:60px 1fr 95px}.bank-row>span:nth-child(2),.bank-row>span:nth-child(4),.bank-row.head>span:nth-child(2),.bank-row.head>span:nth-child(4){display:none}.progress-copy{flex-direction:column}}
    `}</style>
  </main>
  </AdminPortalShell>;
}
