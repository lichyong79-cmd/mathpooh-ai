import { SOURCE_STAR_POLICY, SOURCE_STAR_READER_VERSION, sourceStarCacheMatches, SOURCE_STAR_PROMPT, sourceStarSchema, type SourceStars } from "@/lib/source-star-difficulty";

// Read one complete paper once, so stars above a cropped question are retained.
async function paperFingerprint(supabase: any, source: any): Promise<string> {
  if (!source.exam_pdf_path) throw new Error("별점 검수: 원본 시험지 PDF가 없습니다.");
  const file=await supabase.storage.from("exam-pdf").info(source.exam_pdf_path);
  if (file.error || !file.data?.version) throw new Error("별점 검수: 원본 PDF 버전을 확인할 수 없습니다.");
  return JSON.stringify([source.id,source.exam_pdf_path,file.data.version]);
}
const pending = new Map<string, Promise<void>>();
export async function ensureOriginalSourceStars(supabase: any, problem: any, apiKey: string, model: string) {
  if (problem.problem_dna?.difficulty?.admin_fixed === true || !problem.source_file_id) return problem.problem_dna;
  const { data: source, error } = await supabase.from("source_files").select("id,title,exam_pdf_path").eq("id", problem.source_file_id).single();
  if (error) throw error;
  if (!/(중간|기말|내신)/.test(String(source.title))) return problem.problem_dna;
  const fingerprint=await paperFingerprint(supabase,source);
  if (sourceStarCacheMatches(problem.problem_dna,fingerprint,model)) return problem.problem_dna;
  const key = fingerprint + model;
  if (!pending.has(key)) pending.set(key, readPaper(supabase, source, apiKey, model, fingerprint).finally(() => pending.delete(key)));
  await pending.get(key);
  const fresh = await supabase.from("problem_bank_questions").select("problem_dna").eq("id", problem.id).single();
  if (fresh.error) throw fresh.error;
  return fresh.data.problem_dna;
}
async function readPaper(supabase: any, source: any, apiKey: string, model: string, fingerprint: string) {
  if (!source.exam_pdf_path) throw new Error("별점 검수: 원본 시험지 PDF가 없습니다.");
  const signed = await supabase.storage.from("exam-pdf").createSignedUrl(source.exam_pdf_path, 600);
  if (signed.error || !signed.data?.signedUrl) throw new Error("별점 검수: 원본 PDF를 열 수 없습니다.");
  const list = await supabase.from("problem_bank_questions").select("id,question_no,problem_dna").eq("source_file_id", source.id);
  if (list.error) throw list.error;
  const rows = list.data ?? [];
  if (rows.length && rows.every((r: any) => r.problem_dna?.difficulty?.admin_fixed === true || sourceStarCacheMatches(r.problem_dna,fingerprint,model))) return;
  const numbers: number[] = [...new Set<number>(rows.map((r: any) => Number(r.question_no)))];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method:"POST", headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({model,store:false,reasoning:{effort:"low"},max_output_tokens:6000,
      input:[{role:"user",content:[{type:"input_text",text:`시험지 ${source.title}. 문제를 풀지 말고 원본 인쇄 별점만 판독하세요. 대상 문항 번호 ${JSON.stringify(numbers)}. 각 번호를 정확히 한 번 반환. 같은 번호가 중복되거나 대응을 확인할 수 없으면 uncertain.\n${SOURCE_STAR_PROMPT}`},{type:"input_file",file_url:signed.data.signedUrl}]}],
      text:{format:{type:"json_schema",name:"paper_source_stars",strict:true,schema:{type:"object",additionalProperties:false,required:["questions"],properties:{questions:{type:"array",items:{type:"object",additionalProperties:false,required:["question_no","stars"],properties:{question_no:{type:"integer"},stars:sourceStarSchema}}}}}}}
    }),signal:AbortSignal.timeout(120000),cache:"no-store"
  });
  if (!response.ok) throw new Error(`원본 별점 판독 실패: HTTP ${response.status}`);
  const output = await response.json();
  if (output.status === "incomplete") throw new Error("원본 별점 판독 응답 미완료");
  const text = output.output_text || (output.output ?? []).flatMap((r:any)=>r.content??[]).map((r:any)=>r.text??"").join("");
  const result = JSON.parse(text);
  const evidence = new Map<number, SourceStars>();
  for (const n of numbers) {
    const found = (result.questions ?? []).filter((r:any)=>r.question_no===n);
    evidence.set(n,found.length===1 ? found[0].stars : {status:"uncertain",count:null,confidence:0,evidence:"원본 문항 번호 대응 누락/중복"});
  }
  const currentSource=await supabase.from("source_files").select("id,exam_pdf_path").eq("id",source.id).single();
  if (currentSource.error || !currentSource.data || await paperFingerprint(supabase,currentSource.data) !== fingerprint) throw new Error("별점 판독 도중 원본 PDF가 변경되었습니다.");
  for (const row of rows) {
    // Reload metadata to preserve concurrent administrator changes.
    const fresh = await supabase.from("problem_bank_questions").select("problem_dna,updated_at,source_file_id,question_no").eq("id",row.id).single();
    if (fresh.error) throw fresh.error;
    const dna = fresh.data.problem_dna ?? {};
    if (dna.difficulty?.admin_fixed === true) continue;
    if (fresh.data.source_file_id !== source.id || fresh.data.question_no !== row.question_no) throw new Error("별점 판독 도중 문항 연결이 변경되었습니다.");
    const update = await supabase.from("problem_bank_questions").update({problem_dna:{...dna,difficulty:{...dna.difficulty,source_stars:evidence.get(Number(row.question_no)),source_star_paper_evidence:evidence.get(Number(row.question_no)),source_star_policy:SOURCE_STAR_POLICY,source_star_origin:"original_pdf",source_star_reader_version:SOURCE_STAR_READER_VERSION,source_star_fingerprint:fingerprint,source_star_pdf_path:source.exam_pdf_path,source_star_model:model,source_star_response_model:output.model ?? model,source_star_read_at:new Date().toISOString()}},updated_at:new Date().toISOString()}).eq("id",row.id).eq("updated_at",fresh.data.updated_at).select("id");
    if (update.error || !update.data?.length) throw new Error("별점 저장 중 문항이 변경되었습니다. 재시도 필요");
  }
}
