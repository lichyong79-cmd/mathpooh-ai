import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const ids: string[] = [...new Set<string>(
    (Array.isArray(body.ids) ? body.ids : [body.id])
      .map(String)
      .filter(Boolean),
  )].slice(0, 100);
  if (!ids.length)
    return NextResponse.json({ message: "삭제할 시험을 선택해 주세요." }, { status: 400 });

  const supabase = createClient();
  const exams = await supabase
    .from("exams")
    .select("id,title,test_file_path,solution_file_path,original_file_path")
    .in("id", ids);
  if (exams.error)
    return NextResponse.json({ message: exams.error.message }, { status: 400 });

  const [attempts, registrations, cycles] = await Promise.all([
    supabase.from("exam_attempts").select("exam_id").in("exam_id", ids),
    supabase.from("exam_registrations").select("exam_id").in("exam_id", ids),
    supabase.from("learning_cycle_exams").select("exam_id").in("exam_id", ids),
  ]);
  if (attempts.error || registrations.error || cycles.error)
    return NextResponse.json(
      { message: attempts.error?.message || registrations.error?.message || cycles.error?.message },
      { status: 400 },
    );

  const protectedIds = new Set([
    ...(attempts.data ?? []).map((row) => String(row.exam_id)),
    ...(registrations.data ?? []).map((row) => String(row.exam_id)),
    ...(cycles.data ?? []).map((row) => String(row.exam_id)),
  ]);
  const deletable = (exams.data ?? []).filter((exam) => !protectedIds.has(String(exam.id)));
  const deletableIds = deletable.map((exam) => String(exam.id));
  const blocked = (exams.data ?? [])
    .filter((exam) => protectedIds.has(String(exam.id)))
    .map((exam) => ({ id: exam.id, title: exam.title }));

  if (deletableIds.length) {
    const removed = await supabase.from("exams").delete().in("id", deletableIds);
    if (removed.error)
      return NextResponse.json({ message: removed.error.message }, { status: 400 });
    const paths = deletable.flatMap((exam) => [
      exam.test_file_path,
      exam.solution_file_path,
      exam.original_file_path,
    ]).filter(Boolean).map(String);
    if (paths.length) await supabase.storage.from("exam-files").remove(paths);
  }

  return NextResponse.json({
    success: true,
    deletedIds: deletableIds,
    deleted: deletableIds.length,
    blocked,
  });
}
