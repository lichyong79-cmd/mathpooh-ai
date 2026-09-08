import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");

export async function POST(request:Request){
  const body=await request.json();
  const name=String(body.name??"").trim();
  const phone=digits(body.phone);
  const password=String(body.password??"");
  if(!name)return NextResponse.json({message:"학부모 성함을 입력해 주세요."},{status:400});
  if(!/^01\d{8,9}$/.test(phone))return NextResponse.json({message:"학부모 휴대폰번호를 정확히 입력해 주세요."},{status:400});
  if(password.length<6)return NextResponse.json({message:"비밀번호는 6자리 이상으로 정해 주세요."},{status:400});

  // SOS323: 개인정보 보호법 제15조·제22조·제28조의8에 따른 동의는
  // 받았다는 사실과 시점을 증빙할 수 있어야 한다. 계정에 함께 기록한다.
  const consent=body.consent??{};
  if(!(consent.terms===true&&consent.privacy===true&&consent.overseas===true))
    return NextResponse.json({message:"이용약관·개인정보 수집이용·국외이전에 모두 동의해야 가입할 수 있습니다."},{status:400});
  const consentRecord={
    terms:true,privacy:true,overseas:true,
    agreed_at:String(consent.agreedAt??new Date().toISOString()),
    policy_version:"2026-09-01",
    ip:request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"",
  };
  const supabase=createClient();
  const email=`${phone}@parent.matspu.local`;
  // 관리자 API로 생성하여 이메일 확인 절차 없이 전화번호형 계정을 만든다.
  const created=await supabase.auth.admin.createUser({
    email,password,email_confirm:true,
    user_metadata:{role:"parent",parent_phone:phone,name,password_changed:true,self_registered:true,consent:consentRecord},
  });
  if(created.error||!created.data.user){
    const duplicate=/already|registered|duplicate|exists/i.test(created.error?.message??"");
    return NextResponse.json({message:duplicate?"이미 가입된 학부모 전화번호입니다. 학부모 로그인으로 들어가 주세요.":created.error?.message||"학부모 계정을 만들지 못했습니다."},{status:duplicate?409:400});
  }
  return NextResponse.json({success:true,phone});
}
