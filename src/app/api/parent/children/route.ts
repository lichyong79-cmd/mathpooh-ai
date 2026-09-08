import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {getSessionUser} from "@/lib/supabase/auth";
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");
async function parent(){const user=await getSessionUser();if(!user||String(user.user_metadata?.role)!=="parent")return null;return {user,phone:digits(user.user_metadata?.parent_phone??String(user.email??"").split("@")[0]),supabase:createClient()};}

export async function POST(request:Request){
 const ctx=await parent();if(!ctx)return NextResponse.json({message:"학부모 로그인이 필요합니다."},{status:403});
 const body=await request.json();const action=String(body.action??"");
 const name=String(body.name??"").trim(),phone=digits(body.phone);
 if(!name||phone.length<10)return NextResponse.json({message:"학생 이름과 휴대폰번호를 정확히 입력해 주세요."},{status:400});

 // SOS327: 학부모가 자기 번호를 자녀 번호 칸에 넣는 실수가 흔하다.
 // 그대로 두면 학생·학부모 계정의 초기 비밀번호까지 같아진다.
 // 막지는 않되(형제자매·특수 사정 가능) 확인을 한 번 받는다.
 if(phone===ctx.phone&&body.confirmSamePhone!==true)
   return NextResponse.json({
     message:"입력하신 번호가 학부모님 번호와 같습니다. 자녀의 휴대폰번호가 맞는지 확인해 주세요.",
     needsConfirm:"samePhone",
   },{status:409});
 if(action==="link"){
   // SOS326: 예전에는 이름을 완전히 일치시켜야만 찾았다(.eq("name",name)).
   // 저장된 이름에 공백이 섞이거나 학부모가 한 글자만 다르게 입력해도
   // "일치하는 기존 학생을 찾지 못했습니다"가 떠서, 자녀를 알고 있는데도 연결이 막혔다.
   // 특히 학부모가 탈퇴 후 재가입할 때 이 문제로 자녀를 되찾지 못했다.
   //
   // 이제 전화번호로 먼저 찾고 이름은 공백을 무시해 비교한다.
   // 전화번호는 학생마다 고유하므로 이것만으로도 특정이 된다.
   const norm=(v:unknown)=>String(v??"").replace(/\s+/g,"").toLowerCase();
   const found=await ctx.supabase.from("students")
     .select("id,name,parent_phone,phone,phone_last8,status")
     .or(`phone.eq.${phone},phone_last8.eq.${phone.slice(-8)}`).limit(5);
   if(found.error)return NextResponse.json({message:found.error.message},{status:400});

   const all=found.data??[];
   if(!all.length)
     return NextResponse.json({message:"해당 번호로 등록된 학생을 찾지 못했습니다. 번호를 확인하시거나 학원으로 문의해 주세요."},{status:404});

   const matched=all.filter((x:any)=>norm(x.name)===norm(name));
   if(!matched.length)
     return NextResponse.json({message:`해당 번호는 다른 학생(${String(all[0].name??"").slice(0,1)}○○)으로 등록되어 있습니다. 학생 이름을 확인해 주세요.`},{status:404});
   if(matched.length>1)
     return NextResponse.json({message:"같은 정보의 학생이 여러 명입니다. 학원으로 연결을 요청해 주세요."},{status:409});

   const student=matched[0];const oldParent=digits(student.parent_phone);
   if(oldParent&&oldParent!==ctx.phone)return NextResponse.json({message:"이미 다른 학부모 계정에 연결된 학생입니다. 학원으로 문의해 주세요."},{status:409});
   const saved=await ctx.supabase.from("students").update({parent_phone:ctx.phone}).eq("id",student.id).select("id,name,school,grade,phone").single();
   return saved.error?NextResponse.json({message:saved.error.message},{status:400}):NextResponse.json({success:true,student:saved.data});
 }
 if(action!=="create")return NextResponse.json({message:"지원하지 않는 요청입니다."},{status:400});
 const school=String(body.school??"").trim(),grade=String(body.grade??"").trim(),password=String(body.password??"");
 if(!school||!grade)return NextResponse.json({message:"학교와 학년을 입력해 주세요."},{status:400});
 if(password.length<6)return NextResponse.json({message:"학생 비밀번호는 6자리 이상으로 정해 주세요."},{status:400});
 const dup=await ctx.supabase.from("students").select("id").or(`phone.eq.${phone},phone_last8.eq.${phone.slice(-8)}`).limit(1);
 if(dup.error)return NextResponse.json({message:dup.error.message},{status:400});
 if((dup.data??[]).length)return NextResponse.json({message:"이미 등록된 학생 전화번호입니다. 신규 생성 대신 ‘기존 자녀 연결’을 이용해 주세요."},{status:409});
 const inserted=await ctx.supabase.from("students").insert({name,school,grade,phone,phone_last8:phone.slice(-8),parent_phone:ctx.phone,status:"정상",active:true,joined_at:new Date().toISOString().slice(0,10)}).select().single();
 if(inserted.error||!inserted.data)return NextResponse.json({message:inserted.error?.message||"학생 정보를 만들지 못했습니다."},{status:400});
 const auth=await ctx.supabase.auth.admin.createUser({email:`${phone}@student.matspu.local`,password,email_confirm:true,user_metadata:{role:"student",student_id:inserted.data.id,name}});
 if(auth.error||!auth.data.user){await ctx.supabase.from("students").delete().eq("id",inserted.data.id);return NextResponse.json({message:auth.error?.message||"학생 로그인 계정을 만들지 못했습니다."},{status:400});}
 const linked=await ctx.supabase.from("students").update({auth_user_id:auth.data.user.id,password_changed:true,password_reset_at:new Date().toISOString()}).eq("id",inserted.data.id).select("id,name,school,grade,phone").single();
 if(linked.error){await ctx.supabase.auth.admin.deleteUser(auth.data.user.id);await ctx.supabase.from("students").delete().eq("id",inserted.data.id);return NextResponse.json({message:`학생 계정 연결 실패: ${linked.error.message}`},{status:400});}
 return NextResponse.json({success:true,student:linked.data});
}
