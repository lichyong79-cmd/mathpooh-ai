const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),ts=require('typescript');
const source=fs.readFileSync('src/lib/sos-ai-training.ts','utf8');
const parts=[source.slice(source.indexOf('async function archiveGeneratedProblems('),source.indexOf('async function updateGenerationStage(')),source.slice(source.indexOf('async function completeGeneratedSession('))];
const ctx={createHash,clampMeter:v=>v,compactDna:()=>({}),inlineImage:async()=>{throw Error('Saved batch must not fetch images');},updateGenerationStage:async()=>{},buildGeneratedProblemsInBatches:async()=>Array.from({length:3},(_,i)=>({question:'question '+i,answer:'1',meter:3,verification:{valid:true}}))};
vm.createContext(ctx);vm.runInContext(ts.transpile(parts.join('\n').replace('export async function','async function'),{target:ts.ScriptTarget.ES2020}),ctx);
function database({child=null,items=[],failItems=false}={}){
 const sourceSession={id:'source',student_id:'student',target_snapshot:{},weakness_snapshot:{},sos_training_items:[{item_order:1,problem_bank_questions:{id:'p',question_image_path:'image'}}]};
 const state={child,items,bank:[],failItems,creates:0};
 return {state,from(table){let op='select',payload,filters=[],options;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},in(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},insert(p){op='insert';payload=p;return q},upsert(p,o){op='upsert';payload=p;options=o;return q},update(p){op='update';payload=p;return q},single(){return run(true)},then(a,b){return run(false).then(a,b)}};
 async function run(single){
  if(table==='sos_ai_generation_jobs')return {data:{batch_payload:{problems:[1,2,3]}}};
  if(table==='sos_ai_generated_questions'){
   if(op==='upsert'){assert.equal(options.ignoreDuplicates,true);assert.equal(new Set(payload.map(p=>p.content_hash)).size,payload.length);for(const p of payload)if(!state.bank.some(b=>b.content_hash===p.content_hash))state.bank.push({...p,id:'bank'+state.bank.length});return {data:null};}
   return {data:state.bank.filter(p=>!filters.length||filters[0][1].includes(p.content_hash))};
  }
  if(table==='sos_training_sessions'){
   if(op==='insert'){state.creates++;state.child={...payload,id:'child'};return {data:{...state.child}};}
   if(op==='update'){Object.assign(state.child,payload);return {data:null};}
   if(filters.some(([k,v])=>k==='id'&&v==='source'))return {data:sourceSession};
   return {data:state.child?[{...state.child}]:[]};
  }
  if(table==='sos_training_items'){
   if(op==='upsert'){assert.equal(options.ignoreDuplicates,true);if(state.failItems){state.failItems=false;return {error:new Error('simulated disconnect after session creation')};}for(const p of payload)if(!state.items.some(i=>i.item_order===p.item_order))state.items.push(p);return {data:null};}
   return {data:state.items};
  }
  throw Error(table);
 }
 return q;}};
}
(async()=>{
 const db=database();const p={question:'same',sourceProblemId:'p',answer:'1'};
 let out=await ctx.archiveGeneratedProblems({supabase:db,studentId:'student',sourceSessionId:'source',kind:'HOMEWORK',problems:[p,p,{...p,question:'other'}]});
 assert.equal(out.length,3);assert.equal(db.state.bank.length,2);assert.equal(out[0].aiBankId,out[1].aiBankId);
 db.state.bank[0].status='DISABLED';db.state.bank[0].use_count=7;
 await assert.rejects(ctx.archiveGeneratedProblems({supabase:db,studentId:'another',sourceSessionId:'source',kind:'HOMEWORK',problems:[p]}),/사용 중지/);
 assert.equal(db.state.bank[0].status,'DISABLED');assert.equal(db.state.bank[0].use_count,7);
 const broken=database({failItems:true});const args={supabase:broken,studentId:'student',firstTrainingSessionId:'source',count:3,kind:'HOMEWORK',jobId:'job'};
 await assert.rejects(ctx.generateSimilarTraining(args),/disconnect/);assert.equal(broken.state.child.status,'DRAFT');assert.equal(broken.state.items.length,0);
 await ctx.generateSimilarTraining(args);assert.equal(broken.state.creates,1);assert.equal(broken.state.child.status,'ASSIGNED');assert.equal(broken.state.items.length,3);
 broken.state.items[0].student_answer='42';await ctx.generateSimilarTraining(args);assert.equal(broken.state.items[0].student_answer,'42');assert.equal(broken.state.creates,1);
 const partial=database({child:{id:'child',status:'IN_PROGRESS'},items:[{item_order:1,generated_problem:{question:'already answered'},student_answer:'42'}]});
 await ctx.generateSimilarTraining({...args,supabase:partial});assert.equal(partial.state.items.length,3);assert.equal(partial.state.items[0].student_answer,'42');assert.equal(partial.state.child.status,'IN_PROGRESS');
 console.log('PASS: duplicate bank keys, disabled/history preservation, interrupted assignment recovery, idempotent retry, partial answers preserved, saved batch skips images');
})().catch(e=>{console.error(e);process.exitCode=1});
const queueContext={exports:{}};vm.createContext(queueContext);vm.runInContext(ts.transpile(fs.readFileSync('src/lib/sos-ai-generation-queue.ts','utf8'),{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}),queueContext);
function responses(values){return {from(){const q={};for(const k of ['select','eq','lt','update','insert'])q[k]=()=>q;for(const k of ['single','maybeSingle'])q[k]=async()=>{assert.ok(values.length,'unexpected query');return values.shift();};return q;}};}
(async()=>{
 const winner={id:'job',status:'GENERATING'};
 const args={studentId:'student',sourceTrainingSessionId:'source',kind:'HOMEWORK',count:3};
 const raced=await queueContext.exports.enqueueAiGeneration({...args,supabase:responses([{data:null},{error:{code:'23505'}},{data:winner}])});assert.equal(raced.job.id,'job');
 const retried=await queueContext.exports.enqueueAiGeneration({...args,supabase:responses([{data:{id:'job',status:'FAILED'}},{data:null},{data:winner}])});assert.equal(retried.job.status,'GENERATING');
 console.log('PASS: concurrent queue creation and concurrent retry preserve the winning job');
})().catch(e=>{console.error(e);process.exitCode=1});
