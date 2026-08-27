const digits=(value:unknown)=>String(value??"").replace(/\D/g,"");

export async function ensureParentAccount(supabase:any,rawPhone:unknown,knownUsers?:Map<string,any>){
  const phone=digits(rawPhone);
  if(phone.length<10)return {skipped:true,phone,message:"학부모 전화번호 없음"};
  const email=`${phone}@parent.matspu.local`;
  let found:any=knownUsers?.get(email)??null;
  if(!knownUsers){
    let page=1;
    while(page<=10&&!found){
      const listed=await supabase.auth.admin.listUsers({page,perPage:1000});
      if(listed.error)throw listed.error;
      found=(listed.data?.users??[]).find((u:any)=>String(u.email??"").toLowerCase()===email);
      if((listed.data?.users??[]).length<1000)break;
      page+=1;
    }
  }
  if(found){
    const updated=await supabase.auth.admin.updateUserById(found.id,{email,email_confirm:true,user_metadata:{...found.user_metadata,role:"parent",parent_phone:phone}});
    if(updated.error)throw updated.error;
    return {created:false,phone,userId:found.id};
  }
  const created=await supabase.auth.admin.createUser({email,password:`Mp!${phone.slice(-4)}`,email_confirm:true,user_metadata:{role:"parent",parent_phone:phone}});
  if(created.error||!created.data.user)throw created.error??new Error("학부모 계정 생성 실패");
  knownUsers?.set(email,created.data.user);
  return {created:true,phone,userId:created.data.user.id,temporaryPassword:phone.slice(-4)};
}
