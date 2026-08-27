"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import AdminPortalShell from "@/components/admin-portal-sidebar";
import MATHPOOHLoader from "../../../components/math-pooh-loader";
import { sosPhaseText, sosStatusText } from "@/lib/sos-stage-state";

const statusText = sosStatusText;
const phaseText = (r: any) => sosPhaseText(r);
function outcomeCounts(r: any) {
  const items = Array.isArray(r?.items) ? r.items : [];
  const wrong = items.filter((x: any) => x.isCorrect === false);
  const corrected = wrong.filter((x: any) => x.reviewIsCorrect === true).length;
  const explained = wrong.filter((x: any) => x.reviewExplained === true).length;
  const explainRequired = wrong.filter(
    (x: any) =>
      x.reviewIsCorrect !== true &&
      (x.reviewExplained === true || Number(x.reviewAttemptCount ?? 0) >= 3),
  ).length;
  return {
    initialCorrect: items.filter((x: any) => x.isCorrect === true).length,
    total: items.length,
    wrong: wrong.length,
    corrected,
    explained,
    explainRequired,
  };
}

function ReviewAttemptTrail({ item }: { item: any }) {
  const logged = Array.isArray(item?.reviewAttempts) ? item.reviewAttempts : [];
  const attempts = logged.length
    ? logged
    : String(item?.reviewAnswer ?? "").trim()
      ? [
          {
            attemptNo: Number(item?.reviewAttemptCount ?? 1) || 1,
            isCorrect: item?.reviewIsCorrect === true,
            answer: String(item?.reviewAnswer ?? ""),
          },
        ]
      : [];
  return (
    <div
      className="attempt-trail"
      aria-label={`${item?.order ?? ""}번 정오 이력`}
    >
      <span
        className={`attempt-chip ${item?.isCorrect === true ? "pass" : item?.isCorrect === false ? "fail" : "pending"}`}
      >
        <i>최초</i>
        <b>
          {item?.isCorrect === true
            ? "O"
            : item?.isCorrect === false
              ? "X"
              : "-"}
        </b>
      </span>
      {attempts.map((a: any, index: number) => (
        <span
          key={`${a.attemptNo}-${index}`}
          className={`attempt-chip ${a.isCorrect === true ? "pass" : "fail"}`}
          title={a.answer ? `입력답 ${a.answer}` : undefined}
        >
          <i>재{Number(a.attemptNo ?? index + 1)}</i>
          <b>{a.isCorrect === true ? "O" : "X"}</b>
        </span>
      ))}
      {item?.reviewExplained === true ? (
        <span className="attempt-chip explained">
          <i>풀이확인</i>
          <b>✓</b>
        </span>
      ) : null}
    </div>
  );
}

function timeText(value: any) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
}
function elapsed(start: any, end: any, serverTime: any) {
  if (!start) return "-";
  const a = new Date(start).getTime(),
    b = new Date(end || serverTime || Date.now()).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "-";
  const sec = Math.max(0, Math.floor((b - a) / 1000));
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  return min < 60
    ? `${min}분 ${sec % 60}초`
    : `${Math.floor(min / 60)}시간 ${min % 60}분`;
}
function logText(log: any) {
  const q = Number(log?.detail?.question ?? 0);
  const sec = Number(
    log?.detail?.responseSeconds ?? log?.detail?.awaySeconds ?? 0,
  );
  switch (log.eventType) {
    case "SESSION_STARTED":
      return "학습 시작";
    case "QUESTION_REVEALED":
      return q ? `${q}번 문제 공개` : "문제 공개";
    case "ANSWER_LOCKED":
      return q ? `${q}번 답안 확정` : `답안 확정${sec ? ` · ${sec}초` : ""}`;
    case "TRAINING_ITEM_DONE":
      return `${q || "-"}번 훈련 답 저장${sec ? ` · ${sec}초` : ""}`;
    case "REVIEW_ITEM_DONE":
      return `${q || "-"}번 오답 재풀이 저장${sec ? ` · ${sec}초` : ""}`;
    case "REVIEW_ITEM_RETRY_WRONG":
      return `${q || "-"}번 오답 재도전 실패${sec ? ` · ${sec}초` : ""}`;
    case "REVIEW_ITEM_CORRECTED":
      return `${q || "-"}번 오답 스스로 교정 완료${sec ? ` · ${sec}초` : ""}`;
    case "REVIEW_HINT_USED":
      return `${q || "-"}번 풀이 힌트 ${Number(log?.detail?.level ?? 0)}단계 사용`;
    case "REVIEW_ITEM_EXPLAINED":
      return `${q || "-"}번 정답·핵심풀이 확인 완료`;
    case "SCREEN_EXIT":
      return "시험 화면 이탈";
    case "SCREEN_RETURN":
      return `시험 화면 복귀${sec ? ` · ${sec}초 이탈` : ""}`;
    case "SESSION_SUBMITTED":
      return "학습 제출";
    case "REVIEW_COMPLETED":
      return "오답 완료";
    case "ADMIN_RESET":
      return `관리자 리셋 · ${log?.detail?.scope === "FULL" ? "SOS 전체" : log?.detail?.scope === "REVIEW" ? "오답만" : "이 단계부터"}${log?.detail?.adminEmail ? ` · ${log.detail.adminEmail}` : ""}`;
    case "ADMIN_ANSWER_CORRECTED":
      return `${q || "-"}번 정답 수정 · ${log?.detail?.previousAnswer || "-"} → ${log?.detail?.newAnswer || "-"}${log?.detail?.adminEmail ? ` · ${log.detail.adminEmail}` : ""}`;
    case "ADMIN_STUDENT_ANSWER_CORRECTED":
      return `${q || "-"}번 학생${log?.detail?.field === "review" ? " 교정답" : " 최초답"} 수정 · ${log?.detail?.previousAnswer || "-"} → ${log?.detail?.newAnswer || "-"}${log?.detail?.adminEmail ? ` · ${log.detail.adminEmail}` : ""}`;
    case "ADMIN_STAGE_COMPLETED":
      return `관리자 단계 완료 · ${log?.detail?.correct ?? 0}/${log?.detail?.total ?? 0} 정답${log?.detail?.adminEmail ? ` · ${log.detail.adminEmail}` : ""}`;
    default:
      return String(log.eventType ?? "");
  }
}

export default function SosProgressPage() {
  const [rows, setRows] = useState<any[]>([]),
    [summary, setSummary] = useState<any>({});
  const [serverTime, setServerTime] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [keyword, setKeyword] = useState(""),
    [phase, setPhase] = useState("전체"),
    [status, setStatus] = useState("전체"),
    [cycle, setCycle] = useState("전체"),
    [selected, setSelected] = useState("");
  // SOS284: 회차별로만 묶여 있어서 한 회차 안에 여러 학생의 단계가 이어져 나왔다.
  // 학생 단위로도 묶어 볼 수 있게 한다.
  const [groupBy, setGroupBy] = useState<"student" | "cycle">("student");
  const [resultSelected, setResultSelected] = useState("");
  const [resetBusy, setResetBusy] = useState("");
  const [completeBusy, setCompleteBusy] = useState("");
  const [answerEdit, setAnswerEdit] = useState<{
    itemId: string;
    value: string;
  } | null>(null);
  const [answerBusy, setAnswerBusy] = useState("");
  const [studentAnswerEdit, setStudentAnswerEdit] = useState<{
    itemId: string;
    field: "initial" | "review";
    value: string;
  } | null>(null);
  const [studentAnswerBusy, setStudentAnswerBusy] = useState("");
  async function load() {
    setError("");
    try {
      const r = await fetch("/api/admin/sos-progress", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j?.success !== true)
        throw new Error(j?.message || "진행현황 조회 실패");
      setRows((prev) => {
        const detailMap = new Map<string, any>(
          prev
            .filter((x: any) => x.detailLoaded)
            .map((x: any) => [String(x.id), x]),
        );
        return (j.rows ?? []).map((x: any) => {
          const d = detailMap.get(String(x.id));
          return d
            ? { ...x, items: d.items, logs: d.logs, detailLoaded: true }
            : x;
        });
      });
      setSummary(j.summary ?? {});
      setServerTime(j.serverTime ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }
  async function ensureDetail(id: string) {
    const current = rows.find((x: any) => String(x.id) === id);
    if (current?.detailLoaded) return current;
    const r = await fetch(
      `/api/admin/sos-progress?sessionId=${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    const j = await r.json();
    if (!r.ok || j?.success !== true)
      throw new Error(j?.message || "단계 상세 조회 실패");
    let merged: any = null;
    setRows((prev) =>
      prev.map((x: any) => {
        if (String(x.id) !== id) return x;
        merged = { ...x, ...j.detail, detailLoaded: true };
        return merged;
      }),
    );
    return merged;
  }
  async function resetStage(r: any, scope: "STAGE" | "REVIEW" | "FULL") {
    const label = phaseText(r);
    const message =
      scope === "REVIEW"
        ? `${r.student?.name ?? "학생"}의 ${label} 오답 기록만 초기화할까요?\n최초 응시 결과는 유지되고 오답부터 다시 진행합니다.\n이미 생성된 이후 과정은 삭제됩니다.`
        : scope === "FULL"
          ? `${r.student?.name ?? "학생"}의 이번 SOS를 처음 진단부터 다시 시작할까요?\n현재 SOS의 이후 진단·훈련·숙제 기록이 모두 정리됩니다.`
          : `${r.student?.name ?? "학생"}의 ${label}부터 다시 시작할까요?\n이 단계의 응시 결과를 초기화하고 이후 과정은 모두 삭제합니다.`;
    if (!window.confirm(message)) return;
    if (
      scope === "FULL" &&
      !window.confirm("전체 SOS 초기화입니다. 정말 진행할까요?")
    )
      return;
    setResetBusy(`${r.id}:${scope}`);
    setError("");
    try {
      const response = await fetch("/api/admin/sos-progress/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: r.student?.id,
          sessionId: r.id,
          scope,
        }),
      });
      const json = await response.json();
      if (!response.ok || json?.success !== true)
        throw new Error(json?.message || "리셋 실패");
      setSelected("");
      setResultSelected("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "리셋 실패");
    } finally {
      setResetBusy("");
    }
  }
  async function completeStage(r: any) {
    if (!window.confirm(`${r.student?.name ?? "학생"}의 ${phaseText(r)} 단계를 완료 처리할까요?\n\n최초 정오답과 교정 기록은 그대로 보존하고 단계 상태만 완료로 마감합니다.\n이후 단계와 전체 SOS 기록은 건드리지 않습니다.`)) return;
    setCompleteBusy(String(r.id));setError("");
    try {
      const response=await fetch("/api/admin/sos-progress/complete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:r.id})});
      const json=await response.json();
      if(!response.ok||json?.success!==true)throw new Error(json?.message||"단계 완료 처리 실패");
      setResultSelected("");await load();
    } catch(e) {setError(e instanceof Error?e.message:"단계 완료 처리 실패");}
    finally {setCompleteBusy("");}
  }
  async function saveAnswer(session: any, item: any) {
    if (!answerEdit || answerEdit.itemId !== String(item.id)) return;
    const next = answerEdit.value.trim();
    if (!next) {
      setError("정답을 입력해 주세요.");
      return;
    }
    const prev = String(item.problem?.correctAnswer ?? "").trim();
    if (next === prev) {
      setAnswerEdit(null);
      return;
    }
    const scope = item.generated ? "이 AI 생성문항" : "문제은행 원본 문항";
    if (
      !window.confirm(
        `${item.order}번 정답을 ${prev || "-"} → ${next} 로 수정할까요?\n${scope}의 정답이 수정되고, 이 단계에 이미 제출된 학생 답안은 즉시 재채점됩니다.\n완료된 과거 바로미터는 자동 재계산하지 않습니다.`,
      )
    )
      return;
    setAnswerBusy(String(item.id));
    setError("");
    try {
      const response = await fetch("/api/admin/sos-progress/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          itemId: item.id,
          answer: next,
        }),
      });
      const json = await response.json();
      if (!response.ok || json?.success !== true)
        throw new Error(json?.message || "정답 수정 실패");
      setAnswerEdit(null);
      const detail = await fetch(
        `/api/admin/sos-progress?sessionId=${encodeURIComponent(String(session.id))}`,
        { cache: "no-store" },
      ).then((r) => r.json());
      if (detail?.success === true)
        setRows((prev) =>
          prev.map((x: any) =>
            String(x.id) === String(session.id)
              ? {
                  ...x,
                  ...detail.detail,
                  correct: json.correctCount,
                  detailLoaded: true,
                }
              : x,
          ),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "정답 수정 실패");
    } finally {
      setAnswerBusy("");
    }
  }
  async function saveStudentAnswer(session: any, item: any) {
    if (!studentAnswerEdit || studentAnswerEdit.itemId !== String(item.id))
      return;
    const next = studentAnswerEdit.value.trim();
    if (!next) {
      setError("학생 답을 입력해 주세요.");
      return;
    }
    const field = studentAnswerEdit.field;
    const prev =
      field === "review"
        ? String(item.reviewAnswer ?? "").trim()
        : String(item.studentAnswer ?? "").trim();
    if (next === prev) {
      setStudentAnswerEdit(null);
      return;
    }
    const label = field === "review" ? "오답 교정답" : "최초 입력답";
    if (
      !window.confirm(
        `${item.order}번 학생 ${label}을 ${prev || "-"} → ${next} 로 수정할까요?\n현재 정답 기준으로 즉시 재채점됩니다.\n이미 반영된 과거 바로미터와 이후 학습 분기는 자동으로 되돌리지 않습니다.`,
      )
    )
      return;
    setStudentAnswerBusy(String(item.id));
    setError("");
    try {
      const response = await fetch("/api/admin/sos-progress/student-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          itemId: item.id,
          field,
          answer: next,
        }),
      });
      const json = await response.json();
      if (!response.ok || json?.success !== true)
        throw new Error(json?.message || "학생 답 수정 실패");
      setStudentAnswerEdit(null);
      const detail = await fetch(
        `/api/admin/sos-progress?sessionId=${encodeURIComponent(String(session.id))}`,
        { cache: "no-store" },
      ).then((r) => r.json());
      if (detail?.success === true)
        setRows((prev) =>
          prev.map((x: any) =>
            String(x.id) === String(session.id)
              ? {
                  ...x,
                  ...detail.detail,
                  correct: json.correctCount,
                  detailLoaded: true,
                }
              : x,
          ),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "학생 답 수정 실패");
    } finally {
      setStudentAnswerBusy("");
    }
  }
  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (!rows.length) return;
    const sessionId = new URLSearchParams(window.location.search).get(
      "sessionId",
    );
    if (
      !sessionId ||
      !rows.some((r: any) => String(r.id) === sessionId) ||
      resultSelected === sessionId
    )
      return;
    void ensureDetail(sessionId)
      .then(() => setResultSelected(sessionId))
      .catch(() => {});
  }, [rows.length]);
  const cycleOptions = useMemo(
    () => [
      ...new Map(
        rows
          .filter((r: any) => r.learningCycle?.id)
          .map((r: any) => [r.learningCycle.id, r.learningCycle]),
      ).values(),
    ],
    [rows],
  );
  const filtered = useMemo(
    () =>
      rows
        .filter((r: any) => {
          const t =
            `${r.student?.name ?? ""} ${r.student?.school ?? ""} ${r.subject} ${r.subunit}`.toLowerCase();
          return (
            (!keyword || t.includes(keyword.toLowerCase())) &&
            (phase === "전체" || r.phase === phase) &&
            (status === "전체" || r.status === status) &&
            (cycle === "전체" || r.learningCycle?.id === cycle)
          );
        })
        .sort((a: any, b: any) =>
          groupBy === "student"
            ? String(a.student?.name ?? "").localeCompare(
                String(b.student?.name ?? ""),
                "ko",
              ) ||
              String(b.learningCycle?.startDate ?? "").localeCompare(
                String(a.learningCycle?.startDate ?? ""),
              ) ||
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            : String(b.learningCycle?.startDate ?? "").localeCompare(
                String(a.learningCycle?.startDate ?? ""),
              ) ||
              String(a.learningCycle?.name ?? "회차 미지정").localeCompare(
                String(b.learningCycle?.name ?? "회차 미지정"),
                "ko",
              ) ||
              String(a.student?.name ?? "").localeCompare(
                String(b.student?.name ?? ""),
                "ko",
              ) ||
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
    [rows, keyword, phase, status, cycle, groupBy],
  );
  // SOS285: 주차 라벨 대신 날짜 + 시험지 코드로 표기한다.
  const stampOf = (r: any) => {
    const d = new Date(r?.createdAt ?? Date.now());
    const w = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    const date = `${d.getMonth() + 1}/${d.getDate()}(${w})`;
    const code =
      String(r?.sourceExamCode ?? "").trim() ||
      String(r?.sourceExamTitle ?? "").trim();
    return code ? `${date} · ${code}` : date;
  };
  const cycleKey = (r: any) => String(r.learningCycle?.id ?? "UNASSIGNED");
  const cycleTitle = (r: any) =>
    r.learningCycle
      ? `${r.learningCycle.name} · ${r.learningCycle.dateLabel}`
      : "회차 미지정";
  const examKey = (r: any) =>
    String(r?.sourceExamCode ?? r?.sourceExamTitle ?? "UNKNOWN");
  // SOS284: 묶음 기준에 따라 밴드 키/제목을 바꾼다.
  const bandKey = (r: any) =>
    groupBy === "student"
      ? String(r.student?.id ?? r.student?.name ?? "UNKNOWN")
      : cycleKey(r);
  const bandTitle = (r: any) =>
    groupBy === "student" ? `${r.student?.name ?? "학생"}` : cycleTitle(r);
  const bandSub = (r: any) => {
    if (groupBy !== "student")
      return r.learningCycle
        ? "이 회차의 진단·훈련 진행 기록"
        : "회차를 지정하지 않은 과거/임시 SOS";
    const mine = filtered.filter((x: any) => bandKey(x) === bandKey(r));
    const done = mine.filter((x: any) =>
      ["COMPLETED", "PASSED"].includes(String(x.status)),
    ).length;
    const open = mine.filter((x: any) =>
      ["IN_PROGRESS", "RETRAIN"].includes(String(x.status)),
    ).length;
    return `${r.student?.school ?? "-"} · ${r.student?.grade ?? "-"} · 단계 ${mine.length}개 · 완료 ${done} · 진행중 ${open}`;
  };
  return (
    <AdminPortalShell current="sos-learning">
      <main className="progress-page">
        {resetBusy ? (
          <div className="reset-loader">
            <MATHPOOHLoader
              title="SOS 진행단계를 초기화하고 있습니다"
              detail="선택한 단계와 이후 과정을 안전하게 정리하고 있습니다. 잠시만 기다려 주세요."
              kind="save"
              audience="admin"
            />
          </div>
        ) : null}
        <header className="top">
          <div>
            <small>MATHPOOH SOS · LIVE PROGRESS</small>
            <h1>SOS 진행관리</h1>
            <p>
              성적은 빼고, 학생이 언제 시작했고 어디까지 했는지와 응시 로그만
              확인합니다.
            </p>
            <nav>
              <button
                onClick={() => (location.href = "/admin?menu=sos-learning")}
              >
                배정
              </button>
              <button className="active">진행</button>
              <button onClick={() => (location.href = "/admin/sos-results")}>
                결과
              </button>
              <button onClick={() => (location.href = "/admin/sos-status")}>
                학습현황
              </button>
            </nav>
          </div>
          <button className="refresh" onClick={() => void load()}>
            새로고침
          </button>
        </header>
        {error ? <div className="error">{error}</div> : null}
        <section className="cards">
          <article>
            <span>전체</span>
            <b>{summary.total ?? 0}</b>
          </article>
          <article>
            <span>대기·진행</span>
            <b>{summary.active ?? 0}</b>
          </article>
          <article>
            <span>진행중</span>
            <b>{summary.inProgress ?? 0}</b>
          </article>
          <article>
            <span>완료</span>
            <b>{summary.completed ?? 0}</b>
          </article>
        </section>
        <section className="filters">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="학생·학교·소단원 검색"
          />
          <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
            <option>전체</option>
            {cycleOptions.map((w: any) => (
              <option key={w.id} value={w.id}>
                {w.name} · {w.dateLabel}
              </option>
            ))}
          </select>
          <select value={phase} onChange={(e) => setPhase(e.target.value)}>
            <option>전체</option>
            <option value="DIAGNOSIS">진단</option>
            <option value="TRAINING">훈련</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>전체</option>
            <option value="ASSIGNED">미응시</option>
            <option value="IN_PROGRESS">진행중</option>
            <option value="RETRAIN">오답중</option>
            <option value="COMPLETED">완료</option>
            <option value="PASSED">완료(통과)</option>
          </select>
          <div className="group-toggle">
            <span>묶음</span>
            <button
              type="button"
              className={groupBy === "student" ? "on" : ""}
              onClick={() => setGroupBy("student")}
            >
              학생별
            </button>
            <button
              type="button"
              className={groupBy === "cycle" ? "on" : ""}
              onClick={() => setGroupBy("cycle")}
            >
              회차별
            </button>
          </div>
        </section>
        <section className="table">
          <div className="row head">
            <span>학생</span>
            <span>단계</span>
            <span>상태</span>
            <span>진도</span>
            <span>배정</span>
            <span>시작</span>
            <span>완료</span>
            <span>소요</span>
            <span>로그</span>
            <span>관리</span>
          </div>
          {loading ? (
            <MATHPOOHLoader
              title="SOS 진행상황을 가져오는 중입니다"
              detail="학생별 진단·훈련 단계와 진행 로그를 준비하고 있습니다."
              kind="loading"
              audience="admin"
            />
          ) : filtered.length ? (
            filtered.map((r: any, index: number) => (
              <Fragment key={r.id}>
                {index === 0 || bandKey(filtered[index - 1]) !== bandKey(r) ? (
                  <div
                    className={`cycle-band ${groupBy === "student" ? "student-band" : ""}`}
                  >
                    <b>{bandTitle(r)}</b>
                    <span>{bandSub(r)}</span>
                  </div>
                ) : null}
                <div
                  className={`row-wrap ${resultSelected === String(r.id) ? "result-open" : ""}`}
                >
                  <div
                    className="row clickable"
                    onClick={async () => {
                      const id = String(r.id);
                      if (resultSelected === id) {
                        setResultSelected("");
                        return;
                      }
                      try {
                        await ensureDetail(id);
                        setResultSelected(id);
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "상세 조회 실패",
                        );
                      }
                    }}
                    title="클릭하면 이 단계의 결과를 봅니다"
                  >
                    <span>
                      <b>{r.student?.name ?? "학생"}</b>
                      <small>
                        {r.student?.school ?? "-"} · {r.student?.grade ?? "-"}
                      </small>
                    </span>
                    <span>
                      <b>{phaseText(r)}</b>
                      <small>{stampOf(r)}</small>
                      <small>
                        {r.subject || "-"} · {r.subunit || "-"}
                      </small>
                    </span>
                    <span>
                      <em
                        className={`status ${String(r.status).toLowerCase()}`}
                      >
                        {statusText(r.status)}
                      </em>
                    </span>
                    <span>
                      <b>
                        {r.answered}/{r.total}
                      </b>
                      <i>
                        <em
                          style={{
                            width: `${r.total ? Math.min(100, (r.answered / r.total) * 100) : 0}%`,
                          }}
                        />
                      </i>
                    </span>
                    <span>{timeText(r.createdAt)}</span>
                    <span>{timeText(r.startedAt)}</span>
                    <span>{timeText(r.submittedAt)}</span>
                    <span>
                      <b>{elapsed(r.startedAt, r.submittedAt, serverTime)}</b>
                    </span>
                    <span>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const id = String(r.id);
                          if (selected === id) {
                            setSelected("");
                            return;
                          }
                          try {
                            await ensureDetail(id);
                            setSelected(id);
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "로그 조회 실패",
                            );
                          }
                        }}
                      >
                        {selected === String(r.id)
                          ? "로그 닫기"
                          : r.detailLoaded
                            ? `로그 ${r.logs?.length ?? 0}`
                            : "로그 보기"}
                      </button>
                    </span>
                    <span className="reset-actions">
                      <button
                        className="reset-stage"
                        disabled={!!resetBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void resetStage(r, "STAGE");
                        }}
                      >
                        ↻ 단계
                      </button>
                      {Number(r.wrongCount ?? 0) > 0 ? (
                        <button
                          className="reset-review"
                          disabled={!!resetBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            void resetStage(r, "REVIEW");
                          }}
                        >
                          ↻ 오답
                        </button>
                      ) : null}
                    </span>
                  </div>
                  {resultSelected === String(r.id) ? (
                    <div className="stage-result">
                      {(() => {
                        const oc = outcomeCounts(r);
                        return (
                          <>
                            <div className="stage-result-head">
                              <div>
                                <small>이 단계 결과</small>
                                <b>
                                  {stampOf(r)} · {phaseText(r)} ·{" "}
                                  {r.student?.name ?? "학생"}
                                </b>
                                <span>
                                  {r.sourceExamTitle
                                    ? `기준시험 ${r.sourceExamTitle} · `
                                    : ""}
                                  {r.subject || "-"} · {r.subunit || "-"}
                                </span>
                              </div>
                              <div className="stage-reset-buttons">
                                {!["COMPLETED", "PASSED"].includes(String(r.status)) && Number(r.answered ?? 0) >= Number(r.total ?? 0) ? (
                                  <button
                                    className="complete-stage"
                                    disabled={!!resetBusy || !!completeBusy}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void completeStage(r);
                                    }}
                                  >
                                    {completeBusy === String(r.id) ? "완료 처리 중..." : "✓ 이 단계 완료"}
                                  </button>
                                ) : null}
                                <button
                                  disabled={!!resetBusy || !!completeBusy}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void resetStage(r, "STAGE");
                                  }}
                                >
                                  ↻ 이 단계부터 다시
                                </button>
                                {oc.wrong > 0 ? (
                                  <button
                                    disabled={!!resetBusy}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void resetStage(r, "REVIEW");
                                    }}
                                  >
                                    ↻ 오답만 다시
                                  </button>
                                ) : null}
                                <button
                                  className="danger"
                                  disabled={!!resetBusy}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void resetStage(r, "FULL");
                                  }}
                                >
                                  SOS 전체 초기화
                                </button>
                              </div>
                            </div>
                            <div className="admin-outcome-metrics">
                              <div>
                                <strong>
                                  {oc.initialCorrect}/{oc.total}
                                </strong>
                                <b>최초 정답</b>
                                <small>처음 응시에서 스스로 맞힌 문항</small>
                              </div>
                              <div>
                                <strong>
                                  {oc.corrected}/{oc.wrong}
                                </strong>
                                <b>교정완료</b>
                                <small>오답을 다시 풀어 스스로 교정</small>
                              </div>
                              <div>
                                <strong>
                                  {oc.explained}/{oc.explainRequired}
                                </strong>
                                <b>풀이확인</b>
                                <small>
                                  3회 실패 후 정답·핵심풀이 확인 완료
                                </small>
                              </div>
                            </div>
                            {r.phase === "TRAINING" ? (
                              <div className="meter-snapshot">
                                <span>
                                  시작 바로미터{" "}
                                  <b>
                                    {r.baselineMeter == null
                                      ? "-"
                                      : Number(r.baselineMeter).toFixed(2)}
                                  </b>
                                </span>
                                <span>
                                  훈련 후{" "}
                                  <b>
                                    {r.trainingMeter == null
                                      ? "-"
                                      : Number(r.trainingMeter).toFixed(2)}
                                  </b>
                                </span>
                                <span>
                                  오답 후{" "}
                                  <b>
                                    {r.reviewMeter == null
                                      ? "-"
                                      : Number(r.reviewMeter).toFixed(2)}
                                  </b>
                                </span>
                                <span>
                                  목표{" "}
                                  <b>
                                    {r.goalMeter == null
                                      ? "-"
                                      : Number(r.goalMeter).toFixed(2)}
                                  </b>
                                </span>
                              </div>
                            ) : null}
                            <div className="stage-item-grid">
                              {(r.items ?? []).map((it: any) => {
                                const editing =
                                  answerEdit?.itemId === String(it.id);
                                return (
                                  <div
                                    key={it.id}
                                    className={`stage-item ${it.isCorrect === true ? "ok" : it.isCorrect === false ? "no" : ""}`}
                                  >
                                    <b>
                                      {it.order}번{" "}
                                      {it.isCorrect === true
                                        ? "O"
                                        : it.isCorrect === false
                                          ? "X"
                                          : "-"}
                                    </b>
                                    <span>
                                      최초답 {it.studentAnswer || "-"} / 정답{" "}
                                      {it.problem?.correctAnswer || "-"}
                                    </span>
                                    <small>
                                      풀이{" "}
                                      {it.responseSeconds
                                        ? `${it.responseSeconds}초`
                                        : "-"}
                                      {it.isCorrect === false
                                        ? ` · ${it.reviewIsCorrect === true ? "교정완료" : it.reviewAnswer ? "교정 진행중" : "오답 미진행"}`
                                        : ""}
                                    </small>
                                    <ReviewAttemptTrail item={it} />
                                    {it.isCorrect === false &&
                                    it.reviewAnswer ? (
                                      <small className="review-current">
                                        현재 교정답 {it.reviewAnswer} ·{" "}
                                        {it.reviewIsCorrect === true
                                          ? "O"
                                          : "X"}
                                      </small>
                                    ) : null}
                                    {editing ? (
                                      <div className="answer-editor">
                                        <input
                                          autoFocus
                                          value={answerEdit.value}
                                          onChange={(e) =>
                                            setAnswerEdit({
                                              itemId: String(it.id),
                                              value: e.target.value,
                                            })
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter")
                                              void saveAnswer(r, it);
                                            if (e.key === "Escape")
                                              setAnswerEdit(null);
                                          }}
                                        />
                                        <button
                                          disabled={
                                            answerBusy === String(it.id)
                                          }
                                          onClick={() => void saveAnswer(r, it)}
                                        >
                                          {answerBusy === String(it.id)
                                            ? "저장중"
                                            : "저장"}
                                        </button>
                                        <button
                                          className="cancel"
                                          disabled={!!answerBusy}
                                          onClick={() => setAnswerEdit(null)}
                                        >
                                          취소
                                        </button>
                                      </div>
                                    ) : studentAnswerEdit?.itemId ===
                                      String(it.id) ? (
                                      <div className="student-answer-editor">
                                        <select
                                          value={studentAnswerEdit.field}
                                          onChange={(e) =>
                                            setStudentAnswerEdit({
                                              itemId: String(it.id),
                                              field: e.target.value as
                                                | "initial"
                                                | "review",
                                              value:
                                                e.target.value === "review"
                                                  ? String(
                                                      it.reviewAnswer ?? "",
                                                    )
                                                  : String(
                                                      it.studentAnswer ?? "",
                                                    ),
                                            })
                                          }
                                        >
                                          <option value="initial">
                                            최초답
                                          </option>
                                          {it.isCorrect === false ||
                                          it.reviewAnswer ? (
                                            <option value="review">
                                              교정답
                                            </option>
                                          ) : null}
                                        </select>
                                        <input
                                          autoFocus
                                          value={studentAnswerEdit.value}
                                          onChange={(e) =>
                                            setStudentAnswerEdit({
                                              ...studentAnswerEdit,
                                              value: e.target.value,
                                            })
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter")
                                              void saveStudentAnswer(r, it);
                                            if (e.key === "Escape")
                                              setStudentAnswerEdit(null);
                                          }}
                                        />
                                        <button
                                          disabled={
                                            studentAnswerBusy === String(it.id)
                                          }
                                          onClick={() =>
                                            void saveStudentAnswer(r, it)
                                          }
                                        >
                                          {studentAnswerBusy === String(it.id)
                                            ? "저장중"
                                            : "저장"}
                                        </button>
                                        <button
                                          className="cancel"
                                          disabled={!!studentAnswerBusy}
                                          onClick={() =>
                                            setStudentAnswerEdit(null)
                                          }
                                        >
                                          취소
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="answer-actions">
                                        <button
                                          className="student-answer-manage"
                                          disabled={
                                            !!studentAnswerBusy || !!answerBusy
                                          }
                                          onClick={() =>
                                            setStudentAnswerEdit({
                                              itemId: String(it.id),
                                              field: "initial",
                                              value: String(
                                                it.studentAnswer ?? "",
                                              ),
                                            })
                                          }
                                        >
                                          학생답 관리
                                        </button>
                                        <button
                                          className="answer-manage"
                                          disabled={
                                            !!answerBusy || !!studentAnswerBusy
                                          }
                                          onClick={() =>
                                            setAnswerEdit({
                                              itemId: String(it.id),
                                              value: String(
                                                it.problem?.correctAnswer ?? "",
                                              ),
                                            })
                                          }
                                        >
                                          정답 관리
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                  {selected === String(r.id) ? (
                    <div className="logs">
                      {(r.logs ?? []).length ? (
                        (r.logs ?? []).map((log: any) => (
                          <div key={log.id}>
                            <time>{timeText(log.occurredAt)}</time>
                            <b>{logText(log)}</b>
                          </div>
                        ))
                      ) : (
                        <p>기록된 로그가 없습니다.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              </Fragment>
            ))
          ) : (
            <div className="empty">조건에 맞는 진행 기록이 없습니다.</div>
          )}
        </section>
        <style jsx>{`
          .progress-page {
            min-height: 100vh;
            background: #f5f7f6;
            padding: 28px;
            color: #17211b;
          }
          .top {
            display: flex;
            justify-content: space-between;
            gap: 18px;
          }
          .top small {
            font-weight: 900;
            color: #247249;
          }
          .top h1 {
            margin: 5px 0;
          }
          .top p {
            margin: 0;
            color: #667085;
          }
          .top nav {
            display: flex;
            gap: 8px;
            margin-top: 14px;
          }
          .top nav button,
          .refresh,
          .row button {
            border: 1px solid #cfd8d2;
            background: #fff;
            border-radius: 9px;
            padding: 8px 13px;
            font-weight: 900;
            cursor: pointer;
          }
          .top nav .active {
            background: #216e45;
            color: #fff;
          }
          .cards {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin: 18px 0;
          }
          .cards article {
            background: #fff;
            border: 1px solid #e2e8e4;
            border-radius: 13px;
            padding: 14px;
          }
          .cards span {
            color: #667085;
          }
          .cards b {
            display: block;
            font-size: 26px;
          }
          .filters {
            display: flex;
            gap: 8px;
            background: #fff;
            border: 1px solid #e2e8e4;
            border-radius: 13px;
            padding: 10px;
            margin-bottom: 10px;
          }
          .filters input {
            flex: 1;
          }
          .filters input,
          .filters select {
            border: 1px solid #d0d5dd;
            border-radius: 9px;
            padding: 9px;
          }
          .table {
            background: #fff;
            border: 1px solid #e2e8e4;
            border-radius: 13px;
            overflow: auto;
          }
          .row {
            display: grid;
            grid-template-columns: 1.05fr 1.25fr 0.7fr 0.75fr 1fr 1fr 1fr 0.8fr 0.65fr 1.05fr;
            min-width: 1180px;
            align-items: center;
            border-bottom: 1px solid #edf1ee;
          }
          .row.clickable {
            cursor: pointer;
          }
          .row.clickable:hover {
            background: #f5fbf7;
          }
          .row-wrap.result-open > .row {
            background: #eef8f2;
          }
          .row > span {
            padding: 10px 8px;
          }
          .row b,
          .row small {
            display: block;
          }
          .row small {
            font-size: 10px;
            color: #7a8580;
            margin-top: 3px;
          }
          .head {
            background: #f8faf9;
            font-weight: 900;
            font-size: 12px;
          }
          .status {
            font-style: normal;
            font-weight: 900;
            background: #eef1ef;
            border-radius: 999px;
            padding: 5px 8px;
          }
          .status.in_progress {
            background: #fff2cc;
            color: #885c00;
          }
          .status.retrain {
            background: #fff0e8;
            color: #a24816;
          }
          .status.passed,
          .status.completed {
            background: #e8f6ed;
            color: #176d42;
          }
          .row i {
            display: block;
            height: 6px;
            background: #e8eeea;
            border-radius: 999px;
            overflow: hidden;
            margin-top: 5px;
          }
          .row i em {
            display: block;
            height: 100%;
            background: #278557;
          }
          .stage-result {
            padding: 14px 18px 16px;
            background: #fbfefc;
            border-bottom: 1px solid #dfe9e2;
          }
          .stage-result-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 18px;
            margin-bottom: 10px;
          }
          .stage-result-head > div:first-child small,
          .stage-result-head span {
            display: block;
            color: #718078;
            font-size: 11px;
          }
          .stage-result-head > div:first-child b {
            display: block;
            font-size: 16px;
            margin: 2px 0;
          }
          .stage-result-head > div:last-child {
            text-align: right;
          }
          .stage-result-head strong {
            font-size: 24px;
            color: #176d42;
          }
          .stage-result-head > div:last-child small {
            display: block;
            color: #718078;
          }
          .meter-snapshot {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-bottom: 10px;
          }
          .meter-snapshot span {
            background: #eff7f2;
            border: 1px solid #dbe9df;
            border-radius: 999px;
            padding: 6px 9px;
            font-size: 11px;
          }
          .stage-item-grid {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 7px;
          }
          .stage-item {
            border: 1px solid #e1e7e3;
            border-radius: 9px;
            padding: 8px;
            background: #fff;
          }
          .stage-item.ok {
            border-color: #bfe2ca;
            background: #f4fbf6;
          }
          .stage-item.no {
            border-color: #efc8c8;
            background: #fff7f7;
          }
          .stage-item b,
          .stage-item span,
          .stage-item small {
            display: block;
          }
          .stage-item span,
          .stage-item small {
            font-size: 10px;
            color: #728078;
            margin-top: 2px;
          }
          .attempt-trail {
            display: flex;
            align-items: center;
            gap: 4px;
            flex-wrap: wrap;
            margin-top: 7px;
            padding-top: 7px;
            border-top: 1px dashed #e1e7e3;
          }
          .attempt-chip {
            display: inline-flex !important;
            align-items: center;
            gap: 3px;
            width: auto !important;
            margin: 0 !important;
            padding: 3px 6px;
            border-radius: 999px;
            border: 1px solid #d8e0db;
            background: #f5f7f6;
            color: #66736b;
            font-size: 9px !important;
            font-style: normal;
            font-weight: 900;
            line-height: 1.2;
          }
          .attempt-chip i {
            font-style: normal;
            font-weight: 800;
          }
          .attempt-chip b {
            font-size: 10px !important;
          }
          .attempt-chip.pass {
            background: #eaf7ee;
            border-color: #bde0c8;
            color: #176d42;
          }
          .attempt-chip.fail {
            background: #fff0ef;
            border-color: #efc2be;
            color: #b42318;
          }
          .attempt-chip.pending {
            background: #f3f5f4;
            color: #7a8580;
          }
          .attempt-chip.explained {
            background: #fff7e8;
            border-color: #ecd39c;
            color: #9a5b12;
          }
          .review-current {
            font-weight: 900 !important;
            color: #556b60 !important;
          }
          .answer-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 5px;
            margin-top: 8px;
          }
          .answer-manage,
          .student-answer-manage {
            width: 100%;
            border: 1px solid #cddbd2;
            background: #f8fbf9;
            color: #1d6942;
            border-radius: 7px;
            padding: 6px 7px;
            font-size: 10px;
            font-weight: 900;
            cursor: pointer;
          }
          .student-answer-manage {
            background: #f4f7ff;
            border-color: #ccd7ee;
            color: #365786;
          }
          .student-answer-editor {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr) auto auto;
            gap: 4px;
            margin-top: 8px;
          }
          .student-answer-editor select,
          .student-answer-editor input {
            min-width: 0;
            border: 1px solid #89a5cf;
            border-radius: 7px;
            padding: 6px 7px;
            font-size: 10px;
            font-weight: 900;
            background: #fff;
          }
          .student-answer-editor button {
            border: 0;
            border-radius: 7px;
            padding: 6px 8px;
            background: #365f92;
            color: #fff;
            font-size: 10px;
            font-weight: 900;
            cursor: pointer;
          }
          .student-answer-editor .cancel {
            background: #eef2f7;
            color: #556579;
          }
          .answer-editor {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto auto;
            gap: 4px;
            margin-top: 8px;
          }
          .answer-editor input {
            min-width: 0;
            border: 1px solid #78ae8a;
            border-radius: 7px;
            padding: 6px 7px;
            font-weight: 900;
          }
          .answer-editor button {
            border: 0;
            border-radius: 7px;
            padding: 6px 8px;
            background: #216e45;
            color: #fff;
            font-size: 10px;
            font-weight: 900;
            cursor: pointer;
          }
          .answer-editor .cancel {
            background: #eef2ef;
            color: #55635a;
          }
          .admin-outcome-metrics {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            margin: 10px 0;
          }
          .admin-outcome-metrics > div {
            padding: 10px;
            border: 1px solid #dfe9e2;
            border-radius: 10px;
            background: #fff;
          }
          .admin-outcome-metrics strong,
          .admin-outcome-metrics b,
          .admin-outcome-metrics small {
            display: block;
          }
          .admin-outcome-metrics strong {
            font-size: 20px;
            color: #176d42;
          }
          .admin-outcome-metrics b {
            font-size: 12px;
            margin-top: 2px;
          }
          .admin-outcome-metrics small {
            font-size: 10px;
            color: #718078;
            margin-top: 2px;
          }
          .logs {
            padding: 12px 18px;
            background: #fbfdfb;
            border-bottom: 1px solid #e5ebe7;
          }
          .logs div {
            display: grid;
            grid-template-columns: 160px 1fr;
            gap: 12px;
            padding: 7px 0;
            border-bottom: 1px dashed #e2e8e4;
          }
          .logs time {
            color: #738078;
            font-size: 12px;
          }
          .logs b {
            font-size: 13px;
          }
          .empty {
            padding: 34px;
            text-align: center;
            color: #667085;
          }
          .error {
            padding: 10px;
            background: #fff0f0;
            color: #a61b1b;
            border-radius: 9px;
            margin: 12px 0;
          }
          .reset-actions {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
          }
          .reset-actions button {
            padding: 6px 8px;
            font-size: 10px;
          }
          .reset-stage {
            color: #245b3e;
          }
          .reset-review {
            color: #9a5b12;
            background: #fff9ed !important;
            border-color: #ecd4a7 !important;
          }
          .stage-reset-buttons {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            justify-content: flex-end;
          }
          .stage-reset-buttons button {
            border: 1px solid #cfd8d2;
            background: #fff;
            border-radius: 8px;
            padding: 7px 9px;
            font-size: 11px;
            font-weight: 900;
            cursor: pointer;
          }
          .stage-reset-buttons .danger {
            border-color: #efb7b7;
            background: #fff5f5;
            color: #b42318;
          }
          .stage-reset-buttons .complete-stage {
            border-color: #176d42;
            background: #176d42;
            color: #fff;
            box-shadow: 0 5px 14px rgba(23,109,66,.18);
          }
          .reset-loader {
            position: fixed;
            inset: 0;
            z-index: 9999;
            background: rgba(245, 247, 246, 0.94);
            display: grid;
            place-items: center;
            padding: 24px;
          }
          .reset-loader :global(.mathpooh-loader) {
            width: min(900px, 96vw);
          }
          @media (max-width: 900px) {
            .cards {
              grid-template-columns: 1fr 1fr;
            }
            .top,
            .filters {
              flex-direction: column;
            }
          }
          /* SOS234 admin SOS visual polish */
          .progress-page {
            background: linear-gradient(180deg, #f4f7f5, #f7f9f8);
            padding: 30px 32px 50px;
          }
          .top {
            align-items: center;
            padding: 4px 0 2px;
          }
          .top h1 {
            font-size: 30px;
            letter-spacing: -0.04em;
          }
          .top p {
            line-height: 1.55;
          }
          .top nav {
            padding: 4px;
            background: #eaf1ec;
            border-radius: 13px;
            width: max-content;
          }
          .top nav button {
            border: 0 !important;
            background: transparent !important;
            color: #65736a;
          }
          .top nav .active {
            background: #fff !important;
            color: #176d42 !important;
            box-shadow: 0 4px 13px rgba(24, 92, 50, 0.1);
          }
          .refresh {
            min-height: 42px;
            border-color: #d9e3dc !important;
            transition: 0.16s ease;
          }
          .refresh:hover {
            transform: translateY(-1px);
            background: #f5faf7;
          }
          .cards {
            gap: 11px;
          }
          .cards article {
            border-color: #dfe8e2;
            border-radius: 16px;
            padding: 18px 19px;
            box-shadow: 0 7px 22px rgba(29, 70, 43, 0.05);
          }
          .cards span {
            font-size: 12px;
          }
          .cards b {
            margin-top: 5px;
            color: #1d5f3c;
            letter-spacing: -0.03em;
          }
          .filters {
            border-color: #dfe8e2;
            border-radius: 15px;
            box-shadow: 0 5px 18px rgba(29, 70, 43, 0.04);
          }
          .filters input,
          .filters select {
            min-height: 42px;
            border-color: #d7e1da;
          }
          .filters input:focus,
          .filters select:focus {
            outline: none;
            border-color: #78ae8a;
            box-shadow: 0 0 0 3px rgba(39, 133, 83, 0.08);
          }
          .group-toggle {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-left: auto;
          }
          .group-toggle span {
            font-size: 12px;
            color: #6b7a71;
            font-weight: 800;
          }
          .group-toggle button {
            border: 1px solid #d7e0da;
            background: #fff;
            color: #5c6b62;
            border-radius: 8px;
            padding: 9px 12px;
            font-size: 12px;
            font-weight: 800;
            cursor: pointer;
          }
          .group-toggle button.on {
            background: #1f6b42;
            border-color: #1f6b42;
            color: #fff;
          }
          .cycle-band.student-band {
            background: #eef4ff;
            border-color: #d3e0f5;
            color: #1e3f70;
          }
          .cycle-band.student-band b {
            font-size: 15px;
          }
          .cycle-band.student-band span {
            color: #5b6f8c;
          }
          .table {
            border-color: #dfe8e2;
            border-radius: 16px;
            box-shadow: 0 7px 24px rgba(29, 70, 43, 0.05);
          }
          .cycle-band {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            padding: 11px 16px;
            background: #eaf3ed;
            border-top: 1px solid #d8e6dd;
            border-bottom: 1px solid #d8e6dd;
            color: #1d5f3c;
          }
          .cycle-band b {
            font-size: 14px;
          }
          .cycle-band span {
            font-size: 11px;
            color: #66776d;
          }
          .row {
            border-bottom-color: #edf1ee;
          }
          .row:not(.head):hover {
            background: #f8fbf9;
          }
          .head {
            background: #f4f8f5;
            color: #5c6b62;
          }
          .row-wrap.result-open > .row {
            background: #eff8f2;
          }
          .status {
            padding: 6px 9px;
          }
          .status.in_progress {
            background: #fff2df;
            color: #9b5a15;
          }
          .status.retrain {
            background: #fff0e8;
            color: #a24816;
          }
          .status.completed,
          .status.passed {
            background: #e7f5ec;
            color: #176d42;
          }
          .row button {
            transition: 0.15s ease;
          }
          .row button:hover {
            background: #f2f8f4;
          }
          .stage-result {
            padding: 17px 19px 18px;
            background: #fbfefc;
          }
          .stage-result-head > div:first-child b {
            font-size: 18px;
          }
          .stage-result-head strong {
            font-size: 26px;
          }
          .admin-outcome-metrics {
            gap: 10px;
          }
          .admin-outcome-metrics > div {
            padding: 13px;
            border-color: #dfe8e2;
            border-radius: 12px;
            box-shadow: 0 4px 13px rgba(29, 70, 43, 0.035);
          }
          .admin-outcome-metrics strong {
            font-size: 23px;
          }
          .meter-snapshot span {
            padding: 7px 10px;
            background: #eef7f1;
          }
          .stage-item-grid {
            gap: 8px;
          }
          .stage-item {
            border-radius: 11px;
            padding: 10px;
            box-shadow: 0 3px 10px rgba(29, 70, 43, 0.025);
          }
          .stage-item.ok {
            background: #f3faf5;
          }
          .stage-item.no {
            background: #fff6f5;
          }
          .logs {
            background: #f9fcfa;
          }
          .stage-reset-buttons button {
            min-height: 34px;
          }
          .stage-reset-buttons .danger {
            font-weight: 900;
          }
          @media (max-width: 900px) {
            .progress-page {
              padding: 20px 16px 40px;
            }
            .cards {
              grid-template-columns: 1fr 1fr;
            }
            .top,
            .filters {
              flex-direction: column;
              align-items: stretch;
            }
            .top nav {
              width: 100%;
              overflow: auto;
            }
            .top nav button {
              flex: 1;
            }
            .stage-result-head {
              align-items: flex-start;
              flex-direction: column;
            }
            .stage-reset-buttons {
              justify-content: flex-start;
            }
            .stage-item-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }
        `}</style>
      </main>
    </AdminPortalShell>
  );
}
