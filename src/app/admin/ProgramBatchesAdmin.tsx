"use client";
import { useEffect, useMemo, useState } from "react";

const won = (v: number) => new Intl.NumberFormat("ko-KR").format(v ?? 0);
const day = (v: string) => v ? new Date(`${v}T00:00:00`).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" }) : "-";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const status: Record<string, string> = { REQUESTED: "신청 접수", PAID: "입금확인", ENROLLED: "등록 완료", CANCELLED: "신청 취소", REFUNDED: "환불" };
const paymentLabel = (v: string) => v === "CARD" ? "카드결제" : v === "BANK_TRANSFER" ? "계좌이체(현금영수증)" : "결제방법 미지정";
const activeApplication = (a: any) => ["REQUESTED", "PAID", "ENROLLED"].includes(String(a.status));
const isPastCycle = (c: any) => String(c?.start_date ?? "").slice(0, 10) < today();

function FinderCycles({cycles,selected,count,busy,onToggle,onSave}:{cycles:any[];selected:string[];count:number;busy:boolean;onToggle:(id:string,count:number)=>void;onSave:()=>void}) {
  return <section className="application-cycle-editor">
    <header><div><b>최근 10회 참가일에서 변경</b><small>결제된 {count}회는 유지됩니다. 날짜 {count}개를 선택하세요.</small></div><strong>{selected.length}/{count}</strong></header>
    <div className="date-grid">{cycles.map((cycle: any) => { const checked = selected.includes(String(cycle.id)); return <label className={checked ? "selected" : ""} key={cycle.id}><input type="checkbox" checked={checked} onChange={() => onToggle(String(cycle.id), count)} /><b>{day(cycle.start_date)}</b><small>{cycle.name}</small></label>; })}</div>
    <button className="primary save-dates" disabled={busy || selected.length !== count} onClick={onSave}>변경한 참가일 저장</button>
    <style jsx global>{`.application-row{flex-wrap:wrap!important}.chosen-cycles{display:flex!important;gap:6px;flex-wrap:wrap;margin-top:9px}.chosen-cycles i{font-style:normal;padding:5px 9px;border-radius:16px;background:#edf5ef;color:#285e39;font-size:11px;font-weight:800}.chosen-cycles .empty-cycle{background:#f6f1e9;color:#986621}.edit-dates{color:#285e39!important;border-color:#a9c5b0!important;background:#f4faf6!important}`}</style>
    <style jsx>{`.application-cycle-editor{grid-column:1/-1;width:100%;box-sizing:border-box;margin-top:14px;padding:18px;background:#f7faf8;border:1px solid #cbded0;border-radius:13px}.application-cycle-editor header{display:flex;justify-content:space-between;align-items:center;margin-bottom:13px}.application-cycle-editor header small{display:block;margin-top:4px;color:#6f7e75}.application-cycle-editor header strong{color:#285e39}.date-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.date-grid label{display:grid;grid-template-columns:auto 1fr;column-gap:7px;padding:11px;border:1px solid #dce5df;border-radius:9px;background:#fff;cursor:pointer}.date-grid label.selected{border-color:#2f6937;background:#ebf5ee}.date-grid input{grid-row:1/3;margin:2px 0}.date-grid small{color:#718078;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.save-dates{margin-top:13px;padding:11px 18px;border:0;border-radius:9px;background:#2f6937;color:#fff;font-weight:800}.save-dates:disabled{opacity:.45}@media(max-width:1000px){.date-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}`}</style>
  </section>;
}

export default function ProgramBatchesAdmin({mode="payments"}:{mode?:"setup"|"payments"}) {
  const [data, setData] = useState<any>(null);
  const [title, setTitle] = useState("SOS 5회 프로그램");
  const [price, setPrice] = useState(350000);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingBatchId, setEditingBatchId] = useState("");
  const [editingCycles, setEditingCycles] = useState<string[]>([]);
  const [editingApplicationId, setEditingApplicationId] = useState("");
  const [editingApplicationCycles, setEditingApplicationCycles] = useState<string[]>([]);
  const [busy, setBusy] = useState("");

  const load = async () => {
    const r = await fetch("/api/admin/program-batches", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) return alert(j.message);
    setData(j);
  };
  useEffect(() => { void load(); }, []);

  const call = async (body: any) => {
    setBusy(body.action + (body.applicationId ?? body.batchId ?? ""));
    try {
      const r = await fetch("/api/admin/program-batches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
      await load();
      return true;
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리하지 못했습니다.");
      return false;
    } finally {
      setBusy("");
    }
  };

  const cycles = useMemo(() => [...(data?.cycles ?? [])].sort((a: any, b: any) => String(a.start_date ?? "").localeCompare(String(b.start_date ?? ""))), [data]);
  const currentCycles = cycles.filter((c: any) => !isPastCycle(c));
  const pastCycles = cycles.filter((c: any) => isPastCycle(c)).reverse();
  const batches = data?.batches ?? [];
  const apps = data?.applications ?? [];
  const students = data?.students ?? [];
  const recentCycles = useMemo(() => [...(data?.recentCycles ?? [])]
    .sort((a: any, b: any) => String(a.start_date ?? "").localeCompare(String(b.start_date ?? ""))), [data]);
  const visibleApplications = apps.filter((application: any) => {
    const batch = batches.find((item: any) => String(item.id) === String(application.batch_id));
    return applicationCycleIds(application, batch).some((id: string) => recentCycles.some((cycle: any) => String(cycle.id) === id));
  });

  const create = async () => {
    if (selected.length !== 5) return alert("현재/예정 운영 회차를 정확히 5개 선택해 주세요.");
    if (await call({ action: "create", title, price, cycleIds: selected })) setSelected([]);
  };
  const toggle = (list: string[], id: string, setter: (v: string[]) => void) => {
    if (list.includes(id)) setter(list.filter((x) => x !== id));
    else if (list.length < 5) setter([...list, id]);
  };
  const beginEdit = (batch: any) => {
    setEditingBatchId(String(batch.id));
    setEditingCycles((batch.cycles ?? []).map((c: any) => String(c.cycle_id)));
  };
  const saveEdit = async (batchId: string) => {
    if (editingCycles.length !== 5) return alert("회차 구성은 정확히 5개여야 합니다.");
    const ok = await call({ action: "update-cycles", batchId, cycleIds: editingCycles });
    if (ok) { setEditingBatchId(""); setEditingCycles([]); }
  };
  function applicationCycleIds(application: any, batch: any) {
    const selectedIds = Array.isArray(application.selected_cycle_ids) ? application.selected_cycle_ids.map(String) : [];
    return selectedIds.length ? selectedIds : (batch?.cycles ?? []).map((c: any) => String(c.cycle_id));
  }
  const beginApplicationEdit = (application: any, batch: any) => {
    setEditingApplicationId(String(application.id));
    setEditingApplicationCycles(applicationCycleIds(application, batch)
      .filter((id: string) => recentCycles.some((cycle: any) => String(cycle.id) === id)));
  };
  const toggleApplicationCycle = (id: string, count: number) => {
    setEditingApplicationCycles((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : current.length < count ? [...current, id] : current);
  };
  const saveApplicationCycles = async (application: any) => {
    const batch = batches.find((b: any) => String(b.id) === String(application.batch_id));
    const count = Math.max(1, Number(application.purchased_count) || applicationCycleIds(application, batch).length || 5);
    if (editingApplicationCycles.length !== count) return alert(`결제된 횟수와 동일하게 ${count}개 날짜를 선택해 주세요.`);
    const ok = await call({ action: "update-application-cycles", applicationId: application.id, studentId: application.student_id, cycleIds: editingApplicationCycles });
    if (ok) { setEditingApplicationId(""); setEditingApplicationCycles([]); }
  };

  const cyclePicker = (list: string[], setter: (v: string[]) => void, includePast = false) => <>
    <div className="pb-cycles">{currentCycles.map((c: any) => <label className={list.includes(String(c.id)) ? "on" : ""} key={c.id}><input type="checkbox" checked={list.includes(String(c.id))} onChange={() => toggle(list, String(c.id), setter)} /><b>{c.name}</b><span>{day(c.start_date)} ~ {day(c.end_date)}</span><em>신청 가능 회차</em></label>)}</div>
    {includePast && pastCycles.length ? <details className="past-cycles"><summary>기존·과거 회차 보기 ({pastCycles.length})</summary><div className="pb-cycles old">{pastCycles.map((c: any) => <label className={list.includes(String(c.id)) ? "on" : ""} key={c.id}><input type="checkbox" checked={list.includes(String(c.id))} onChange={() => toggle(list, String(c.id), setter)} /><b>{c.name}</b><span>{day(c.start_date)} ~ {day(c.end_date)}</span><em>기존 회차 · 데이터 유지</em></label>)}</div></details> : null}
  </>;

  return <section className="pb-admin">
    <div className="pb-title">
      <div><small>MATHPOOH SOS APPLICATION FLOW</small><h2>{mode==="setup"?"5회 모집 구성":"신청·입금 관리"}</h2><p>학부모가 선택한 회차는 시험 내용이 아니라 줌 참가 날짜로 확정됩니다. 시험지는 학생의 공식 참가순번과 범위에 맞춰 배정됩니다.</p></div>
      <button onClick={() => window.open("/p?tab=apply", "_blank")}>학부모 신청 화면 보기 ↗</button>
    </div>

    {mode==="setup"&&<>
    <article className="pb-create">
      <div><small className="step">STEP 2 · 참가권 구성</small><h3>새 SOS 참가권 만들기</h3><p>학부모에게 보여줄 줌 참가 가능 날짜 5개를 고릅니다.</p><label>참가권명<input value={title} onChange={e => setTitle(e.target.value)} /></label><label>5회 전체 이용료<input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} /></label><small>선택 횟수에 따라 1회 금액이 자동 합산됩니다.</small><button className="primary" onClick={() => void create()} disabled={busy === "create"}>선택한 날짜로 참가권 만들기</button></div>
      <div><div className="picker-head"><b>현재/예정 회차</b><span>{selected.length}/5 선택</span></div>{cyclePicker(selected, setSelected, true)}</div>
    </article>

    <section className="pb-batches">{batches.map((b: any) => {
      const editing = editingBatchId === String(b.id);
      const activeCount = apps.filter((a: any) => String(a.batch_id) === String(b.id) && activeApplication(a)).length;
      return <article key={b.id}><header><div><small className={b.is_published ? "live" : "closed"}>{b.is_published ? "모집 중" : "모집 닫힘"}</small><h3>{b.title}</h3><p>{won(b.price)}원 · 1회 {won(Math.round(Number(b.price ?? 0) / 5))}원 · 진행 신청 {activeCount}명</p></div><div className="pb-head-buttons"><button className={b.is_published ? "" : "primary"} onClick={() => void call({ action: "publish", batchId: b.id, published: !b.is_published })}>{b.is_published ? "신청 닫기" : "신청 열기"}</button><button onClick={() => editing ? setEditingBatchId("") : beginEdit(b)}>{editing ? "편집 취소" : "구성 수정"}</button><button className="danger" disabled={busy === `delete-batch${b.id}`} onClick={() => { const message = activeCount > 0 ? `'${b.title}'에 진행 중인 신청 ${activeCount}건이 있습니다.\n먼저 아래 신청을 취소 또는 삭제해 주세요.` : `'${b.title}' 모집안을 삭제할까요?\n취소된 신청서는 함께 정리되지만 원본 회차·응시·성적·학습 기록은 삭제되지 않습니다.`; if (activeCount > 0) return alert(message); if (confirm(message)) void call({ action: "delete-batch", batchId: b.id }); }}>모집안 삭제</button></div></header>
        {editing ? <div className="pb-edit"><p>모집에 연결된 회차만 바꿉니다. 원본 회차와 기존 학습 데이터는 그대로 유지됩니다.</p>{cyclePicker(editingCycles, setEditingCycles, true)}<button className="primary save-edit" onClick={() => void saveEdit(String(b.id))}>5회 구성 저장</button></div> : <div className="pb-five">{(b.cycles ?? []).map((c: any) => <span key={c.cycle_id} className={isPastCycle(c) ? "past" : ""}><b>{c.slot_no}회</b>{day(c.start_date)}<small>{c.name}</small><em>{isPastCycle(c) ? "종료" : "신청 가능"}</em></span>)}</div>}
      </article>;
    })}</section>

    </>}
    {mode==="payments"&&<article className="pb-apps"><div className="apps-title"><div><small className="step">최근 10회 참가 일정</small><h3>학부모 신청 내역</h3></div><span>신청한 날짜만 표시 · 관리자 날짜 변경 가능</span></div>{visibleApplications.map((a: any) => {
      const batch = batches.find((b: any) => String(b.id) === String(a.batch_id));
      const linked = students.find((s: any) => String(s.id) === String(a.student_id));
      const selectedIds = applicationCycleIds(a, batch);
      const selectedCycles = recentCycles.filter((c: any) => selectedIds.includes(String(c.id)));
      const cycleText = selectedCycles.map((c: any) => day(c.start_date)).join(", ") || "선택한 최근 일정 없음";
      const editingApplication = editingApplicationId === String(a.id);
      const purchasedCount = Math.max(1, Number(a.purchased_count) || selectedIds.length || 5);
      const isCancelled = ["CANCELLED", "REFUNDED"].includes(String(a.status));
      const cancelLabel = a.status === "ENROLLED" ? "등록 취소" : a.status === "PAID" ? "결제 취소" : "신청 취소";
      return <div key={a.id} className={isCancelled ? "cancelled application-row" : "application-row"}><span><small>{status[a.status] ?? a.status}</small><b>{a.student_name} · {a.school} {a.grade}</b><em>{a.parent_name} 학부모 · {won(Number(a.charged_price ?? batch?.price ?? 0))}원 · {paymentLabel(a.payment_method)}</em><span className="chosen-cycles">{selectedCycles.map((c: any) => <i key={c.id}>{day(c.start_date)}</i>)}{!selectedCycles.length ? <i className="empty-cycle">최근 10회 내 선택 일정 없음</i> : null}</span></span><span className="pb-link">
        {a.status === "REQUESTED" ? <>{linked ? <strong className="linked">자녀 계정 연결됨</strong> : <strong className="warning">자녀 연결 확인 필요</strong>}<button className="paid" disabled={!linked || busy === `enroll${a.id}`} onClick={() => { if (!linked) return alert("학부모가 먼저 자녀 계정을 연결해야 합니다."); if (confirm(`${paymentLabel(a.payment_method)} 결제를 확인하고 ${cycleText}에 참가 등록할까요? 시험지는 시험지 배정에서 지정합니다.`)) void call({ action: "enroll", applicationId: a.id, studentId: linked.id }); }}>{a.payment_method === "CARD" ? "결제확인" : "입금확인"}</button></> : <b>{linked ? `${linked.name} · ${status[a.status] ?? a.status}` : status[a.status]}</b>}
        {!isCancelled ? <button className="edit-dates" disabled={!!busy} onClick={() => editingApplication ? setEditingApplicationId("") : beginApplicationEdit(a, batch)}>{editingApplication ? "변경 취소" : "참가일 변경"}</button> : null}
        {!isCancelled ? <button disabled={busy === `cancel${a.id}`} onClick={() => { if (confirm(`${cancelLabel} 처리할까요?\n원본 회차와 이미 발생한 응시·성적·학습 기록은 유지됩니다.`)) void call({ action: "cancel", applicationId: a.id }); }}>{cancelLabel}</button> : null}
        <button className="danger" disabled={busy === `delete-application${a.id}`} onClick={() => { if (confirm(`${a.student_name} 학생의 이 신청 내역을 완전히 삭제할까요?\n원본 회차와 이미 발생한 응시·성적·학습 기록은 삭제되지 않습니다.`)) void call({ action: "delete-application", applicationId: a.id }); }}>신청 삭제</button>
      </span>{editingApplication ? <FinderCycles cycles={recentCycles} selected={editingApplicationCycles} count={purchasedCount} busy={!!busy} onToggle={toggleApplicationCycle} onSave={() => void saveApplicationCycles(a)} /> : null}</div>;
    })}{!visibleApplications.length ? <p>최근 10회 일정에 해당하는 신청이 없습니다.</p> : null}</article>}

    <style jsx>{`.pb-admin{display:grid;gap:17px}.pb-title{display:flex;justify-content:space-between;align-items:end;gap:20px}.pb-title small,.step{color:#2f6937;font-weight:900}.pb-title h2{margin:6px 0}.pb-title p{margin:0;color:#718078}.pb-title button,.pb-batches button{height:40px;border:1px solid #cddbd0;border-radius:9px;background:#fff;font-weight:800}.flowbar{display:flex;align-items:stretch;gap:8px;padding:14px;background:#fff;border:1px solid #dbe5dd;border-radius:15px}.flowbar>div,.flowbar>button{flex:1;display:grid;grid-template-columns:30px 1fr;column-gap:8px;align-items:center;text-align:left;padding:11px;border:1px solid #e0e8e2;border-radius:10px;background:#f8faf8}.flowbar>button{cursor:pointer}.flowbar b{grid-row:1/3;width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:#e7f1e9;color:#2f6937}.flowbar span{font-weight:900}.flowbar small{color:#758079}.flowbar i{align-self:center;color:#95a49a}.flowbar .active{border-color:#7da985;background:#f0f7f1}.notice{display:flex;gap:12px;align-items:center;padding:13px 16px;background:#fff9e9;border:1px solid #ead9a9;border-radius:12px}.notice b{color:#8a6514}.notice span{color:#796e50;font-size:12px}.pb-create{display:grid;grid-template-columns:300px 1fr;gap:20px;padding:20px;background:#fff;border:1px solid #dbe5dd;border-radius:15px}.pb-create h3{margin:5px 0}.pb-create p,.pb-edit p{color:#718078;font-size:12px}.pb-create>div:first-child{display:grid;gap:10px}.pb-create label{display:grid;gap:5px;font-size:12px;font-weight:800}.pb-create input{height:40px;border:1px solid #d5dfd7;border-radius:8px;padding:0 9px}.primary,.paid{border:0!important;background:#2f6937!important;color:#fff!important}.danger{color:#9c2c2c!important;border-color:#e7caca!important}.picker-head{display:flex;justify-content:space-between;margin-bottom:8px}.picker-head span{color:#2f6937;font-weight:900}.pb-cycles{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;max-height:310px;overflow:auto}.pb-cycles label{position:relative;padding:11px;border:1px solid #dfe6e1;border-radius:9px}.pb-cycles label.on{border-color:#2f6937;background:#f0f7f1}.pb-cycles span,.pb-cycles b,.pb-cycles em{display:block;margin-left:24px}.pb-cycles span{font-size:11px;color:#718078}.pb-cycles em{font-style:normal;font-size:10px;color:#397248;margin-top:3px}.past-cycles{margin-top:10px;border-top:1px solid #edf1ee;padding-top:9px}.past-cycles summary{cursor:pointer;color:#718078;font-size:12px;font-weight:800}.pb-cycles.old{margin-top:8px;max-height:220px}.pb-cycles.old em{color:#8b8b8b}.pb-batches{display:grid;grid-template-columns:repeat(2,1fr);gap:13px}.pb-batches>article,.pb-apps{padding:18px;background:#fff;border:1px solid #dbe5dd;border-radius:15px}.pb-batches header{display:flex;justify-content:space-between;gap:12px}.pb-batches h3{margin:4px 0}.pb-batches p{margin:0;color:#718078}.pb-batches header small.live{color:#2f6937;font-weight:900}.pb-batches header small.closed{color:#8a8f8b;font-weight:900}.pb-head-buttons{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.pb-five{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-top:14px}.pb-five span{padding:8px;background:#f4f8f5;border-radius:8px;font-size:10px}.pb-five span.past{background:#f3f3f3;opacity:.7}.pb-five b,.pb-five small,.pb-five em{display:block}.pb-five small{color:#758079;margin-top:3px}.pb-five em{font-style:normal;color:#2f6937;font-weight:900;margin-top:4px}.pb-five .past em{color:#888}.pb-edit{margin-top:14px;padding-top:12px;border-top:1px solid #e9efeb}.save-edit{height:42px;margin-top:10px;border-radius:8px}.apps-title{display:flex;justify-content:space-between;align-items:end}.apps-title h3{margin:5px 0}.apps-title>span{color:#718078;font-size:12px}.pb-apps>div:not(.apps-title){display:flex;justify-content:space-between;align-items:center;padding:13px 0;border-top:1px solid #edf0ee}.pb-apps>div.cancelled{opacity:.55}.pb-apps span>*{display:block}.pb-apps small{color:#a56817;font-weight:900}.pb-apps em{font-style:normal;color:#718078;font-size:11px;margin-top:4px}.pb-link{display:flex!important;flex-direction:row;gap:6px;align-items:center}.pb-link button{height:38px;border:1px solid #d7dfd9;border-radius:8px;background:#fff;font-weight:800}.pb-link .linked{color:#2f6937;font-size:11px}.pb-link .warning{color:#a56817;font-size:11px}@media(max-width:1100px){.pb-batches{grid-template-columns:1fr}.flowbar{overflow:auto}.flowbar>div,.flowbar>button{min-width:160px}.flowbar i{display:none}}@media(max-width:900px){.pb-create{grid-template-columns:1fr}.pb-apps>div:not(.apps-title){align-items:flex-start;gap:10px;flex-direction:column}.pb-five{grid-template-columns:repeat(2,1fr)}}`}</style>
  </section>;
}
