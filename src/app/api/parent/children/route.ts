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
 if(action==="link"){
   // 기존 학생은 이름+학생 휴대폰을 모두 맞춰야 연결 가능. 다른 학부모가 이미 연결된 학생은 임의 이전 금지.
   const found=await ctx.supabase.from("students").select("id,name,parent_phone,phone,phone_last8").eq("name",name).or(`phone.eq.${phone},phone_last8.eq.${phone.slice(-8)}`).limit(2);
   if(found.error)return NextResponse.json({message:found.error.message},{status:400});
   if((found.data??[]).length!==1)return NextResponse.json({message:(found.data??[]).length?"같은 정보의 학생이 여러 명입니다. 관리자에게 연결을 요청해 주세요.":"일치하는 기존 학생을 찾지 못했습니다."},{status:404});
   const student=found.data![0];const oldParent=digits(student.parent_phone);
   if(oldParent&&oldParent!==ctx.phone)return NextResponse.json({message:"이미 다른 학부모 계정에 연결된 학생입니다. 관리자에게 확인해 주세요."},{status:409});
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
