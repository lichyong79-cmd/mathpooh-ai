const assert = require('node:assert/strict');
const fs=require('node:fs'); const path=require('node:path'); const vm=require('node:vm'); const ts=require('typescript');
const cache=new Map(); let responses=[],requests=[];
function load(file){
 const abs=path.resolve(file); if(cache.has(abs))return cache.get(abs).exports;
 const mod={exports:{}};cache.set(abs,mod);
 const code=ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{console,process,Date,AbortSignal,fetch:async(url,args)=>{requests.push(JSON.parse(args.body));const out=responses.shift();assert.ok(out,'Unexpected API call');return {ok:true,text:async()=>JSON.stringify(out)};}})(id=>id.startsWith('@/')?load('src/'+id.slice(2)+'.ts'):require(id),mod,mod.exports);return mod.exports;
}
const {judgeDifficulty,applyJudgedDifficulty,isApplicableDifficultyJudgement}=load('src/lib/difficulty-judge.ts');
const {applyOperationalDifficultyPolicy,difficultyAiVerified}=load('src/lib/problem-dna.ts');
const {difficultyAiJudged}=load('src/lib/difficulty-scale.ts');
const {sourceStarGrades,sourceStarCacheMatches,SOURCE_STAR_POLICY,SOURCE_STAR_READER_VERSION}=load('src/lib/source-star-difficulty.ts');
const stars={status:'absent',count:null,confidence:.95,evidence:'full visible margin'};
const solve={observed_question_no:11,observed_conditions:['condition'],observed_choices:['1','2','3','4','5'],answer_value:'15',curriculum_valid:true,curriculum_reason:'derivative definition',source_stars:stars,solvable:true,solved_answer:'3',solution_outline:'complete proof',key_insight:'finite limit',concepts:['derivative'],reasoning_steps:5,condition_transformations:3,calculation_load:3,insight_load:4,confidence:.9,issue:''};
const assessment={entry_barrier:'finite limit condition',condition_connections:'two limits',execution_burden:'integer cases',standard_student_obstacle:'implicit f(1)',advanced_student_obstacle:'factor pairs',estimated_minutes_min:4,estimated_minutes_max:7,lower_grade_reason:'combined constraints',higher_grade_reason:'bounded cases',curriculum_verified:true};
const judged={decision:'graded',final_grade:'6',csat_point_equivalent:4,csat_difficulty_band:'four_hard',reason:'student burden',confidence:.85,review_required:false,review_reason:'',solution_verified:true,answer_consistency:'match',student_assessment:assessment};
const response=x=>({status:'completed',model:'test-model-resolved',usage:{input_tokens:100,output_tokens:200},output_text:JSON.stringify(x)});
const args={apiKey:'test',model:'test-model',imageUrl:'data:image/png;base64,AA==',dna:{question_no:11,basic:{subject:'미적분 I'},thinking:{key_insight:'OLD_SECRET'},solution:{representative_solution:['OLD_SECRET']}},officialAnswer:'3',questionNo:11,questionType:'multiple_choice'};
async function run(s=solve,j=judged){requests=[];responses=[response(s),response(j)];return judgeDifficulty(args);}
(async()=>{
 const good=await run();assert.equal(good.review_required,false);assert.equal(good.final_grade,'6');
 assert.equal(good.execution.calls[0].response_model,'test-model-resolved');
 assert.ok(requests.every(r=>r.reasoning.effort==='high'));
 assert.ok(requests.every(r=>!JSON.stringify(r).includes('OLD_SECRET')));
 assert.ok(requests[0].input[0].content[0].text.includes('미적분 I'));
 assert.equal(isApplicableDifficultyJudgement(good),true);
 for (const bad of [{...good,solution_verified:false},{...good,answer_consistency:'unknown'},{...good,solve:{...good.solve,issue:'unclear symbol'}},{...good,csat_point_equivalent:3},{...good,student_assessment:{...assessment,estimated_minutes_max:NaN}}]) {
  assert.equal(isApplicableDifficultyJudgement(bad),false);assert.equal(applyJudgedDifficulty({difficulty:{final_grade:7}},bad).difficulty.final_grade,7);
 }
 const cached={difficulty:{source_star_origin:'original_pdf',source_star_policy:SOURCE_STAR_POLICY,source_star_reader_version:SOURCE_STAR_READER_VERSION,source_star_fingerprint:'pdf-v1',source_star_model:'model'}};
 assert.equal(sourceStarCacheMatches(cached,'pdf-v1','model'),true);
 assert.equal(sourceStarCacheMatches(cached,'pdf-v2','model'),false);
 assert.equal(sourceStarCacheMatches(cached,'pdf-v1','new-model'),false);
 assert.equal(sourceStarCacheMatches({difficulty:{source_star_origin:'original_pdf',source_star_policy:SOURCE_STAR_POLICY}},'pdf-v1','model'),false);
 const unclear=await run({...solve,issue:"symbol unclear"});assert.equal(unclear.review_required,true);assert.equal(applyJudgedDifficulty({difficulty:{final_grade:5}},unclear).difficulty.final_grade,5);
 const badBand=await run(solve,{...judged,csat_difficulty_band:'three_point'});assert.equal(badBand.review_required,true);
 const badPoint=await run(solve,{...judged,csat_point_equivalent:3});assert.equal(badPoint.review_required,true);
 const badCurr=await run({...solve,curriculum_valid:false});assert.equal(badCurr.final_grade,null);assert.equal(requests.length,1);
 const badNo=await run({...solve,observed_question_no:12});assert.equal(badNo.final_grade,null);
 const noAssessment=await run(solve,{...judged,student_assessment:undefined});assert.equal(noAssessment.review_required,true);
 const unknown=await run(solve,{...judged,answer_consistency:'unknown'});assert.equal(unknown.review_required,true);
 const old={difficulty:{final_grade:7,csat_difficulty_band:'semi_killer'}};
 assert.equal(applyJudgedDifficulty(old,badBand,'7').difficulty.final_grade,7);
 const fixed={difficulty:{admin_fixed:true,final_grade:8}};assert.equal(applyJudgedDifficulty(fixed,good,'8'),fixed);
 const updated=applyJudgedDifficulty(old,good,'7');assert.equal(updated.difficulty.final_grade,6);assert.equal(updated.difficulty.difficulty_estimated,false);
 const review={difficulty:{ai_regrade_version:'v',difficulty_decision:'graded',difficulty_review_required:true}};
 assert.equal(applyOperationalDifficultyPolicy(review),review);
 assert.equal(difficultyAiVerified(review),false);assert.equal(difficultyAiJudged(review),false);
 const proposal=applyOperationalDifficultyPolicy({difficulty:{final_grade:8,csat_difficulty_band:'killer',source_stars:stars}},'수능특강');assert.equal(proposal.difficulty.final_grade,8);assert.equal(proposal.difficulty.source_cap_applied,false);
 const conflict=applyOperationalDifficultyPolicy({difficulty:{final_grade:7,csat_difficulty_band:'three_point',source_stars:stars}});assert.equal(conflict.difficulty.final_grade,7);assert.equal(conflict.difficulty.difficulty_review_required,true);
 assert.deepEqual(Array.from(sourceStarGrades({status:'present',count:3,confidence:.99,evidence:'visible'})),[4,5,6,7,8]);
 requests=[];responses=[{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}},response(solve),response(judged)];await judgeDifficulty(args);assert.ok(requests.every(r=>r.reasoning.effort==='high'));assert.equal(requests[1].max_output_tokens,20000);
 console.log('PASS: independent input, student evidence, curriculum, answer/grade consistency, preserved grades, admin protection, retry effort and telemetry');
})().catch(e=>{console.error(e);process.exitCode=1;});
