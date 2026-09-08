"use client";
import {useState,type FormEvent} from "react";
import "../login/login.css";

export default function ParentSignupPage(){
 const [name,setName]=useState(""),[phone,setPhone]=useState(""),[pw,setPw]=useState(""),[pw2,setPw2]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 // SOS323: 개인정보 보호법 제15조·제22조에 따라 수집·이용 동의를 별도로 받아야 합니다.
 // 약관 동의와 개인정보 동의는 묶어서 받을 수 없고, 항목별로 구분해 표시해야 합니다.
 const [agreeTerms,setAgreeTerms]=useState(false);
 const [agreePrivacy,setAgreePrivacy]=useState(false);
 const [agreeOverseas,setAgreeOverseas]=useState(false);
 const allAgreed=agreeTerms&&agreePrivacy&&agreeOverseas;
 const submit=async(e:FormEvent)=>{e.preventDefault();setError("");if(pw!==pw2)return setError("비밀번호가 서로 다릅니다.");if(!allAgreed)return setError("필수 항목에 모두 동의해 주세요.");setBusy(true);try{const r=await fetch("/api/parent/signup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,phone,password:pw,consent:{terms:agreeTerms,privacy:agreePrivacy,overseas:agreeOverseas,agreedAt:new Date().toISOString()}})});const j=await r.json();if(!r.ok)throw new Error(j.message);location.href="/parent-login?joined=1";}catch(e){setError(e instanceof Error?e.message:"가입하지 못했습니다.");}finally{setBusy(false)}};
 return <main className="mp-login-page"><header className="mp-login-header"><div><img src="/mathpooh-logo.png" alt=""/><strong>MATHPOOH</strong></div></header><section className="mp-login-wrap"><form onSubmit={submit} className="mp-login-card"><img className="mp-card-logo" src="/mathpooh-logo.png" alt="MATHPOOH"/><div className="mp-login-heading"><h2>학부모 신규가입</h2><p>학부모 계정을 먼저 만든 뒤 자녀를 등록하고 SOS를 신청합니다.</p></div><label className="mp-login-field"><span>학부모 성함</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="성함" autoFocus/></label><label className="mp-login-field"><span>학부모 휴대폰번호</span><input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="01012345678"/></label><label className="mp-login-field"><span>비밀번호</span><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="6자리 이상"/></label><label className="mp-login-field"><span>비밀번호 확인</span><input type="password" value={pw2} onChange={e=>setPw2(e.target.value)} placeholder="한 번 더 입력"/></label><div className="mp-consent">
  <label><input type="checkbox" checked={agreeTerms} onChange={e=>setAgreeTerms(e.target.checked)}/><span>[필수] <a href="/terms" target="_blank" rel="noreferrer">이용약관</a>에 동의합니다.</span></label>
  <label><input type="checkbox" checked={agreePrivacy} onChange={e=>setAgreePrivacy(e.target.checked)}/><span>[필수] <a href="/privacy" target="_blank" rel="noreferrer">개인정보 수집·이용</a>에 동의합니다.</span></label>
  <p className="mp-consent-detail">수집 항목 : 학부모 성명·휴대전화번호, 자녀 성명·휴대전화번호·학교·학년, 학습 기록<br/>이용 목적 : 학습 진단·처방 제공 및 학원 수업 운영<br/>보유 기간 : 수강 종료 후 1년 (학습 기록 3년)</p>
  <label><input type="checkbox" checked={agreeOverseas} onChange={e=>setAgreeOverseas(e.target.checked)}/><span>[필수] 개인정보의 <a href="/privacy" target="_blank" rel="noreferrer">국외 이전</a>에 동의합니다.</span></label>
  <p className="mp-consent-detail">AI 학습 분석을 위해 답안·풀이사진이 미국(OpenAI)으로 전송됩니다. 동의를 거부할 수 있으나 서비스 이용이 제한됩니다.</p>
  <label className="all"><input type="checkbox" checked={allAgreed} onChange={e=>{const v=e.target.checked;setAgreeTerms(v);setAgreePrivacy(v);setAgreeOverseas(v);}}/><span><b>위 필수 항목에 모두 동의합니다.</b></span></label>
</div>
{error?<div className="mp-login-error">{error}</div>:null}<button type="submit" disabled={busy||!allAgreed} className="mp-login-submit">{busy?"가입 처리 중":"학부모 계정 만들기 →"}</button><p className="mp-login-help">가입 후 학부모 페이지에서 기존 자녀 연결 또는 새 자녀 계정 만들기를 할 수 있습니다.</p><a className="mp-admin-login-link back" href="/parent-login">← 학부모 로그인</a></form><p className="mp-login-copyright">© 2026 MATHPOOH</p>
 <style>{`
  .mp-consent{display:flex;flex-direction:column;gap:7px;margin:4px 0 2px;padding:14px;background:#f7faf8;border:1px solid #dde7e1;border-radius:11px}
  .mp-consent label{display:flex;align-items:flex-start;gap:8px;font-size:13px;color:#3d4a43;line-height:1.55;cursor:pointer}
  .mp-consent input{margin-top:2px;width:16px;height:16px;flex:none;accent-color:#2f6937}
  .mp-consent a{color:#2f6937;font-weight:800}
  .mp-consent-detail{margin:-2px 0 6px 24px;font-size:11.5px;color:#7b877f;line-height:1.65}
  .mp-consent .all{margin-top:6px;padding-top:9px;border-top:1px solid #e2ebe5}
 `}</style></section></main>;
}
