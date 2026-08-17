export type LearningCycleRef={id:string;name:string;startDate:string;endDate:string;dateLabel:string};
const dateText=(v:string)=>{const d=new Date(`${v}T00:00:00`);return Number.isFinite(d.getTime())?`${d.getMonth()+1}/${d.getDate()}`:v;};
export function cycleDateLabel(startDate:string,endDate:string){return startDate&&endDate?`${dateText(startDate)} ~ ${dateText(endDate)}`:"기간 미지정";}
export function cycleFromSnapshot(snapshot:any):LearningCycleRef|null{
 const id=String(snapshot?.learningCycleId??snapshot?.cycleId??"").trim();
 if(!id)return null;
 const name=String(snapshot?.learningCycleName??snapshot?.cycleName??"회차").trim()||"회차";
 const startDate=String(snapshot?.learningCycleStart??snapshot?.cycleStart??"");
 const endDate=String(snapshot?.learningCycleEnd??snapshot?.cycleEnd??"");
 return {id,name,startDate,endDate,dateLabel:cycleDateLabel(startDate,endDate)};
}
export function snapshotWithCycle(snapshot:any,cycle:any){
 const startDate=String(cycle?.start_date??cycle?.startDate??"");const endDate=String(cycle?.end_date??cycle?.endDate??"");
 const next={...(snapshot??{}),learningCycleId:String(cycle?.id??""),learningCycleName:String(cycle?.name??"회차"),learningCycleStart:startDate,learningCycleEnd:endDate,learningCycleDateLabel:cycleDateLabel(startDate,endDate)};
 delete next.sosWeek;delete next.sosWeekKey;delete next.sosWeekStart;delete next.sosWeekEnd;delete next.sosWeekLabel;delete next.sosWeekDateLabel;
 return next;
}
export function cycleLabel(snapshot:any){const c=cycleFromSnapshot(snapshot);return c?`${c.name} · ${c.dateLabel}`:"회차 미지정";}
