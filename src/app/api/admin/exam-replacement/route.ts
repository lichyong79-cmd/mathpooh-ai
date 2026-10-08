import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function messageOf(error: unknown) {
  return typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message ?? "교체본 처리 실패")
    : "교체본 처리 실패";
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin)
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json({ message: "잘못된 요청 출처입니다." }, { status: 403 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "요청 내용을 확인해 주세요." }, { status: 400 });
  }

  const action = String(body?.action ?? "");
  const supabase = createClient();

  try {
    if (action === "create") {
      const sourceExamId = String(body?.sourceExamId ?? "");
      const fromQuestion = Number(body?.fromQuestion);
      const toQuestion = Number(body?.toQuestion);
      if (!uuid(sourceExamId) || !Number.isInteger(fromQuestion) || !Number.isInteger(toQuestion))
        return NextResponse.json({ message: "원본 시험과 교체 문항 범위를 확인해 주세요." }, { status: 400 });

      const created = await supabase.rpc("sos_create_replacement_paper", {
        p_source_exam_id: sourceExamId,
        p_from_question: fromQuestion,
        p_to_question: toQuestion,
        p_admin_id: admin.id,
      });
      if (created.error) throw created.error;
      return NextResponse.json(created.data, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "activate") {
      const replacementExamId = String(body?.replacementExamId ?? "");
      const sourceExamId = String(body?.sourceExamId ?? "");
      if (!uuid(replacementExamId) || !uuid(sourceExamId))
        return NextResponse.json({ message: "원본과 교체본 시험을 확인해 주세요." }, { status: 400 });

      const activated = await supabase.rpc("sos_activate_replacement_paper", {
        p_replacement_exam_id: replacementExamId,
        p_source_exam_id: sourceExamId,
        p_admin_id: admin.id,
      });
      if (activated.error) throw activated.error;
      return NextResponse.json(activated.data, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ message: "지원하지 않는 작업입니다." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ message: messageOf(error) }, { status: 409 });
  }
}
