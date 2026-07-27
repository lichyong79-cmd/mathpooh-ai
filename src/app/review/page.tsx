"use client";

import { useCallback, useEffect, useState } from "react";

type ReviewQuestion = {
  id: string;
  question_no: number;
  answer: string | null;
  confidence: number | null;
  ai_result: Record<string, unknown> | null;
  review_result: Record<string, unknown> | null;
  review_reason: string | null;
  source_analysis?: {
    source_files?: {
      title?: string;
      source?: string;
      grade?: string;
      subject?: string;
    };
  };
};

function value(data: Record<string, unknown> | null, key: string) {
  const item = data?.[key];
  return typeof item === "string" ? item : "";
}

export default function ReviewPage() {
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/review/questions", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "조회 실패");
      setQuestions(payload.questions ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "검수대기 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(question: ReviewQuestion, action: "approve" | "reject") {
    setWorkingId(question.id);
    setMessage("");
    try {
      const response = await fetch(`/api/review/questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          answer: question.answer ?? "",
          reviewResult: question.review_result && Object.keys(question.review_result).length > 0
            ? question.review_result
            : question.ai_result ?? {},
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "처리 실패");
      setQuestions((current) => current.filter((item) => item.id !== question.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "문항 처리에 실패했습니다.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f6f3eb", padding: 28, color: "#1f2937" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30 }}>AI 검수센터</h1>
            <p style={{ margin: "8px 0 0", color: "#6b7280" }}>신뢰도 95% 미만 문항만 표시됩니다.</p>
          </div>
          <button onClick={() => void load()} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #c8ad68", background: "white", cursor: "pointer" }}>
            새로고침
          </button>
        </div>

        <div style={{ background: "white", border: "1px solid #e5dcc5", borderRadius: 16, padding: 18, marginBottom: 18 }}>
          <strong>검수대기 {questions.length}문항</strong>
          {message ? <span style={{ marginLeft: 16, color: "#b91c1c" }}>{message}</span> : null}
        </div>

        {loading ? <div>불러오는 중...</div> : null}
        {!loading && questions.length === 0 ? (
          <div style={{ background: "white", borderRadius: 16, padding: 50, textAlign: "center", border: "1px solid #e5dcc5" }}>
            검수대기 문항이 없습니다.
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 14 }}>
          {questions.map((question) => {
            const source = question.source_analysis?.source_files;
            const result = question.review_result && Object.keys(question.review_result).length > 0
              ? question.review_result
              : question.ai_result;
            const percent = Math.round(Number(question.confidence ?? 0) * 100);
            return (
              <article key={question.id} style={{ background: "white", border: "1px solid #e5dcc5", borderRadius: 16, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <div>
                    <strong style={{ fontSize: 18 }}>{source?.title ?? "시험지"} · {question.question_no}번</strong>
                    <div style={{ marginTop: 7, color: "#6b7280", fontSize: 14 }}>
                      {[source?.grade, source?.subject, value(result, "unit"), value(result, "topic")].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, color: percent < 80 ? "#b91c1c" : "#9a6700" }}>{percent}%</div>
                </div>

                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ background: "#faf8f2", borderRadius: 10, padding: 12 }}><b>정답</b><div style={{ marginTop: 6 }}>{question.answer || "미확인"}</div></div>
                  <div style={{ background: "#faf8f2", borderRadius: 10, padding: 12 }}><b>난이도</b><div style={{ marginTop: 6 }}>{value(result, "difficulty") || "미분류"}</div></div>
                </div>

                <div style={{ marginTop: 12, background: "#fff8e6", borderRadius: 10, padding: 12 }}>
                  <b>검수 사유</b><div style={{ marginTop: 6 }}>{question.review_reason || "AI 신뢰도 부족"}</div>
                </div>
                <div style={{ marginTop: 12 }}><b>AI 요약</b><div style={{ marginTop: 6, lineHeight: 1.6 }}>{value(result, "summary") || "요약 없음"}</div></div>

                <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 9 }}>
                  <button disabled={workingId === question.id} onClick={() => void act(question, "reject")} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #d1d5db", background: "white", cursor: "pointer" }}>삭제</button>
                  <button disabled={workingId === question.id} onClick={() => void act(question, "approve")} style={{ padding: "10px 18px", borderRadius: 10, border: 0, background: "#b58a2a", color: "white", fontWeight: 700, cursor: "pointer" }}>
                    {workingId === question.id ? "처리 중..." : "승인·등록"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
