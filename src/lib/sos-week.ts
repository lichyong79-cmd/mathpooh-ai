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
function monthWeekOfMonday(start:Date){
  const first=new Date(start.getFullYear(),start.getMonth(),1);
  const firstMonday=startOfSosWeek(first);
  return Math.floor((start.getTime()-firstMonday.getTime())/(7*DAY))+1;
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
  const raw=snapshot?.sosWeek;
  if(raw?.start){const calc=getSosCalendarWeek(String(raw.start));return {...calc,...raw,key:String(raw.key||raw.start),start:String(raw.start),end:String(raw.end||calc.end)};}
  if(snapshot?.sosWeekStart){const calc=getSosCalendarWeek(String(snapshot.sosWeekStart));return {...calc,key:String(snapshot.sosWeekKey||calc.key),label:String(snapshot.sosWeekLabel||calc.label),dateLabel:String(snapshot.sosWeekDateLabel||calc.dateLabel)};}
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
