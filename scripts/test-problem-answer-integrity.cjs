const fs = require('fs'), ts = require('typescript'), vm = require('vm'), assert = require('node:assert/strict');
const ctx = {exports: {}};
vm.createContext(ctx);
vm.runInContext(ts.transpile(fs.readFileSync('src/lib/problem-answer-integrity.ts', 'utf8'), {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}), ctx);
const {normalizeProblemAnswer: normalize, problemAnswerIssues: issues} = ctx.exports;
for (const answer of ['315', '20', '91', '12', '61', '-12']) {
  assert.equal(normalize(answer, 'objective'), answer);
  assert.ok(issues(answer, 'objective', answer).length);
}
assert.equal(normalize('② 768', 'objective'), '2');
assert.equal(normalize('③', 'objective'), '3');
assert.equal(normalize('정답: 315', 'short_answer'), '315');
assert.ok(issues('3', 'objective', '315', '315').length);
assert.ok(issues('4', 'short_answer', '4', '16').length);
assert.ok(issues('2', 'objective', '2', '768').length);
assert.equal(issues('2', 'objective', '2', '② 768').length, 0);
assert.equal(issues('61', 'short_answer', '61', '61').length, 0);
assert.equal(issues('3', 'multiple_choice', '③', '③').length, 0);
// Every registration path must use the shared gate before expensive calls/writes.
const bank = fs.readFileSync('src/lib/problem-bank.ts', 'utf8');
assert.ok(bank.indexOf('const issues = problemAnswerIssues') < bank.indexOf('const existingQuery ='));
const analysis = fs.readFileSync('src/app/api/analysis/questions/[id]/analyze/route.ts', 'utf8');
assert.ok(analysis.includes('answerIssues.length === 0 &&'));
assert.ok(analysis.includes('...answerIssues,'));
console.log('PASS: preserve numeric values, validate explicit choice labels, reject answer conflicts at analysis and registration');
