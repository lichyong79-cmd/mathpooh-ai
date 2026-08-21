export type SosCalendarWeek = {
  key:string;
  start:string;
  end:string;
  label:string;
  dateLabel:string;
  year:number;
  month:number;
  monthWeek:number;
};

const DAY=24*60*60*1000;
const pad=(n:number)=>String(n).padStart(2,"0");
const isoDate=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseDate=(value?:string|Date|null)=>{
  if(value instanceof Date)return new Date(value.getFullYear(),value.getMonth(),value.getDate());
  if(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)){
    const [y,m,d]=value.split("-").map(Number);return new Date(y,m-1,d);
  }
  const d=value?new Date(value):new Date();
  return Number.isNaN(d.getTime())?new Date():new Date(d.getFullYear(),d.getMonth(),d.getDate());
};
export function startOfSosWeek(value?:string|Date|null){
  const d=parseDate(value);const day=d.getDay();const diff=day===0?-6:1-day;d.setDate(d.getDate()+diff);return d;
}
/**
 * SOS284 · 그 달의 "첫 월요일"을 1주차로 센다.
 *
 * 이전에는 1일이 속한 주의 월요일을 기준점으로 잡았는데,
 * 그 월요일이 지난달일 수 있다는 걸 놓쳤다.
 * 예를 들어 2026년 8월 1일은 토요일이라 기준점이 7월 27일이 되고,
 * 그 결과 8월 3일(월)이 벌써 2주차가 되어 8월 1주차가 사라지고
 * 8월 31일이 6주차로 밀렸다.
 */
function monthWeekOfMonday(start:Date){
  const first=new Date(start.getFullYear(),start.getMonth(),1);
  const offset=(8-first.getDay())%7;                                  // 1일 이후 첫 월요일까지의 일수
  const firstMonday=new Date(start.getFullYear(),start.getMonth(),1+offset);
  const diff=Math.round((start.getTime()-firstMonday.getTime())/(7*DAY));
  return Math.max(1,diff+1);
}
export function getSosCalendarWeek(value?:string|Date|null):SosCalendarWeek{
  const start=startOfSosWeek(value);const end=new Date(start);end.setDate(end.getDate()+6);
  const monthWeek=monthWeekOfMonday(start);const month=start.getMonth()+1;const year=start.getFullYear();
  return {key:isoDate(start),start:isoDate(start),end:isoDate(end),label:`${year}년 ${month}월 ${monthWeek}주차`,dateLabel:`${month}/${start.getDate()}(월) ~ ${end.getMonth()+1}/${end.getDate()}(일)`,year,month,monthWeek};
}
export function listSosCalendarWeeks(center?:string|Date|null,before=12,after=6){
  const base=startOfSosWeek(center);const out:SosCalendarWeek[]=[];
  for(let i=-before;i<=after;i++){const d=new Date(base);d.setDate(d.getDate()+i*7);out.push(getSosCalendarWeek(d));}
  return out;
}
export function weekFromSnapshot(snapshot:any,createdAt?:string|null):SosCalendarWeek{
  // SOS284: 어느 주인지(주 시작일)는 스냅샷을 그대로 믿되,
  // 표시 라벨은 항상 그 날짜로 다시 계산한다.
  // 예전에 잘못 계산되어 저장된 라벨이 그대로 따라다니던 문제를 마이그레이션 없이 없앤다.
  const raw=snapshot?.sosWeek;
  if(raw?.start){
    const calc=getSosCalendarWeek(String(raw.start));
    return {...calc,key:String(raw.key||calc.key),start:String(raw.start),end:String(raw.end||calc.end)};
  }
  if(snapshot?.sosWeekStart){
    const calc=getSosCalendarWeek(String(snapshot.sosWeekStart));
    return {...calc,key:String(snapshot.sosWeekKey||calc.key)};
  }
  return getSosCalendarWeek(createdAt||new Date());
}
export function snapshotWithWeek(snapshot:any,week:SosCalendarWeek){
  return {...(snapshot??{}),sosWeek:week,sosWeekKey:week.key,sosWeekStart:week.start,sosWeekEnd:week.end,sosWeekLabel:week.label,sosWeekDateLabel:week.dateLabel};
}
export function sosStageLabel(session:any){
  if(String(session?.phase)==="DIAGNOSIS")return `진단 ${Number(session?.round_no??session?.roundNo??1)}차`;
  if(String(session?.cycle_kind??session?.cycleKind)==="HOMEWORK")return "AI 유사문항 3제 굳히기";
  if(Number(session?.round_no??session?.roundNo)===2)return "2차 AI 유사훈련";
  return "1차 맞춤훈련";
}
