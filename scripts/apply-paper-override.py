from pathlib import Path

def patch(path, old, new):
    p=Path(path); text=p.read_text()
    if text.count(old)!=1:
        raise RuntimeError(f'{path}: expected one patch site, got {text.count(old)} for {old[:100]}')
    p.write_text(text.replace(old,new))

p='src/app/admin/WeeklyAssignments.tsx'
patch(p,'import { SOS_DEFAULT_START_LABEL } from "@/lib/sos-schedule";', 'import { SOS_DEFAULT_START_LABEL } from "@/lib/sos-schedule";\nimport ManualPaperChange from "./ManualPaperChange";')
patch(p,'}).filter((item:any)=>data.catalog.some((c:any)=>c.formal_sequence===item.formalSequence&&c.scope_code===item.scopeCode));', '}).filter((item:any)=>{const row=data.rows.find((r:any)=>r.id===item.membershipId);return row?.default_by_scope?Boolean(row.default_by_scope[item.scopeCode]):data.catalog.some((c:any)=>c.formal_sequence===item.formalSequence&&c.scope_code===item.scopeCode);});')
patch(p,'const entry=data.catalog.find((c:any)=>c.formal_sequence===d.n&&c.scope_code===d.s);const target=', 'const entry=row.default_by_scope?row.default_by_scope[d.s]:data.catalog.find((c:any)=>c.formal_sequence===d.n&&c.scope_code===d.s);const target=')
patch(p,'{row.registration?title(row.registration.formal_sequence,row.registration.scope_code):row.past?', '{row.registration?(row.exam?.exam_code??row.exam?.title??"배정 시험지"):row.past?')
patch(p,'row.registration?"배정 변경":"시험지 배정"', 'row.registration?"기본값으로 배정":"기본 시험지 배정"')
patch(p,'}</button></td></tr>})}</tbody>', '}</button><ManualPaperChange row={row} catalog={data.catalog} exams={data.exams} busy={!!busy} onSaved={load}/></td></tr>})}</tbody>')
patch(p,'aria-label={`${student?.name} 시험순번`} type="number" min={1} value={d.n} disabled={row.locked||!!busy}', 'aria-label={`${student?.name} 개인 응시 순번`} type="number" min={1} value={d.n} disabled={true}')
patch(p,'미배정 학생을 선택된 시험순번·범위로 한 번에 배정합니다. 시험지가 없는 학생과 기존 배정은 제외합니다.', '미배정 학생은 기본 추천으로 배정하고, 이미 배정한 시험지는 유지합니다. 특정 학생은 아래 시험지 직접 변경에서 다른 시험지를 선택하세요.')

p='src/app/api/admin/exam-catalog/route.ts'
patch(p,'import { nextExamSequence, priorLearningPassed } from "@/lib/exam-flow";', 'import { nextExamSequence, priorLearningPassed } from "@/lib/exam-flow";\nimport { defaultPaper } from "@/lib/exam-assignment";')
patch(p,'return {...m,next_by_scope:nextByScope,completed_sequence:completed,', 'const defaultByScope=Object.fromEntries(SOS_SCOPE_CODES.map(code=>[code,defaultPaper(catalog.data??[],(attempts.data??[]).filter(a=>a.student_id===m.student_id),nextByScope[code],code)??null]));\n          return {...m,default_by_scope:defaultByScope,next_by_scope:nextByScope,completed_sequence:completed,')

p='src/app/api/admin/exam-slots/route.ts'
patch(p,'item.exam_id === registration?.exam_id && Number(item.formal_sequence) === formalSequence &&', 'item.exam_id === registration?.exam_id &&')

p='src/app/api/student/portal/route.ts'
text=Path(p).read_text();Path(p).write_text('import { exactPaperBooking, bookedSequence } from "@/lib/exam-assignment";\n'+text)
patch(p,'const sequence=nextExamSequence(canonicalAttempts, scope);', 'const sequence=bookedSequence(registrations??[],membership,nextExamSequence(canonicalAttempts, scope));')
patch(p,'''    const resolvedSequence = resolvedSequenceByMembership.get(String(membership.id)) ?? Number(membership.formal_sequence ?? 0);
    const link = memberExamLinks.find((row: any) =>
      String(row.cycle_id) === String(cycle.id) &&
      Number(row.formal_sequence) === Number(resolvedSequence) &&
      String(row.scope_code ?? "FULL") === String(membership.scope_code ?? "FULL"));
    const examId = link ? String(link.exam_id) : null;''', '''    const directBooking = exactPaperBooking(registrations ?? [], membership);
    const resolvedSequence = bookedSequence(registrations ?? [], membership,
      resolvedSequenceByMembership.get(String(membership.id)) ?? Number(membership.formal_sequence ?? 0));
    const link = memberExamLinks.find((row: any) =>
      String(row.cycle_id) === String(cycle.id) &&
      (directBooking ? String(row.exam_id) === String(directBooking.exam_id) : Number(row.formal_sequence) === Number(resolvedSequence)) &&
      String(row.scope_code ?? "FULL") === String(membership.scope_code ?? "FULL"));
    const examId = directBooking ? String(directBooking.exam_id) : link ? String(link.exam_id) : null;''')

p='src/app/api/parent/portal/route.ts'
text=Path(p).read_text();Path(p).write_text('import { bookedSequence } from "@/lib/exam-assignment";\n'+text)
patch(p,'const formalSequence=nextExamSequence(attempts.filter((a:any)=>String(a.student_id)===String(child.id)),scope);', 'const formalSequence=bookedSequence(registrations,schedule,nextExamSequence(attempts.filter((a:any)=>String(a.student_id)===String(child.id)),scope));')
print('Integrated admin picker, default selection, exact student/parent schedule resolution and timer links.')
