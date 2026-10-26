import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Private, server-to-server API for the Saeum MOS worksheet builder.
 * Never expose the shared secret or answer-bearing endpoint to browsers.
 */
function authorized(req: NextRequest) {
  const expected = process.env.SOS_MOS_SHARED_SECRET;
  const provided = req.headers.get("x-mos-shared-secret");
  if (!expected || !provided) return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(provided).digest();
  return timingSafeEqual(a, b);
}

const fields = "id,problem_code,question_no,title,subject,unit,topic,difficulty,question_type,answer,source_name,question_image_path,analysis_question_id,problem_dna,status,updated_at,created_at";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedSubjects = ["대수", "미적분 I", "확률과 통계"];
function cleanFilter(text: string) { return text.replace(/[%_,()]/g, " ").trim().slice(0, 100); }

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const db = createClient();
    const sp = req.nextUrl.searchParams;
    const sourceType = sp.get("sourceType") === "ai" ? "ai" : "bank";
    const ids = sp.get("ids");
    if (ids) {
      const uniqueIds = Array.from(new Set(ids.split(",").filter(v => uuid.test(v))));
      if (!uniqueIds.length || uniqueIds.length > 30) {
        return NextResponse.json({ message: "1~30개의 문항 ID가 필요합니다." }, { status: 400 });
      }
      const [bank, generated] = await Promise.all([
        db.from("problem_bank_questions").select(fields).in("id", uniqueIds).eq("status", "ACTIVE"),
        db.from("sos_ai_generated_questions")
          .select("id,subject,major_unit,subunit,topic,difficulty,question_text,display_latex,render_blocks,answer,solution,status,verification,updated_at,created_at,generation_kind")
          .in("id",uniqueIds).eq("status","READY").contains("verification",{valid:true}),
      ]);
      if (bank.error) throw bank.error;
      if (generated.error) throw generated.error;
      const records = bank.data || [];
      const solutionIds = records.map(q => q.analysis_question_id).filter(Boolean);
      const analyses = solutionIds.length
        ? await db.from("analysis_questions").select("id,ai_result").in("id", solutionIds)
        : { data: [], error: null };
      if (analyses.error) throw analyses.error;
      const solutionById = new Map((analyses.data || []).map(q => [q.id, q.ai_result]));
      const bankItems = await Promise.all(records.map(async q => {
        const officialPath = q.analysis_question_id
          ? String((solutionById.get(q.analysis_question_id) as {official_solution_image_path?: string} | undefined)?.official_solution_image_path || "")
          : "";
        const correctionPath = String((q.problem_dna as {correctedSolutionImagePath?: string}|null)?.correctedSolutionImagePath || "");
        const solutionPath = correctionPath || officialPath;
        const [image, solution] = await Promise.all([
          q.question_image_path ? db.storage.from("question-images").createSignedUrl(q.question_image_path, 1800) : Promise.resolve(null),
          solutionPath ? db.storage.from("question-images").createSignedUrl(solutionPath, 1800) : Promise.resolve(null),
        ]);
        return {
          id: q.id, source: "SOS", question_no: q.question_no, subject: q.subject,
          unit: q.unit, topic: q.topic, difficulty: q.difficulty, question_type: q.question_type,
          answer: q.answer, source_name: q.source_name, title: q.title,
          updated_at: q.updated_at, image_url: image && !image.error ? image.data?.signedUrl : null,
          solution_url: solution && !solution.error ? solution.data?.signedUrl : null,
        };
      }));
      const aiItems = (generated.data || []).map(q => ({
        id: q.id, source: "SOS_AI", subject: q.subject === "미적분I" ? "미적분 I" : q.subject,
        unit: q.subunit || q.major_unit || "", topic: q.topic || "", difficulty: String(q.difficulty ?? ""),
        question_type: "short_answer", answer: q.answer, title: q.topic || "SOS AI 생성문항",
        source_name: "SOS AI 생성문항", question_text: q.question_text,
        display_latex: q.display_latex, render_blocks: q.render_blocks,
        solution_text: q.solution, generation_kind: q.generation_kind, updated_at: q.updated_at,
      }));
      const resultItems = new Map([...bankItems,...aiItems].map(q => [q.id, q]));
      return NextResponse.json({
        items: uniqueIds.map(id => resultItems.get(id)).filter(Boolean),
        missing: uniqueIds.filter(id => !resultItems.has(id))
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const subject = sp.get("subject") || "대수";
    const allowedSubjectValues = subject === "미적분 I" ? ["미적분 I", "미적분I"] : [subject];
    if (!allowedSubjects.includes(subject)) return NextResponse.json({ message: "지원하지 않는 과목입니다." }, { status: 400 });
    const limit = Math.min(60, Math.max(1, Number(sp.get("limit") || 30) || 30));
    const offset = Math.min(10000, Math.max(0, Number(sp.get("offset") || 0) || 0));
    const keyword = cleanFilter(sp.get("keyword") || "");
    const difficulty = cleanFilter(sp.get("difficulty") || "");
    if (sourceType === "ai") {
      let aiQuery = db.from("sos_ai_generated_questions")
        .select("id,subject,major_unit,subunit,topic,difficulty,generation_kind,answer,status,created_at,updated_at", {count: "exact"})
        .eq("status", "READY").contains("verification",{valid:true})
        .in("subject",allowedSubjectValues);
      if (keyword) aiQuery = aiQuery.or(`major_unit.ilike.%${keyword}%,subunit.ilike.%${keyword}%,topic.ilike.%${keyword}%`);
      if (difficulty) aiQuery = aiQuery.eq("difficulty",Number(difficulty));
      const result = await aiQuery.order("created_at",{ascending:false}).range(offset, offset+limit-1);
      if (result.error) throw result.error;
      return NextResponse.json({
        items: (result.data || []).map(q=>({
          id:q.id,source:"SOS_AI",subject:q.subject==="미적분I"?"미적분 I":q.subject,
          unit:q.subunit||q.major_unit, topic:q.topic,difficulty:String(q.difficulty??""),
          question_type:"short_answer", title:q.topic||"SOS AI 생성문항",
          source_name:"SOS AI 생성문항",generation_kind:q.generation_kind,
          updated_at:q.updated_at,has_image:false
        })),
        count:result.count||0,limit,offset,sourceType:"ai",refreshed_at:new Date().toISOString(),
      }, {headers:{"Cache-Control":"no-store,max-age=0"}});
    }
    let query = db.from("problem_bank_questions").select(fields, {count:"exact"})
      .eq("status", "ACTIVE").eq("subject", subject).not("question_image_path", "is", null);
    if (keyword) query = query.or(`title.ilike.%${keyword}%,topic.ilike.%${keyword}%,unit.ilike.%${keyword}%,source_name.ilike.%${keyword}%`);
    if (difficulty) query = query.eq("difficulty", difficulty);
    const result = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (result.error) throw result.error;
    const items = (result.data || []).map(q => ({
      id: q.id, source: "SOS", question_no: q.question_no, subject: q.subject,
      unit: q.unit, topic: q.topic, difficulty: q.difficulty, question_type: q.question_type,
      answer: q.answer, source_name: q.source_name, title: q.title, updated_at: q.updated_at,
      has_image: !!q.question_image_path,
    }));
    return NextResponse.json({ items, count: result.count || 0, limit, offset, refreshed_at: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("[MOS SOS catalog] failed", error);
    return NextResponse.json({ message: "SOS 문항 조회에 실패했습니다." }, { status: 500 });
  }
}
