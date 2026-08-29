"use client";

import { useEffect, useMemo, useState } from "react";
import AdminPortalShell from "@/components/admin-portal-sidebar";
import { difficultyLabel } from "@/lib/difficulty-scale";
import { meterLabel, meterStage } from "@/lib/difficulty-meter";
import MATHPOOHLoader from "../../../components/math-pooh-loader";

type StudentMeterRow={
  student_id:string;
  subject:string;
  major_unit:string;
  subunit:string;
  subunit_key:string;
  difficulty_meter:number;
  sample_count:number;
  updated_at:string;
  student?:{id:string;name:string;school:string;grade:string;status:string}|null;
};

type ProblemRow={
  id:string;
  problem_code:string;
  title:string;
  question_no:number;
  subject:string;
  unit:string;
  topic:string;
  difficulty:string|number;
  difficulty_meter:number;
  difficulty_meter_samples:number;
  difficulty_meter_unique_students:number;
  difficulty_meter_origin:string;
};

export default function BarometerPage(){
  const [tab,setTab]=useState<"students"|"problems">("students");
  const [studentRows,setStudentRows]=useState<StudentMeterRow[]>([]);
  const [problemRows,setProblemRows]=useState<ProblemRow[]>([]);
  const [summary,setSummary]=useState<any>({});
  const [keyword,setKeyword]=useState("");
  const [subject,setSubject]=useState("전체");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  async function load(){
    setLoading(true);setError("");
    try{
      const response=await fetch("/api/admin/difficulty-barometers",{cache:"no-store"});
      const data=await response.json();
      if(!response.ok||data?.success!==true)throw new Error(data?.message||"바로미터를 불러오지 못했습니다.");
      setStudentRows(data.studentMeters??[]);
      setProblemRows(data.problems??[]);
      setSummary(data.summary??{});
    }catch(e){setError(e instanceof Error?e.message:"바로미터 조회 실패");}
    finally{setLoading(false);}
  }

  useEffect(()=>{void load();},[]);

  const subjects=useMemo(()=>{
    const values=new Set<string>();
    for(const row of studentRows) if(row.subject) values.add(row.subject);
    for(const row of problemRows) if(row.subject) values.add(row.subject);
    return ["전체",...Array.from(values).sort((a,b)=>a.localeCompare(b,"ko"))];
  },[studentRows,problemRows]);

  const filteredStudents=useMemo(()=>studentRows.filter((row:StudentMeterRow)=>{
    const text=`${row.student?.name??""} ${row.student?.school??""} ${row.student?.grade??""} ${row.subject} ${row.major_unit} ${row.subunit}`.toLowerCase();
    return (!keyword||text.includes(keyword.toLowerCase()))&&(subject==="전체"||row.subject===subject);
  }),[studentRows,keyword,subject]);

  const filteredProblems=useMemo(()=>problemRows.filter((row:ProblemRow)=>{
    const text=`${row.problem_code} ${row.title} ${row.subject} ${row.unit} ${row.topic}`.toLowerCase();
    return (!keyword||text.includes(keyword.toLowerCase()))&&(subject==="전체"||row.subject===subject);
  }),[problemRows,keyword,subject]);

  const fmt=(v:any)=>Number(v??0).toFixed(2);
  const delta=(row:ProblemRow)=>Number(row.difficulty_meter??row.difficulty)-Number(row.difficulty??0);

  return <AdminPortalShell current="sos-difficulty">
    <main className="page">
      <section className="header">
        <div>
          <span>MATHPOOH SOS · DIFFICULTY BAROMETER</span>
          <h1>난이도 바로미터 검증</h1>
          <p>학생은 소단원별 미터, 문항은 DNA 최초 난이도와 현재 실측 미터를 비교합니다.</p>
        </div>
        <div className="actions">
          <button onClick={()=>location.href="/problem-bank/difficulty"}>← 난이도 관리</button>
          <button onClick={()=>void load()}>새로고침</button>
        </div>
      </section>

      {error?<div className="error">{error}</div>:null}

      <section className="kpis">
        <div><small>학생 소단원 미터</small><b>{summary.studentMeterRows??0}</b><span>생성된 바로미터</span></div>
        <div><small>전체 문항</small><b>{summary.problems??0}</b><span>동적 난이도 대상</span></div>
        <div><small>실측 반영 문항</small><b>{summary.empiricalProblems??0}</b><span>서로 다른 학생 20명+</span></div>
        <div><small>DNA 고정 문항</small><b>{summary.waitingProblems??0}</b><span>20명 미만</span></div>
      </section>

      <section className="toolbar">
        <div className="tabs">
          <button className={tab==="students"?"active":""} onClick={()=>setTab("students")}>학생별 바로미터</button>
          <button className={tab==="problems"?"active":""} onClick={()=>setTab("problems")}>문항별 바로미터</button>
        </div>
        <input value={keyword} onChange={(e:any)=>setKeyword(e.target.value)} placeholder={tab==="students"?"학생·학교·소단원 검색":"문항·단원·유형 검색"}/>
        <select value={subject} onChange={(e:any)=>setSubject(e.target.value)}>{subjects.map((s:string)=><option key={s}>{s}</option>)}</select>
      </section>

      {loading?<MATHPOOHLoader title="바로미터 데이터 불러오는 중" detail="학생별·문항별 바로미터와 최신 분석 결과를 준비하고 있습니다." kind="report" audience="admin"/>:tab==="students"?(
        <section className="table">
          <div className="row head student">
            <span>학생</span><span>과목</span><span>대단원</span><span>소단원</span><span>현재 미터</span><span>단계</span><span>표본</span>
          </div>
          {filteredStudents.length?filteredStudents.map((row:StudentMeterRow)=><div className="row student" key={`${row.student_id}:${row.subunit_key}`}>
            <span><b>{row.student?.name??"학생정보없음"}</b><small>{row.student?.school??"-"} · {row.student?.grade??"-"}</small></span>
            <span>{row.subject||"-"}</span>
            <span>{row.major_unit||"-"}</span>
            <span><b>{row.subunit}</b><small>{row.subunit_key}</small></span>
            <span className="meter"><i><em style={{width:`${Math.max(0,Math.min(100,(Number(row.difficulty_meter)-1)/7*100))}%`}}/></i><b>{fmt(row.difficulty_meter)}</b></span>
            <span className={`badge l${meterStage(row.difficulty_meter)}`}>{meterLabel(row.difficulty_meter)}</span>
            <span><b>{row.sample_count}</b><small>문항 응답</small></span>
          </div>):<div className="empty">아직 생성된 학생 소단원 바로미터가 없습니다. 실제 진단/훈련 결과가 들어오면 생성됩니다.</div>}
        </section>
      ):(
        <section className="table">
          <div className="row head problem">
            <span>문항</span><span>과목·소단원</span><span>DNA 최초</span><span>현재 미터</span><span>현재 단계</span><span>실측 학생</span><span>상태</span><span>변화</span>
          </div>
          {filteredProblems.length?filteredProblems.map((row:ProblemRow)=>{
            const empirical=Number(row.difficulty_meter_unique_students??0)>=20;
            const d=delta(row);
            return <div className="row problem" key={row.id}>
              <span><b>{row.problem_code}</b><small>{row.title||`${row.question_no}번`}</small></span>
              <span><b>{row.subject||"-"} · {row.unit||"-"}</b><small>{row.topic||"-"}</small></span>
              <span><b>{difficultyLabel(row.difficulty)}</b><small>{Number(row.difficulty).toFixed(2)}</small></span>
              <span className="meter"><i><em style={{width:`${Math.max(0,Math.min(100,(Number(row.difficulty_meter)-1)/7*100))}%`}}/></i><b>{fmt(row.difficulty_meter)}</b></span>
              <span className={`badge l${meterStage(row.difficulty_meter)}`}>{meterLabel(row.difficulty_meter)}</span>
              <span><b>{row.difficulty_meter_unique_students??0}명</b><small>총 응답 {row.difficulty_meter_samples??0}</small></span>
              <span className={empirical?"status empirical":"status dna"}>{empirical?"실측 반영":"DNA 고정"}<small>{empirical?"20명 이상":"20명 미만"}</small></span>
              <span className={d>0?"delta up":d<0?"delta down":"delta"}>{d>0?"+":""}{d.toFixed(2)}</span>
            </div>
          }):<div className="empty">검색 결과가 없습니다.</div>}
        </section>
      )}

      <section className="guide">
        <b>검증 기준</b>
        <span>학생별: 같은 학생이라도 소단원마다 별도 1.00~8.00 미터를 가집니다.</span>
        <span>문항별: 서로 다른 학생 20명 전에는 DNA 고정, 20명부터 실측 결과가 현재 미터에 반영됩니다.</span>
        <span>현재 미터가 4.50 이상이면 화면 단계는 쉬4에서 적4로 넘어갑니다.</span>
      </section>

      <style jsx>{`
        .page{min-height:100vh;background:#f5f7f6;padding:28px;overflow:auto;color:#17211b}
        .header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}
        .header span{font-size:12px;font-weight:900;letter-spacing:1.3px;color:#257247}.header h1{margin:5px 0 7px;font-size:30px}.header p{margin:0;color:#667085;font-weight:650}
        .actions{display:flex;gap:8px}.actions button,.toolbar button{border:1px solid #d0d5dd;background:#fff;border-radius:10px;padding:10px 14px;font-weight:850;cursor:pointer}
        .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.kpis div{background:#fff;border:1px solid #e3e8e5;border-radius:14px;padding:16px}.kpis small,.kpis span{display:block;color:#667085}.kpis b{display:block;font-size:28px;margin:5px 0}
        .toolbar{display:flex;gap:10px;align-items:center;background:#fff;border:1px solid #e3e8e5;border-radius:14px;padding:12px;margin-bottom:12px}.tabs{display:flex;gap:6px}.tabs .active{background:#216e45;color:#fff;border-color:#216e45}.toolbar input{flex:1;min-width:220px}.toolbar input,.toolbar select{border:1px solid #d0d5dd;border-radius:9px;padding:10px 12px;background:#fff}
        .table{background:#fff;border:1px solid #e3e8e5;border-radius:14px;overflow:auto}.row{display:grid;align-items:center;border-bottom:1px solid #eef1ef;min-width:1100px}.row.student{grid-template-columns:1.05fr .8fr 1fr 1.35fr 1.5fr .7fr .65fr}.row.problem{grid-template-columns:1.3fr 1.4fr .75fr 1.35fr .7fr .8fr .8fr .6fr}.row>span{padding:12px 10px;min-width:0}.row b,.row small{display:block}.row small{font-size:11px;color:#7a8580;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.head{background:#f8faf9;position:sticky;top:0;z-index:1;font-size:12px;font-weight:900;color:#59645e}
        .meter{display:grid!important;grid-template-columns:1fr auto;gap:8px;align-items:center}.meter i{height:8px;background:#e8eeea;border-radius:999px;overflow:hidden}.meter em{display:block;height:100%;background:#268a54;border-radius:999px}.meter b{font-size:15px}
        .badge{display:inline-block!important;width:max-content;border-radius:999px;padding:6px 9px!important;font-weight:900;background:#eef4ef;color:#27543a}.status{font-weight:900}.status small{font-weight:600}.empirical{color:#167445}.dna{color:#946200}.delta{font-weight:900;text-align:center}.up{color:#b54708}.down{color:#175cd3}
        .empty{padding:34px;text-align:center;color:#667085}.error{padding:12px 14px;background:#fff0f0;border:1px solid #f5b7b7;color:#a61b1b;border-radius:12px;margin-bottom:12px}
        .guide{display:flex;gap:12px;flex-wrap:wrap;margin-top:14px;padding:14px 16px;background:#eef7f1;border:1px solid #cfe5d7;border-radius:12px;font-size:12px}.guide b{color:#216e45}.guide span{color:#526159}
        @media(max-width:900px){.kpis{grid-template-columns:1fr 1fr}.header,.toolbar{flex-direction:column}.toolbar{align-items:stretch}}
      `}</style>
    </main>
  </AdminPortalShell>;
}