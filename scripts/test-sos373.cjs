const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const path = require('node:path');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const module = {exports:{}};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,require:(id)=>load(path.resolve(path.dirname(file),id+'.ts'))});
  cache.set(file,module.exports); return module.exports;
}
const {nextExamSequence,priorLearningPassed,bookingExam}=load('src/lib/exam-flow.ts');
const rows=[{scope_code:'FULL',formal_sequence:1,status:'submitted'},
  {scope_code:'FULL',formal_sequence:9,status:'submitted',is_practice:true},
  {scope_code:'ALGEBRA',formal_sequence:2,status:'in_progress'}];
assert.equal(nextExamSequence(rows,'FULL'),2);
assert.equal(nextExamSequence(rows,'ALGEBRA'),1);
assert.equal(nextExamSequence(rows,'ALGEBRA_CALC1'),1);
assert.equal(nextExamSequence([...rows,rows[0]],'FULL'),2);
const past={id:'old',cycle_id:'one',booking_status:'COMPLETED'};
assert.equal(priorLearningPassed([past],[],{id:'new',scope_code:'ALGEBRA'}),false);
assert.equal(priorLearningPassed([past],[{target_snapshot:{learningCycleId:'one'},status:'COMPLETED',decision:'HOMEWORK_DONE'}],{id:'new'}),true);
assert.equal(priorLearningPassed([past],[],{id:'new',sos_gate_status:'OVERRIDE'}),true);
assert.equal(priorLearningPassed([{...past,is_practice:true}],[],{id:'new'}),true);
const original={open_at:'old',close_at:'old-end',paused_at:'old-pause'};
assert.equal(bookingExam(original,{cycle_student_id:'next',scheduled_at:'new'}).close_at,null);
assert.equal(bookingExam(original,{cycle_student_id:'next',clock_initialized:true,clock_close_at:'own-end'}).close_at,'own-end');
assert.equal(original.close_at,'old-end');
console.log('SOS373: 11 assertions passed');
