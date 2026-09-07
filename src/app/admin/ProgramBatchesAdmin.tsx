"use client";
import { useEffect, useState } from "react";

const won = (v: number) => new Intl.NumberFormat("ko-KR").format(v ?? 0);
const day = (v: string) => v ? new Date(`${v}T00:00:00`).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" }) : "-";
const status: Record<string, string> = { REQUESTED: "신청접수", PAID: "결제확인", ENROLLED: "등록완료", CANCELLED: "취소", REFUNDED: "환불" };
const paymentLabel = (v: string) => v === "CARD" ? "카드결제" : v === "BANK_TRANSFER" ? "계좌이체(현금영수증)" : "결제방법 미지정";
const activeApplication = (a: any) => ["REQUESTED", "PAID", "ENROLLED"].includes(String(a.status));

export default function ProgramBatchesAdmin() {
  const [data, setData] = useState<any>(null);
  const [title, setTitle] = useState("SOS 5회 프로그램");
  const [price, setPrice] = useState(350000);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingBatchId, setEditingBatchId] = useState("");
  const [editingCycles, setEditingCycles] = useState<string[]>([]);
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

  const create = async () => {
    if (selected.length !== 5) return alert("운영 회차를 정확히 5개 선택해 주세요.");
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

  const batches = data?.batches ?? [];
  const apps = data?.applications ?? [];
  const students = data?.students ?? [];

  return <section className="pb-admin">
    <div className="pb-title"><div><small>SOS 5-WEEK APPLICATION</small><h2>5회 프로그램 신청 관리</h2><p>회차를 만들고 5개를 묶은 뒤 신청을 열 수 있습니다. 시작한 회차가 있어도 남은 회차는 신청 가능합니다.</p></div><button onClick={() => window.open("/p", "_blank")}>학부모 신청 화면 보기 ↗</button></div>

    <article className="pb-create"><div><h3>새 5회 묶음 개설</h3><p>회차 관리에서 만들어둔 운영 일정 중 정확히 5개를 선택합니다.</p><label>상품명<input value={title} onChange={e => setTitle(e.target.value)} /></label><label>5회 전체 이용료<input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} /></label><small>회차별 신청 금액은 전체 이용료 ÷ 5로 자동 계산됩니다.</small><button className="primary" onClick={() => void create()} disabled={busy === "create"}>5회 묶음 만들기</button></div><div className="pb-cycles">{(data?.cycles ?? []).map((c: any) => <label className={selected.includes(String(c.id)) ? "on" : ""} key={c.id}><input type="checkbox" checked={selected.includes(String(c.id))} onChange={() => toggle(selected, String(c.id), setSelected)} /><b>{c.name}</b><span>{day(c.start_date)} ~ {day(c.end_date)}</span></label>)}</div></article>

    <section className="pb-batches">{batches.map((b: any) => {
      const editing = editingBatchId === String(b.id);
      return <article key={b.id}><header><div><small>{b.is_published ? "학부모 신청 가능" : "비공개"}</small><h3>{b.title}</h3><p>{won(b.price)}원 · 1회 {won(Math.round(Number(b.price ?? 0) / 5))}원 · 신청 {apps.filter((a: any) => String(a.batch_id) === String(b.id) && activeApplication(a)).length}명</p></div><div className="pb-head-buttons"><button onClick={() => void call({ action: "publish", batchId: b.id, published: !b.is_published })}>{b.is_published ? "신청 닫기" : "신청 열기"}</button><button onClick={() => editing ? setEditingBatchId("") : beginEdit(b)}>{editing ? "편집 취소" : "회차 구성 수정"}</button><button className="danger" onClick={() => { if (confirm(`'${b.title}' 묶음을 삭제할까요?\n신청 내역이 있으면 삭제되지 않습니다.`)) void call({ action: "delete-batch", batchId: b.id }); }}>묶음 삭제</button></div></header>
        {editing ? <div className="pb-edit"><p>기존 회차를 빼고 다른 회차를 추가할 수 있습니다. 정확히 5개를 선택한 뒤 저장하세요.</p><div className="pb-cycles">{(data?.cycles ?? []).map((c: any) => <label className={editingCycles.includes(String(c.id)) ? "on" : ""} key={c.id}><input type="checkbox" checked={editingCycles.includes(String(c.id))} onChange={() => toggle(editingCycles, String(c.id), setEditingCycles)} /><b>{c.name}</b><span>{day(c.start_date)} ~ {day(c.end_date)}</span></label>)}</div><button className="primary save-edit" onClick={() => void saveEdit(String(b.id))}>5회 구성 저장</button></div> : <div className="pb-five">{b.cycles.map((c: any) => <span key={c.cycle_id}><b>{c.slot_no}회</b>{day(c.start_date)}<small>{c.name}</small></span>)}</div>}
      </article>;
    })}</section>

    <article className="pb-apps"><h3>학부모 신청 내역</h3>{apps.map((a: any) => {
      const batch = batches.find((b: any) => String(b.id) === String(a.batch_id));
      const linked = students.find((s: any) => String(s.id) === String(a.student_id));
      const selectedIds = Array.isArray(a.selected_cycle_ids) ? a.selected_cycle_ids.map(String) : [];
      const cycleText = String(a.application_mode ?? "ALL") === "CYCLES" && selectedIds.length
        ? (batch?.cycles ?? []).filter((c: any) => selectedIds.includes(String(c.cycle_id))).map((c: any) => `${c.slot_no}회`).join(", ")
        : "전체 회차";
      return <div key={a.id}><span><small>{status[a.status] ?? a.status}</small><b>{a.student_name} · {a.school} {a.grade}</b><em>{a.parent_name} 학부모 · {a.parent_phone} · 학생 {a.student_phone || "전화번호 없음"} · {batch?.title ?? "5회 묶음"} · {cycleText} · {won(Number(a.charged_price ?? batch?.price ?? 0))}원 · {paymentLabel(a.payment_method)}</em></span><span className="pb-link">{a.status === "REQUESTED" ? <><select defaultValue={a.student_id ?? ""} id={`student-${a.id}`}><option value="">신규 학생 자동 생성</option>{students.map((s: any) => <option value={s.id} key={s.id}>{s.name} · {s.school}</option>)}</select><button className="paid" onClick={() => { const el = document.getElementById(`student-${a.id}`) as HTMLSelectElement | null; if (confirm(`${paymentLabel(a.payment_method)} 결제 확인 처리하고 ${cycleText}에 등록할까요?`)) void call({ action: "enroll", applicationId: a.id, studentId: el?.value || "" }); }}>{a.payment_method === "CARD" ? "카드결제 확인·등록" : "이체확인·등록"}</button><button onClick={() => void call({ action: "cancel", applicationId: a.id })}>취소</button></> : <b>{linked ? `${linked.name} 계정 연결` : status[a.status]}</b>}</span></div>;
    })}{!apps.length ? <p>접수된 신청이 없습니다.</p> : null}</article>

    <style jsx>{`.pb-admin{display:grid;gap:17px}.pb-title{display:flex;justify-content:space-between;align-items:end}.pb-title small{color:#2f6937;font-weight:900}.pb-title h2{margin:6px 0}.pb-title p{margin:0;color:#718078}.pb-title button,.pb-batches button{height:40px;border:1px solid #cddbd0;border-radius:9px;background:#fff;font-weight:800}.pb-create{display:grid;grid-template-columns:300px 1fr;gap:20px;padding:20px;background:#fff;border:1px solid #dbe5dd;border-radius:15px}.pb-create p,.pb-edit p{color:#718078;font-size:12px}.pb-create>div:first-child{display:grid;gap:10px}.pb-create label{display:grid;gap:5px;font-size:12px;font-weight:800}.pb-create input,.pb-apps select{height:40px;border:1px solid #d5dfd7;border-radius:8px;padding:0 9px}.primary,.paid{border:0!important;background:#2f6937!important;color:#fff!important}.danger{color:#9c2c2c!important;border-color:#e7caca!important}.pb-cycles{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;max-height:330px;overflow:auto}.pb-cycles label{padding:11px;border:1px solid #dfe6e1;border-radius:9px}.pb-cycles label.on{border-color:#2f6937;background:#f0f7f1}.pb-cycles span,.pb-cycles b{display:block;margin-left:24px}.pb-cycles span{font-size:11px;color:#718078}.pb-batches{display:grid;grid-template-columns:repeat(2,1fr);gap:13px}.pb-batches>article,.pb-apps{padding:18px;background:#fff;border:1px solid #dbe5dd;border-radius:15px}.pb-batches header{display:flex;justify-content:space-between;gap:12px}.pb-batches h3{margin:4px 0}.pb-batches p{margin:0;color:#718078}.pb-head-buttons{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.pb-five{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-top:14px}.pb-five span{padding:8px;background:#f4f8f5;border-radius:8px;font-size:10px}.pb-five b,.pb-five small{display:block}.pb-five small{color:#758079;margin-top:3px}.pb-edit{margin-top:14px;padding-top:12px;border-top:1px solid #e9efeb}.save-edit{height:42px;margin-top:10px;border-radius:8px}.pb-apps>div{display:flex;justify-content:space-between;align-items:center;padding:13px 0;border-top:1px solid #edf0ee}.pb-apps span>*{display:block}.pb-apps small{color:#a56817;font-weight:900}.pb-apps em{font-style:normal;color:#718078;font-size:11px;margin-top:4px}.pb-link{display:flex!important;flex-direction:row;gap:6px;align-items:center}.pb-link button{height:38px;border:1px solid #d7dfd9;border-radius:8px;background:#fff;font-weight:800}@media(max-width:1100px){.pb-batches{grid-template-columns:1fr}}@media(max-width:900px){.pb-create{grid-template-columns:1fr}.pb-apps>div{align-items:flex-start;gap:10px;flex-direction:column}.pb-five{grid-template-columns:1fr}.pb-title{align-items:flex-start;gap:10px}.pb-batches header{flex-direction:column}.pb-head-buttons{justify-content:flex-start}}`}</style>
  </section>;
}
