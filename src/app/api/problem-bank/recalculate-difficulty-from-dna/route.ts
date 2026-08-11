import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import { calculateDifficultyLevel, difficultyLevelFromBand, evidenceDifficultyLevel } from "@/lib/problem-dna";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const denied = await requireUser();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const offset = Math.max(0, Number(body?.offset) || 0);
    const limit = Math.max(1, Math.min(500, Number(body?.limit) || 250));
    const supabase = await createClient();

    const result = await supabase
      .from("problem_bank_questions")
      .select("id,difficulty,problem_dna")
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);
    if (result.error) throw result.error;

    const rows = result.data ?? [];
    let updated=0, skippedFixed=0, skippedNoDna=0, failed=0;
    const distribution:Record<string,number>={};

    // AI/OpenAI 호출 없음. 저장돼 있는 DNA 수치만 사용한다.
    for (const row of rows) {
      try {
        const dna:any = row.problem_dna;
        if (!dna?.difficulty) { skippedNoDna++; continue; }
        if (dna.difficulty.admin_fixed === true) { skippedFixed++; continue; }

        const final = calculateDifficultyLevel(dna);
        const evidence = evidenceDifficultyLevel(dna.difficulty);
        const band = difficultyLevelFromBand(dna.difficulty.csat_difficulty_band);
        const nextDna = {
          ...dna,
          difficulty: {
            ...dna.difficulty,
            final_grade: final,
            scale_version: "sos8-v1",
            evidence_grade: evidence,
            band_grade: band || null,
            band_conflict: Boolean(band) && Math.abs(evidence-band)>=2,
            dna_recalculated_at: new Date().toISOString(),
            dna_recalculate_version: "dna-local-v1",
          },
        };
        const update = await supabase.from("problem_bank_questions")
          .update({ difficulty:String(final), problem_dna:nextDna, updated_at:new Date().toISOString() })
          .eq("id", row.id);
        if (update.error) throw update.error;
        updated++;
        distribution[String(final)]=(distribution[String(final)]??0)+1;
      } catch { failed++; }
    }

    return NextResponse.json({
      success:true, offset, fetched:rows.length, updated, skippedFixed, skippedNoDna, failed,
      nextOffset: offset + rows.length, done: rows.length < limit, distribution,
      aiCalls:0,
    });
  } catch(e) {
    return NextResponse.json({success:false,message:e instanceof Error?e.message:"DNA 난이도 재계산 실패"},{status:500});
  }
}
