"use client";
import {useEffect,useRef,useState} from "react";
export function cycleClock(rows:any[],now:number){
 const active=rows.filter(r=>r.booking_status==="IN_PROGRESS");
 const paused=active.filter(r=>r.exam?.paused_at);
 const running=active.filter(r=>!r.exam?.paused_at&&Date.parse(r.exam?.close_at)>now);
 const times=active.map(r=>r.exam?.paused_at?Math.max(0,Number(r.exam?.paused_remaining_seconds)||0):Math.max(0,Math.ceil((Date.parse(r.exam?.close_at)-now)/1000))).filter(Number.isFinite);
 const remaining=times.length?Math.max(...times):0;
 const finished=rows.some(r=>r.booking_status==="COMPLETED")||active.some(r=>Date.parse(r.exam?.close_at)<=now);
 const state=paused.length?(running.length?"mixed":"paused"):running.length?"running":finished?"finished":active.length?"checking":"ready";
 return {state,remaining,running:running.length,paused:paused.length,different:times.length>1&&Math.max(...times)-Math.min(...times)>1};
}
export default function ScheduleStart({onSlotChange}:{onSlotChange?:(slot:any)=>void}){
 const [cycles,setCycles]=useState<any[]>([]),[id,setId]=useState(""),[slot,setSlot]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [now,setNow]=useState(Date.now());
 const changing=useRef(false),revision=useRef(0);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
 const callback=useRef(onSlotChange);callback.current=onSlotChange;
 const selected=useRef(id);selected.current=id;
 useEffect(()=>{let active=true;fetch("/api/admin/learning-cycles",{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.message||"회차 조회 실패");if(!active)return;const rows=j.cycles??[];setCycles(rows);const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul"}).format(new Date());const nearest=[...rows].sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date))).find(c=>String(c.start_date)>=today);setId(nearest?.id??rows[0]?.id??"");}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[]);
 useEffect(()=>{let active=true,running=false;setSlot(null);callback.current?.(null);if(!id)return;async function load(){if(running||changing.current)return;running=true;const version=revision.current;try{const r=await fetch(`/api/admin/exam-slots?cycleId=${encodeURIComponent(id)}`,{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.message||"배정 조회 실패");if(active&&!changing.current&&version===revision.current){setSlot(j);callback.current?.(j);}}catch(e){if(active)setMessage(e instanceof Error?e.message:"조회 실패");}finally{running=false;}}void load();const t=setInterval(()=>void load(),10000);return()=>{active=false;clearInterval(t);};},[id]);
 const rows=slot?.rows??[],assigned=rows.filter((r:any)=>r.exam_id&&r.booking_status!=="COMPLETED"),started=rows.some((r:any)=>r.booking_status==="IN_PROGRESS"),paused=rows.some((r:any)=>r.booking_status==="IN_PROGRESS"&&r.exam?.paused_at);
 const timer=cycleClock(rows,now);
 const hasStarted=started||rows.some((r:any)=>r.booking_status==="COMPLETED");
 const statusText={running:"시험 중",paused:"시험 일시정지",mixed:"일부 일시정지",finished:"시험 종료",checking:"상태 확인 중",ready:"시험 시작 대기"}[timer.state];
 const timerText=hasStarted?`${String(Math.floor(timer.remaining/60)).padStart(2,"0")}:${String(timer.remaining%60).padStart(2,"0")}`:"100:00";
 const eligible=assigned.filter((r:any)=>r.sos_gate_open),blocked=assigned.filter((r:any)=>!r.sos_gate_open),prepared=eligible.length>0&&eligible.every((r:any)=>r.timer_prepared);
 async function changeGate(row:any,allow:boolean){
  const name=String(row.students?.name??"학생");
  const lateStart=allow&&hasStarted;
  const warning=lateStart
   ?"⚠ SOS 미완료 학생 뒤늦은 시험 시작\n\n"+name+" 학생은 이전 SOS 학습을 완료하지 않았습니다.\n시험은 이미 시작되었습니다. 이 학생에게 지금부터 전체 시험시간을 새로 부여해 응시를 시작할까요?\n\n이 작업은 경고를 확인한 관리자 예외 처리로 기록됩니다."
   :allow
     ?"⚠ SOS 미완료 학생 예외 응시 허용\n\n"+name+" 학생은 이전 SOS 학습을 완료하지 않았습니다.\n그래도 이번 시험 응시를 허용할까요?\n\n허용하면 학생 화면의 차단 경고가 해제되고 시험 시작 대상에 포함됩니다."
     :name+" 학생의 관리자 예외 응시 허용을 취소할까요?\n실제 SOS 완료 상태로 다시 판정됩니다.";
  if(!confirm(warning))return;
  setBusy(true);setMessage("");
  try{
   const action=allow?(hasStarted?"override-start":"override-gate"):"revoke-gate";
   const response=await fetch("/api/admin/exam-slots",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,cycleId:id,membershipId:row.id})});
   const data=await response.json();if(!response.ok)throw Error(data.message||"응시 예외 설정 실패");
   setMessage(data.message);
   const next=await fetch("/api/admin/exam-slots?cycleId="+encodeURIComponent(id),{cache:"no-store"});
   const refreshed=await next.json();if(!next.ok)throw Error(refreshed.message);
   setSlot(refreshed);callback.current?.(refreshed);
  }catch(e){setMessage(e instanceof Error?e.message:"응시 예외 설정 실패");}finally{setBusy(false);}
 }
 async function act(action:string){
  if(changing.current)return;
  const requested=id;
  if(action==="start"){
   const extra=blocked.length?"\n\n⚠ SOS 미완료 "+blocked.length+"명은 제외됩니다. 시험 시작 후에도 학생별로 예외 허용하여 뒤늦게 시작시킬 수 있습니다.":"";
   if(!confirm(String(slot?.cycle?.name??"회차")+" · 응시 가능 "+eligible.length+"명을 지금 시작할까요?\n각자 배정된 시험지로 동시에 시작합니다."+extra))return;
  }
  changing.current=true;revision.current++;setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/admin/exam-slots",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,cycleId:requested})});
   const j=await r.json();if(!r.ok)throw Error(j.message||"처리 실패");if(selected.current!==requested)return;
   setMessage(action==="prepare"?"회차 타이머 준비 완료 · 시작 버튼을 눌러야 시험이 시작됩니다.":action==="start"?String(j.started)+"명 시험 시작"+(j.blocked?.length?" · SOS 미완료 "+j.blocked.length+"명 제외":""):action==="pause"?"회차 전체 일시정지":"회차 전체 재개");
   const next=await fetch("/api/admin/exam-slots?cycleId="+encodeURIComponent(requested),{cache:"no-store"});
   const data=await next.json();if(!next.ok)throw Error(data.message);
   if(selected.current===requested){setSlot(data);callback.current?.(data);}
  }catch(e){setMessage(e instanceof Error?e.message:"처리 실패");}finally{changing.current=false;setBusy(false);}
 }
 return <section className="cycle-start"><header><div><small>SOS 시험 운영</small><h2>회차별 시험 진행</h2><p>회차를 한 번 시작하면 학생마다 배정된 A/B/C 시험지와 개인 순번으로 응시합니다.</p></div></header><div className="cycle-overview"><div><label>진행할 운영 회차<select disabled={busy} aria-label="진행할 운영 회차" value={id} onChange={e=>{setId(e.target.value);setMessage("");}}><option value="">회차 선택</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name} · {c.start_date}</option>)}</select></label><p>{slot?.cycle?.scheduled_at?new Date(slot.cycle.scheduled_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"}):"회차 조회 중"} · 시험지 출력 1시간 전 · 대기 입장 5분 전</p></div><aside className={`live-clock ${timer.state}`} aria-label="회차 시험 타이머"><strong className="live-state" role="status"><i/>{statusText}</strong><span className="clock-caption">{timer.state==="paused"?"정지된 남은 시간":hasStarted?"남은 시험 시간":"시험 시간"}</span><b className="clock-digits" role="timer" aria-live="off">{timerText}</b><small>{timer.different?"학생별 남은 시간 중 가장 긴 시간 표시":timer.state==="paused"?"재개하면 남은 시간부터 이어집니다":timer.state==="running"?"학생 화면과 같은 종료 시각 기준":"회차 전체 시험 타이머"}</small><div className="clock-actions"><button type="button" className="pause-control" disabled={busy||timer.running===0} onClick={()=>void act("pause")}>Ⅱ 시험 일시정지</button><button type="button" className="resume-control" disabled={busy||timer.paused===0} onClick={()=>void act("resume")}>▶ 시험 재개</button></div></aside></div><div className="summary"><b>참가 {rows.length}명</b><b>배정 {rows.filter((r:any)=>r.exam_id).length}명</b><b>시작 가능 {eligible.length}명</b><b className={blocked.length?"warning":""}>SOS 미완료 {blocked.length}명</b></div>{blocked.length?<div className="gate-warning"><strong>⚠ SOS 학습 미완료 학생</strong><p>{hasStarted?"시험은 이미 시작되었습니다. 아래 학생은 경고 확인 후 지금부터 개인 타이머로 시작시킬 수 있습니다.":"원칙상 시험 시작이 차단됩니다. 부득이하게 응시시킬 경우 학생별로 이번 회차 응시 허용을 눌러 주세요."}</p><div>{blocked.map((r:any)=><span key={r.id}><b>{r.students?.name}</b><button type="button" disabled={busy} onClick={()=>void changeGate(r,true)}>{hasStarted?"경고 확인 · 지금 시험 시작 허용":"경고 확인 · 이번 회차 응시 허용"}</button></span>)}</div></div>:null}{assigned.some((r:any)=>r.sos_gate_status==="OVERRIDE")?<div className="override-list"><strong>관리자 예외 허용</strong>{assigned.filter((r:any)=>r.sos_gate_status==="OVERRIDE").map((r:any)=><span key={r.id}><b>{r.students?.name}</b>{r.booking_status==="IN_PROGRESS"?<em>예외 허용 · 시험 진행 중</em>:<button type="button" disabled={busy} onClick={()=>void changeGate(r,false)}>예외 허용 취소</button>}</span>)}</div>:null}{!hasStarted?<div className="actions"><button className="secondary-button" disabled={!slot||busy||!assigned.length} onClick={()=>void act("prepare")}>① 회차 타이머 생성</button><button className="primary-button" disabled={!slot||busy||!prepared} onClick={()=>void act("start")}>② 회차 전체 시험 시작</button></div>:null}<p role="status">{busy?"처리 중…":message}</p><small>아래 시험지는 시작 대상 선택이 아닌, 이 회차의 학생별 답안·제출 현황 조회용입니다.</small><style jsx>{`.cycle-start{padding:24px;border:1px solid #dce5df;border-radius:16px;background:white;margin-bottom:20px}.cycle-start h2{margin:6px 0}.cycle-start p{color:#66756c}.cycle-start small{color:#386b4a}.cycle-start label{display:grid;gap:8px;font-weight:800}.cycle-start select{padding:12px;border:1px solid #cddbd1;border-radius:9px;width:100%;max-width:600px}.summary,.actions{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.summary b{background:#f1f6f2;border-radius:8px;padding:10px}.summary b.warning{background:#fff0ec;color:#a13a25}.gate-warning{border:2px solid #d96a4b;background:#fff5f2;border-radius:12px;padding:14px;margin:14px 0;color:#7d2b1c}.gate-warning>strong{font-size:15px}.gate-warning>p{margin:6px 0 10px;color:#7d2b1c}.gate-warning>div,.override-list{display:flex;gap:8px;flex-wrap:wrap}.gate-warning span,.override-list span{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #edc1b5;border-radius:9px;padding:7px 9px}.gate-warning button{border:0;background:#b94a2f;color:#fff;border-radius:7px;padding:7px 10px;font-weight:900}.override-list{border:1px solid #d8b661;background:#fff9e8;border-radius:10px;padding:10px;margin:10px 0;align-items:center}.override-list>strong{color:#855f00}.override-list button{border:1px solid #c9a64c;background:#fff;color:#765600;border-radius:7px;padding:6px 9px;font-weight:800}.override-list em{font-style:normal;color:#2f6937;font-weight:900}.actions button:disabled,.clock-actions button:disabled{opacity:.4;cursor:not-allowed}.cycle-overview{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,380px);gap:28px;align-items:center}.live-clock{border:2px solid #d5dfd8;background:#f4f7f5;border-radius:18px;padding:22px;text-align:center;display:grid;justify-items:center;gap:8px}.live-clock.running{background:#eaf7ef;border-color:#25824c}.live-clock.paused,.live-clock.mixed{background:#fff4df;border-color:#c48216}.live-state{display:flex;align-items:center;gap:9px;font-size:24px;color:#1c653a}.live-state i{width:12px;height:12px;border-radius:50%;background:currentColor}.paused .live-state,.mixed .live-state{color:#955c05}.finished .live-state{color:#69756e}.clock-caption{font-size:13px;color:#5b6b61}.clock-digits{font-size:clamp(48px,5vw,68px);font-weight:900;line-height:1.1;letter-spacing:1px;font-variant-numeric:tabular-nums;color:#173b25}.clock-actions{display:flex;gap:8px;width:100%;margin-top:10px}.clock-actions button{flex:1;border:0;border-radius:10px;padding:13px 8px;font-weight:900;font-size:15px;cursor:pointer}.pause-control{background:#a95c0a;color:white}.resume-control{background:#206c40;color:white}@media(max-width:800px){.cycle-overview{grid-template-columns:1fr;gap:12px}.clock-digits{font-size:60px}.cycle-start{padding:18px}}`}</style></section>;
}
