export type TrainingDraft = {itemIds:string[]; answers:Record<string,string>; seconds:Record<string,number>; index:number; updatedAt:number};
const key=(id:string)=>`sos-training-draft-v1:${id}`;
export function readTrainingDraft(id:string,itemIds:string[]):TrainingDraft|null{
  try{
    const d=JSON.parse(window.sessionStorage.getItem(key(id))||"null");
    if(!d||JSON.stringify(d.itemIds)!==JSON.stringify(itemIds)||!Number.isFinite(d.updatedAt)||Date.now()-d.updatedAt>7*86400000)return null;
    if(!Number.isInteger(d.index)||d.index<0||d.index>=itemIds.length)return null;
    const answers:Record<string,string>={},seconds:Record<string,number>={};
    for(const item of itemIds){
      if(typeof d.answers?.[item]==="string")answers[item]=d.answers[item];
      if(Number.isFinite(d.seconds?.[item]))seconds[item]=Math.max(0,d.seconds[item]);
    }
    return {...d,answers,seconds};
  }catch{return null;}
}
export function writeTrainingDraft(id:string,draft:TrainingDraft){
  try{window.sessionStorage.setItem(key(id),JSON.stringify(draft));}catch{/* 서버 저장은 계속 사용한다. */}
}
export function clearTrainingDraft(id:string){try{window.sessionStorage.removeItem(key(id));}catch{}}
