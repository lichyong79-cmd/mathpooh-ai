import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";

async function adminContext() {
  const user = await getSessionUser();
  if (!user || user.user_metadata?.role === "student" || user.user_metadata?.role === "parent")
    return null;
  return createClient();
}

async function withUrls(supabase: ReturnType<typeof createClient>, rows: any[]) {
  return Promise.all(rows.map(async (row) => ({
    ...row,
    image_url: (await supabase.storage.from("site-posters").createSignedUrl(row.image_path, 60 * 60)).data?.signedUrl ?? "",
  })));
}

export async function GET() {
  const supabase = await adminContext();
  if (!supabase) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const { data, error } = await supabase.from("site_posters").select("*").order("sort_order").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ posters: await withUrls(supabase, data ?? []) });
}

export async function POST(request: Request) {
  const supabase = await adminContext();
  if (!supabase) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const form = await request.formData();
  const image = form.get("image");
  const title = String(form.get("title") ?? "").trim();
  if (!(image instanceof File) || !image.size || !title)
    return NextResponse.json({ message: "포스터 제목과 이미지를 넣어 주세요." }, { status: 400 });
  if (!image.type.startsWith("image/") || image.size > 10 * 1024 * 1024)
    return NextResponse.json({ message: "10MB 이하 이미지 파일만 등록할 수 있습니다." }, { status: 400 });
  const extension = image.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
  const path = `${crypto.randomUUID()}/${Date.now()}.${extension}`;
  const upload = await supabase.storage.from("site-posters").upload(path, Buffer.from(await image.arrayBuffer()), { contentType: image.type, upsert: false });
  if (upload.error) return NextResponse.json({ message: upload.error.message }, { status: 400 });
  const { data, error } = await supabase.from("site_posters").insert({
    title,
    image_path: path,
    link_url: String(form.get("linkUrl") ?? "").trim(),
    is_published: String(form.get("isPublished") ?? "true") === "true",
    sort_order: Number(form.get("sortOrder") ?? 0) || 0,
  }).select().single();
  if (error) {
    await supabase.storage.from("site-posters").remove([path]);
    return NextResponse.json({ message: error.message }, { status: 400 });
  }
  return NextResponse.json({ poster: (await withUrls(supabase, [data]))[0] });
}

export async function PATCH(request: Request) {
  const supabase = await adminContext();
  if (!supabase) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json();
  const { data, error } = await supabase.from("site_posters").update({
    title: String(body.title ?? "").trim(),
    link_url: String(body.linkUrl ?? "").trim(),
    is_published: Boolean(body.isPublished),
    sort_order: Number(body.sortOrder ?? 0) || 0,
    updated_at: new Date().toISOString(),
  }).eq("id", body.id).select().single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ poster: (await withUrls(supabase, [data]))[0] });
}

export async function DELETE(request: Request) {
  const supabase = await adminContext();
  if (!supabase) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  const { data } = await supabase.from("site_posters").select("image_path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("site_posters").delete().eq("id", id);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  if (data?.image_path) await supabase.storage.from("site-posters").remove([data.image_path]);
  return NextResponse.json({ success: true });
}
