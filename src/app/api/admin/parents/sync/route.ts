import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {getAdminUser} from "@/lib/supabase/auth";
import {ensureParentAccount} from "@/lib/parent-account";

export async function POST(){
  if(!await getAdminUser())return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
  const supabase=createClient();
  const rows=await supabase.from("students").select("parent_phone").neq("parent_phone","");
  if(rows.error)return NextResponse.json({message:rows.error.message},{status:400});
  const phones=[...new Set((rows.data??[]).map((x:any)=>String(x.parent_phone??"").replace(/\D/g,"")).filter((x:string)=>x.length>=10))];
  const knownUsers=new Map<string,any>();
  for(let page=1;page<=10;page++){
    const listed=await supabase.auth.admin.listUsers({page,perPage:1000});
    if(listed.error)return NextResponse.json({message:listed.error.message},{status:400});
    for(const user of listed.data?.users??[])knownUsers.set(String(user.email??"").toLowerCase(),user);
    if((listed.data?.users??[]).length<1000)break;
  }
  const results=[] as any[];
  for(let start=0;start<phones.length;start+=4){
    const part=await Promise.all(phones.slice(start,start+4).map(async phone=>{
      try{return await ensureParentAccount(supabase,phone,knownUsers);}
      catch(error){return {phone,error:error instanceof Error?error.message:"계정 생성 실패"};}
    }));
    results.push(...part);
  }
  const failed=results.filter(x=>x.error);
  return NextResponse.json({success:failed.length===0,total:phones.length,created:results.filter(x=>x.created).length,linked:results.filter(x=>x.created===false).length,failed:failed.length,errors:failed.slice(0,10)});
}
