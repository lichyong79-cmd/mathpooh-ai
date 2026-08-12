import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (user.user_metadata?.role !== "student")
    return NextResponse.json({ message: "학생 계정으로 로그인해 주세요." }, { status: 403 });

  const supabase = createServerSupabase();
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (studentError)
    return NextResponse.json({ message: studentError.message }, { status: 400 });
  if (!student)
    return NextResponse.json({ message: "연결된 학생 정보가 없습니다." }, { status: 404 });

  const { data, error } = await supabase
    .from("exam_attempts")
    .select("id,exam_id,status,score,correct_count,wrong_numbers,unanswered_numbers,graded_at,score_source,mathpooh_comment,submitted_at")
    .eq("student_id", student.id)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false });

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  return NextResponse.json(
    { attempts: data ?? [] },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    },
  );
}
