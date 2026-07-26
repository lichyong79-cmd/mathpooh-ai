import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function friendlyOpenAiError(status: number, body: string) {
  let message = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; code?: string; type?: string } };
    message = parsed.error?.message || body;
  } catch {
    // plain text response
  }

  if (status === 401) return "OpenAI API 키가 올바르지 않습니다.";
  if (status === 429) return `OpenAI 결제 또는 사용 한도를 확인해 주세요. ${message}`;
  if (status === 404) return `설정된 AI 모델을 사용할 수 없습니다. ${message}`;
  return `OpenAI 연결 실패 (${status}): ${message}`;
}

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5";

  if (!apiKey) {
    return NextResponse.json(
      { success: false, model, message: "OPENAI_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: "Reply with exactly: OK",
        max_output_tokens: 16,
      }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        { success: false, model, message: friendlyOpenAiError(response.status, detail) },
        { status: response.status },
      );
    }

    const payload = await response.json() as { id?: string; usage?: { total_tokens?: number } };
    return NextResponse.json({
      success: true,
      model,
      responseId: payload.id ?? null,
      totalTokens: payload.usage?.total_tokens ?? null,
      message: `OpenAI 연결 정상 · ${model}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenAI 연결 확인 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, model, message }, { status: 500 });
  }
}
