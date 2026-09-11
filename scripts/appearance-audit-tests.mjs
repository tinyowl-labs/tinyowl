import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const html=fs.readFileSync('src/app.html','utf8');
const bootstrap=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function boot(local={},remote=null,blocked=false,dark=false) {
 const values=new Map(Object.entries(local).map(([k,v])=>['redthread:theme:'+k,String(v)]));
 const root={dataset:{},style:{setProperty(){}},classList:{toggle(){}}};
 const context={document:{documentElement:root,getElementById:()=>({textContent:JSON.stringify(remote)})},window:{matchMedia:()=>({matches:dark})},localStorage:{getItem(k){if(blocked)throw Error('blocked');return values.get(k)??null;},setItem(k,v){if(blocked)throw Error('blocked');values.set(k,v);}}};
 vm.runInNewContext(bootstrap,context);
 return {prefs:JSON.parse(root.dataset.themePreferences),root,context};
}
for(const bgBase of ['pitch','dark','dim','stone','paper'])for(const radius of ['sharp','rounded','pill'])for(const surface of ['none','tinted','glass'])for(const colorScheme of ['system','light','dark'])for(const dark of [false,true]){
 const prefs={accentHue:350,bgBase,radius,surface,colorScheme};
 assert.deepEqual(boot(prefs,null,false,dark).prefs,prefs);
 assert.deepEqual(boot({},prefs,false,dark).prefs,prefs);
}
assert.equal(boot({blur:'subtle'}).prefs.surface,'tinted');
assert.equal(boot({surface:'obsolete',blur:'glass'}).prefs.surface,'glass');
assert.equal(boot({accentHue:'Infinity',bgBase:'constructor',radius:'__proto__'}).prefs.accentHue,220);
assert.equal(boot({accentHue:-7}).prefs.accentHue,0);
assert.equal(boot({accentHue:999}).prefs.accentHue,360);
assert.equal(boot({}, {colorScheme:'light',surface:'glass'},true).prefs.surface,'glass');
assert.equal(boot({},null,true).prefs.radius,'pill');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
// Execute the actual hook: parallel route/layout consumers share one verified user.
const hook=compile(fs.readFileSync('src/hooks.server.ts','utf8'));
let userCalls=0;const user={id:'fixture',user_metadata:{theme_preferences:{surface:'</script><script>bad()</script>'}}};
const auth={getUser:async()=>{userCalls++;return {data:{user}}},getSession:async()=>({data:{session:{access_token:'fixture'}}})};
const module={exports:{}};new Function('require','module','exports',hook)(()=>({createClient:()=>({auth})}),module,module.exports);
let transformed;const event={locals:{}};
await module.exports.handle({event,resolve:async(event,options)=>{
 await Promise.all([event.locals.getSession(),event.locals.getSession()]);
 transformed=await options.transformPageChunk({html:'<script type="application/json">%appearance.preferences%</script>'});
}});
assert.equal(userCalls,1);assert.ok(!transformed.includes('<script>bad'));
// Run the actual mount callback with controlled auth responses.
const layout=fs.readFileSync('src/routes/+layout.svelte','utf8');
const mount=layout.slice(layout.indexOf('    onMount(() => {')+'    onMount('.length,layout.indexOf('\n    // Shared-element')).trim().replace(/;$/,'').replace(/\)$/,'');
const js=compile('const mount = '+mount+';module.exports=mount;');
async function startup(serverUser,browserSession,recoveryFails=false,callbackSource=js){
 const counts={getSession:0,refresh:0,invalidate:0};
 const auth={getSession:async()=>{counts.getSession++;return{data:{session:browserSession}}},refreshSession:async()=>{counts.refresh++;return{error:recoveryFails?Error('expired'):null,data:{session:browserSession,user:{user_metadata:{}}}}}};
 const module={exports:{}};
 new Function('module','$page','createClient','pullKeyboardFromSupabase','applyRemoteTheme','invalidateAll','pullThemeFromSupabase',callbackSource)(module,{data:{user:serverUser}},()=>({auth}),()=>{},()=>{},async()=>{counts.invalidate++},()=>{});
 module.exports();await new Promise(resolve=>setImmediate(resolve));return counts;
}
assert.deepEqual(await startup(user,{}),{getSession:0,refresh:0,invalidate:0});
assert.deepEqual(await startup(null,null),{getSession:1,refresh:0,invalidate:0});
assert.deepEqual(await startup(null,{}),{getSession:1,refresh:1,invalidate:1});
assert.deepEqual(await startup(null,{},true),{getSession:1,refresh:1,invalidate:0});
console.log('Passed: 270 appearance combinations locally and from account metadata, blocked storage, legacy and invalid preferences, escaped metadata, request-scoped auth deduplication, valid/anonymous/recovered/failed sessions.');
console.log('Normal signed-in startup: forced refresh 1 → 0; invalidateAll 1 → 0. Session recovery remains 1 refresh / 1 invalidation.');

if(process.env.APPEARANCE_BASELINE_LAYOUT){
 const source=fs.readFileSync(process.env.APPEARANCE_BASELINE_LAYOUT,'utf8');
 const mount=source.slice(source.indexOf('    onMount(() => {')+'    onMount('.length,source.indexOf('\n    // Shared-element')).trim().replace(/;$/,'').replace(/\)$/,'');
 const baseline=await startup(user,{},false,compile('const mount = '+mount+';module.exports=mount;'));
 assert.deepEqual(baseline,{getSession:0,refresh:1,invalidate:1});console.log('Retained baseline mount verified:',baseline);
}

const keyboardModule={exports:{}};
const keyboardContext={module:keyboardModule,exports:keyboardModule.exports,require:()=>({})};
Object.defineProperty(keyboardContext,'localStorage',{get(){throw Error('Storage denied')}});
vm.runInNewContext(compile(fs.readFileSync('src/lib/shortcuts/persist.ts','utf8')),keyboardContext);
const defaults=keyboardModule.exports.readKeyboardFromStorage();
assert.ok(defaults.cameraScheme);assert.doesNotThrow(()=>keyboardModule.exports.persistKeyboardToStorage(defaults));
console.log('Keyboard startup also tolerates a throwing storage getter and failed writes.');
