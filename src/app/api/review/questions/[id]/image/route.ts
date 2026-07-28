import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await params;
    const supabase = createClient();

    const question = await supabase
      .from("analysis_questions")
      .select("question_image_path")
      .eq("id", id)
      .single();

    if (question.error || !question.data?.question_image_path) {
      return NextResponse.json(
        { success: false, message: "문항 이미지가 없습니다." },
        { status: 404 },
      );
    }

    const signed = await supabase.storage
      .from("question-images")
      .createSignedUrl(question.data.question_image_path, 60 * 30);

    if (signed.error) throw signed.error;

    return NextResponse.json({ success: true, imageUrl: signed.data.signedUrl });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "문항 이미지를 불러오지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
