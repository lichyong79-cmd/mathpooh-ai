import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import ids from "@/lib/answer-audit-20260915.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function AnswerAudit({searchParams}: {searchParams: Promise<{page?: string; solution?: string}>}) {
  if (!await getAdminUser()) redirect('/admin/login');
  const params = await searchParams;
  const page = Math.min(Math.ceil(ids.length / 4)-1, Math.max(0, Math.floor(Number(params.page) || 0)));
  const solution = params.solution === '1';
  const db = createClient();
  const selected = ids.slice(page*4,page*4+4);
  const result = await db.from('problem_bank_questions').select('id,title,analysis_question_id,answer,question_type,question_image_path,problem_dna').in('id',selected);
  if (result.error) throw result.error;
  const rows = await Promise.all(selected.map(async (id,index) => {
    const p = (result.data ?? []).find(p=>p.id===id);
    if (!p) throw new Error('검수 문항을 찾을 수 없습니다.');
    const analysis = await db.from('analysis_questions').select('ai_result').eq('id',p.analysis_question_id).single();
    if (analysis.error) throw analysis.error;
    const path = solution ? p.problem_dna?.correctedSolutionImagePath || analysis.data?.ai_result?.official_solution_image_path : p.question_image_path;
    const signed = path ? await db.storage.from('question-images').createSignedUrl(path,600) : null;
    return {...p,index:page*4+index+1,url:signed?.data?.signedUrl,error:signed?.error?.message,official:analysis.data?.ai_result?.official_solution?.official_answer};
  }));
  const query = (p:number,s=solution)=>`/admin/answer-audit?page=${p}&solution=${s?1:0}`;
  return <main style={{background:'#fff',color:'#111',padding:12,fontFamily:'sans-serif'}}>
    <nav style={{display:'flex',gap:24,padding:12}}><b>정답 원본 검수 {page+1}/{Math.ceil(ids.length/4)} · {ids.length}문항</b><a href={query(Math.max(0,page-1))}>이전</a><a href={query(Math.min(Math.ceil(ids.length/4)-1,page+1))}>다음</a><a href={query(page,!solution)}>{solution?'문제 보기':'해설 보기'}</a><a href='/problem-bank'>문제은행</a></nav>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>{rows.map(p=><article key={p.id} style={{border:'1px solid #888',padding:10}}>
      <b>검수 {p.index} · {p.title}</b><div>저장 {p.answer} / 분석 {String(p.problem_dna?.answer ?? '')} / 해설 {String(p.official ?? '')} / {p.question_type}</div><small>{p.id}</small>
      {p.url?<img src={p.url} alt={`검수 ${p.index} ${solution?'해설':'문제'}`} style={{display:'block',width:'100%',height:620,objectFit:'contain'}}/>:<p>{p.error || '이미지 없음'}</p>}
    </article>)}</div>
  </main>;
}
