const fs=require('fs'),ts=require('typescript'),vm=require('vm'),assert=require('node:assert/strict');
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const memory=new Map();const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const draft={exports:{},window:{sessionStorage:storage},Date};vm.createContext(draft);vm.runInContext(compile('src/lib/sos-training-draft.ts'),draft);
const {writeTrainingDraft,readTrainingDraft,clearTrainingDraft}=draft.exports;
writeTrainingDraft('s1',{itemIds:['a','b'],answers:{a:'12',b:'61'},seconds:{a:35,b:9},index:1,updatedAt:Date.now()});
assert.equal(readTrainingDraft('s1',['a','b']).answers.b,'61');assert.equal(readTrainingDraft('s1',['a','b']).index,1);
assert.equal(readTrainingDraft('s2',['a','b']),null);assert.equal(readTrainingDraft('s1',['a','c']),null);
clearTrainingDraft('s1');assert.equal(readTrainingDraft('s1',['a','b']),null);
storage.getItem=()=>{throw Error('storage denied')};assert.equal(readTrainingDraft('s1',['a','b']),null);

// Exercise the real availability component across a failed poll and recovery.
let slots=[],cursor=0,effect,interval,response={blocked:false},fail=false,reloads=0;
const react={useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},useEffect:fn=>{effect??=fn}};
const jsx=(type,props)=>({type,props});
const ctx={exports:{},require:n=>n==='react'?react:n.includes('diagnostics')?{reportSosClientEvent:()=>{}}:{jsx,jsxs:jsx,Fragment:'fragment'},fetch:async()=>{if(fail)throw Error('timeout');return {ok:true,json:async()=>response}},AbortSignal:{timeout:()=>null},setInterval:fn=>{interval=fn;return 1},clearInterval:()=>{},window:{location:{reload:()=>reloads++}}};
vm.createContext(ctx);vm.runInContext(compile('src/components/sos-question-availability.tsx'),ctx);
const child={type:'runner',answer:'61'};const render=()=>{cursor=0;return ctx.exports.default({sessionId:'s1',children:child}).props.children};
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 render();const cleanup=effect();await flush();let tree=render();assert.equal(tree[1].props.children,child);assert.equal(tree[1].props.hidden,false);
 fail=true;interval();await flush();tree=render();assert.equal(tree[1].props.children,child);assert.equal(tree[1].props.hidden,false);assert.equal(tree[1].props.inert,true);
 fail=false;interval();await flush();tree=render();assert.equal(tree[1].props.children,child);assert.equal(tree[1].props.hidden,false);assert.equal(reloads,0);
 response={blocked:true};interval();await flush();tree=render();assert.equal(tree[1].props.hidden,true);assert.equal(tree[1].props.inert,true);
 cleanup();console.log('PASS: failed poll preserves runner identity; recovery resumes; quarantine blocks; drafts survive reload and remain session/item scoped');
})().catch(e=>{console.error(e);process.exitCode=1});
