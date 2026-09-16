// No answers, account identifiers, or free-form browser errors are sent.
export function reportSosClientEvent(sessionId:string,event:string,detail:{question?:number;status?:number;restored?:boolean}={}){
  void fetch('/api/student/sos-training',{
    method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,
    body:JSON.stringify({action:'client_diagnostic',sessionId,event,version:'training-resume-20260916',...detail}),
  }).catch(()=>{});
}
