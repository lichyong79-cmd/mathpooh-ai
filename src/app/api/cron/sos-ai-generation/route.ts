import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSimilarTraining } from "@/lib/sos-ai-training";

export const maxDuration=300;

/**
 * SOS271 · 즉시 응답 + 백그라운드 처리
 *
 * 이전에는 AI 생성(최대 230초)이 끝날 때까지 응답을 붙들고 있었다.
 * 외부 스케줄러(cron-job.org)는 30초에 연결을 끊으므로 실제로는 성공했는데도
 * 매번 Failed(timeout)로 기록됐고, 진짜 장애와 구분이 되지 않았다.
 *
 * 이제는 작업을 선점하자마자 202로 응답하고, 생성은 after()로 이어서 돌린다.
 * after()의 작업도 maxDuration(300초) 안에서 계속 실행된다.
 */

// GENERATING 상태로 이 시간 이상 멈춰 있으면 죽은 작업으로 보고 회수한다.
// 백그라운드 처리로 바꾸면서, 함수가 중간에 죽으면 GENERATING인 채로 영영
// 다시 선택되지 않는 문제가 생긴다. 그 구멍을 막는 안전판이다.
// SOS297: Vercel 함수는 최대 300초이므로 7분 이상 GENERATING이면 실제 실행은
// 이미 종료된 상태다. 15분을 기다리지 않고 다음 cron에서 빠르게 회수한다.
const STALE_MINUTES=7;

// SOS295: 3회 만에 포기하면 관리자가 화면을 들여다보고 직접 되살려야 한다.
// 실패 원인이 대부분 일시적(AI 응답 지연, 이미지 다운로드 실패)이므로 넉넉히 재시도한다.
// 10분 주기이므로 8회면 약 80분간 스스로 시도한다.
const MAX_ATTEMPTS=8;

async function processJob(jobId:string,job:any){
  const supabase=createClient();
  try{
    const result:any=await generateSimilarTraining({
      supabase,
      studentId:String(job.student_id),
      firstTrainingSessionId:String(job.source_training_session_id),
      count:Number(job.requested_count)===3?3:10,
      kind:String(job.generation_kind)==="HOMEWORK"?"HOMEWORK":"SECOND_TRAINING",
      jobId
    });
    const resultSessionId=String(result?.session?.id??"")||null;
    const done=await supabase.from("sos_ai_generation_jobs").update({
      status:"READY",stage:"READY",stage_index:8,stage_total:8,
      stage_message:"학생 학습 배정까지 완료되었습니다.",
      result_session_id:resultSessionId,
      completed_at:new Date().toISOString(),
      stage_updated_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),
      last_error:null
    }).eq("id",jobId);
    if(done.error)throw done.error;
    return {status:"READY",resultSessionId,message:""};
  }catch(error){
    const message=error instanceof Error?error.message:"AI 생성 실패";

    // SOS292: 묶음 하나를 끝내고 시간이 남지 않아 스스로 멈춘 경우다.
    // 실패가 아니라 "여기까지 저장하고 다음 실행에 이어감"이므로
    // 시도 횟수를 올리지 않고 그대로 대기열로 돌려보낸다.
    if(message.startsWith("PARTIAL_BATCH_DONE:")){
      const progress=message.split(":")[1]??"";
      await supabase.from("sos_ai_generation_jobs").update({
        status:"QUEUED",attempt_count:0,started_at:null,
        stage_message:`${progress}문항 완료 · 다음 실행에서 이어갑니다.`,last_error:null,
        stage_updated_at:new Date().toISOString(),updated_at:new Date().toISOString(),
      }).eq("id",jobId);
      return {status:"PARTIAL",resultSessionId:null,message:progress};
    }

    await supabase.from("sos_ai_generation_jobs").update({
      status:"FAILED",stage:"FAILED",
      stage_message:message.slice(0,300),
      last_error:message.slice(0,1000),
      stage_updated_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    }).eq("id",jobId);
    return {status:"FAILED",resultSessionId:null,message};
  }
}

async function run(request:Request){
  // 이 경로는 프록시 로그인 가드에서 제외됩니다(외부 스케줄러에는 쿠키가 없음).
  // 따라서 CRON_SECRET은 선택이 아니라 필수입니다. 없으면 열어두지 말고 막습니다.
  const expected=String(process.env.CRON_SECRET??"").trim();
  if(!expected)return NextResponse.json({success:false,message:"CRON_SECRET 환경변수가 설정되지 않았습니다."},{status:503});
  const auth=request.headers.get("authorization")??"";
  if(auth!==`Bearer ${expected}`)return NextResponse.json({success:false,message:"cron unauthorized"},{status:401});

  // ?sync=1 이면 끝날 때까지 기다렸다가 실제 결과를 돌려준다. 수동 점검용.
  const sync=new URL(request.url).searchParams.get("sync")==="1";

  const supabase=createClient();
  const cols="id,student_id,source_training_session_id,generation_kind,requested_count,status,attempt_count,started_at";
  const staleCutoff=new Date(Date.now()-STALE_MINUTES*60000).toISOString();

  // 1순위: 대기 중이거나 실패한 작업
  const queued=await supabase.from("sos_ai_generation_jobs").select(cols)
    .in("status",["QUEUED","FAILED"]).lt("attempt_count",MAX_ATTEMPTS)
    .order("requested_at",{ascending:true}).limit(1).maybeSingle();
  if(queued.error)throw queued.error;

  let job:any=queued.data;
  let stale=false;

  // 2순위: 죽은 채 GENERATING으로 남은 작업 회수
  if(!job){
    const stuck=await supabase.from("sos_ai_generation_jobs").select(cols)
      .eq("status","GENERATING").lt("attempt_count",MAX_ATTEMPTS).lt("started_at",staleCutoff)
      .order("requested_at",{ascending:true}).limit(1).maybeSingle();
    if(stuck.error)throw stuck.error;
    job=stuck.data;
    stale=Boolean(job);
  }

  if(!job)return NextResponse.json({success:true,processed:0,message:"대기 중인 작업이 없습니다."});

  // 선점. 다른 인스턴스가 먼저 가져갔으면 조용히 물러난다.
  const claim=supabase.from("sos_ai_generation_jobs").update({
    status:"GENERATING",
    started_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),
    attempt_count:Number(job.attempt_count??0)+1,
    last_error:null
  }).eq("id",job.id);
  const claimed=stale
    ? await claim.eq("status","GENERATING").lt("started_at",staleCutoff).select("id").maybeSingle()
    : await claim.in("status",["QUEUED","FAILED"]).select("id").maybeSingle();
  if(claimed.error)throw claimed.error;
  if(!claimed.data)return NextResponse.json({success:true,processed:0,raced:true,message:"다른 실행이 먼저 처리 중입니다."});

  if(sync){
    const r=await processJob(String(job.id),job);
    return NextResponse.json({success:r.status==="READY",processed:1,jobId:job.id,...r},{status:r.status==="READY"?200:500});
  }

  // 응답을 먼저 돌려주고, 생성은 이어서 진행한다.
  after(()=>processJob(String(job.id),job));
  return NextResponse.json({
    success:true,accepted:1,processed:1,jobId:job.id,status:"GENERATING",
    reclaimed:stale,
    message:"작업을 시작했습니다. 진행 상황은 AI 생성 문제은행에서 확인하세요."
  },{status:202});
}

export async function GET(request:Request){
  try{return await run(request);}
  catch(error){return NextResponse.json({success:false,message:error instanceof Error?error.message:"worker error"},{status:500});}
}
export async function POST(request:Request){return GET(request);}
