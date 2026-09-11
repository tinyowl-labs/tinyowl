import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
const root=resolve('src/lib/components/dashboard');
function compile(source,filename){
 const module={exports:{}};
 const require=name=>{
  if(name==='$lib/stores/layerSelection.svelte')return {toSelectionKey:(layer,id)=>`${layer}:${id}`};
  const path=resolve(dirname(filename),name+'.ts');return compile(readFileSync(path,'utf8'),path);
 };
 new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(require,module,module.exports);return module.exports;
}
const load=name=>compile(readFileSync(resolve(root,name+'.ts'),'utf8'),resolve(root,name+'.ts'));
const {indexMapRows,indexedMapRow}=load('mapRowIndexes');
const {rowByEntityId,resolveSeriesKind}=load('layerViews');
const reports=[];
const rows=Array.from({length:10000},(_,i)=>({source_id:`id-${i}`,name:`Record ${i}`,year:`2020-01-${String(i%28+1).padStart(2,'0')}`}));
const matching=[{source_id:' a ',name:'first'},{source_id:'a',name:'second'},{SOURCE_ID:'A',name:'upper'}];
const index=indexMapRows({layer:matching});for(const id of ['a',' a ','A','missing'])assert.equal(indexedMapRow(index,'layer',id),rowByEntityId(matching,id));
let sink=0;
const measure=run=>{const start=performance.now();run();return +(performance.now()-start).toFixed(2);};
for(let sample=0;sample<3;sample++){
 const baseline=measure(()=>{for(const r of rows)sink+=rowByEntityId(rows,r.source_id).name.length;});
 const changed=measure(()=>{const index=indexMapRows({layer:rows});for(const r of rows)sink+=indexedMapRow(index,'layer',r.source_id).name.length;});
 reports.push({test:'10000 row lookups, including index build',sample,baselineMs:baseline,changedMs:changed});
}
const seriesRows=rows.slice(0,1000);const style={seriesField:'year'};
const expected=resolveSeriesKind(style,seriesRows);assert.equal(expected,'date');
reports.push({test:'1000 automatic series decisions over 1000 rows',baselineMs:measure(()=>{for(const row of seriesRows)assert.equal(resolveSeriesKind(style,seriesRows),expected);}),changedMs:measure(()=>{const kind=resolveSeriesKind(style,seriesRows);for(const row of seriesRows)assert.equal(kind,expected);})});
const labels=rows.map(r=>r.name).reverse();
const collator=new Intl.Collator(undefined,{sensitivity:'base',numeric:true});
let prior,next;
reports.push({test:'10000 labels sorted',baselineMs:measure(()=>prior=[...labels].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base',numeric:true}))),changedMs:measure(()=>next=[...labels].sort(collator.compare))});assert.deepEqual(prior,next);

const {parseCzmlResponse,parseNdjsonCzmlAsync}=load('czmlLoad');
const text=JSON.stringify({id:'document'})+'\r\n'+JSON.stringify({id:'layer:é',properties:{name:'岩 🦔'}})+'\n'+JSON.stringify({id:'last'});
const bytes=new TextEncoder().encode(text);let offset=0;
const response=new Response(new ReadableStream({pull(controller){if(offset===bytes.length){controller.close();return;}controller.enqueue(bytes.slice(offset,offset+1));offset++;}}));
assert.deepEqual(await parseCzmlResponse(response),await parseNdjsonCzmlAsync(text));
await assert.rejects(parseCzmlResponse(new Response('{"id":"ok"}\n{"incomplete"')),SyntaxError);
let cancelled=false;const abort=new AbortController();
const stalled=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"id":"ok"}\n'));},cancel(){cancelled=true;}}));
const reading=parseCzmlResponse(stalled,abort.signal);abort.abort();await assert.rejects(reading);assert.equal(cancelled,true);
const failing=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"id":"ok"}\n'));c.error(new Error('stream failed'));}}));await assert.rejects(parseCzmlResponse(failing),/stream failed/);

const {computeInViewKeys,InViewBoundsCache,InViewCameraState}=load('layerSceneInView');
let projections=0,boundsBuilt=0;
const listeners=new Map();
const event=entity=>({addEventListener(fn){listeners.set(entity,fn);}});
const entities=Array.from({length:1000},(_,i)=>{const entity={id:String(i),show:true,polygon:{hierarchy:{isConstant:true,getValue:()=>({positions:Array.from({length:100},()=>({x:i===0?50:-100,y:50,z:0}))})}}};entity.definitionChanged=event(entity);return entity;});
const Cesium={SceneMode:{SCENE3D:3},Intersect:{OUTSIDE:-1},BoundingSphere:{fromPoints(points){boundsBuilt++;return {center:points[0],radius:0};}},SceneTransforms:{worldToWindowCoordinates(scene,p){projections++;return p;}}};
const viewer={clock:{currentTime:0},scene:{mode:3,canvas:{clientWidth:100,clientHeight:100}},camera:{viewMatrix:Array(16).fill(0),frustum:{projectionMatrix:Array(16).fill(0),computeCullingVolume:()=>({computeVisibility:s=>s.center.x<0?-1:1})}}};
const opts={Cesium,viewer,entityDataSources:()=>[{show:true,entities:{values:entities}}],entityMeta:{get:e=>({layerName:'layer',entityId:e.id})},entityBoundingSphere:()=>null,tilesetPrims:new Map(),prev:{entityKeys:[],modelHashes:[]}};
const baseline=computeInViewKeys(opts);const before=projections;projections=0;
let invalidations=0;const cache=new InViewBoundsCache(()=>invalidations++);const after=computeInViewKeys({...opts,bounds:cache});assert.deepEqual(after,baseline);assert.equal(projections,1);assert.equal(boundsBuilt,1000);
computeInViewKeys({...opts,bounds:cache});assert.equal(boundsBuilt,1000);
listeners.get(entities[0])();assert.equal(invalidations,1);computeInViewKeys({...opts,bounds:cache});assert.equal(boundsBuilt,1001);
viewer.scene.mode=2;projections=0;assert.deepEqual(computeInViewKeys({...opts,bounds:cache}),baseline);assert.equal(projections,before);viewer.scene.mode=3;
const camera=new InViewCameraState();assert.equal(camera.changed(viewer),true);for(let i=0;i<100;i++)assert.equal(camera.changed(viewer),false);viewer.camera.viewMatrix[0]=1;assert.equal(camera.changed(viewer),true);viewer.scene.canvas.clientWidth=200;assert.equal(camera.changed(viewer),true);
reports.push({test:'1000 polygons × 100 vertices; 999 outside frustum',baselineProjections:before,changedProjections:1,unchangedCameraFramesSkipped:100});
reports.push({test:'NDJSON Unicode/chunk boundaries, incomplete response, stream failure, abort',passed:true});
console.log(JSON.stringify(reports,null,2));

// Run the real component's source synchronization without WebGL to count builds.
const component=readFileSync(resolve(root,'LayerScene.svelte'),'utf8');
let syncSource=component.slice(component.indexOf('    let layerSyncRunning ='),component.indexOf('    function applyLayerViews()'));
syncSource=syncSource.replace(/await import\(\s*"\.\/czmlEntities"\s*\)/g,'({customDataSourceFromCzml: buildSource})');
const syncHarness=`export async function run(assert) {
 const layerSources=new Map(),builds=[];let layers=[],layerLoadGen=0,dataEpoch=0;
 const Cesium={SceneMode:{SCENE3D:3},},viewer={dataSources:{add:async ds=>ds,remove:()=>{}},isDestroyed:()=>false};
 const indexCzmlEntities=()=>{},applyLayerViews=()=>{},flyHomeOnce=()=>{},bumpRender=()=>{};
 const destroyLayerSource=name=>layerSources.delete(name);
 const buildSource=async(C,v,packets,name,cancelled)=>{builds.push(name);await new Promise(r=>setTimeout(r,5));if(cancelled())throw new DOMException('cancelled','AbortError');return {name,entities:{removeAll(){}}};};
 ${syncSource}
 const a={name:'a',visible:true,packets:[{id:'a:1'}]},b={name:'b',visible:false,packets:[{id:'b:1'}]};layers=[a,b];await syncLayers();assert.deepEqual(builds,['a']);
 layers=[a,{...b,visible:true}];await syncLayers();assert.deepEqual(builds,['a','b']);const unchanged=layerSources.get('b');
 dataEpoch++;layers=[{...a,packets:[{id:'a:1',changed:true}]},layers[1]];await syncLayers();assert.deepEqual(builds,['a','b','a']);assert.equal(layerSources.get('b'),unchanged);
 const c={name:'c',visible:true,packets:[{id:'c:1'}]};layers=[...layers,c];const pending=syncLayers();await new Promise(r=>setTimeout(r,1));layers=[...layers,{name:'d',visible:true,packets:[{id:'d:1'}]}];await syncLayers();await pending;assert.equal(builds.filter(n=>n==='c').length,1);assert.equal(builds.filter(n=>n==='d').length,1);
 return {builds,hiddenBuildsBeforeShowing:0,unchangedSourceRetained:true,progressiveBuildsRestarted:0};
}`;
console.log('entity synchronization',await compile(syncHarness,resolve('sync-harness.ts')).run(assert));

const concurrentPath=resolve('src/lib/async/mapConcurrent.ts');const {mapConcurrent}=compile(readFileSync(concurrentPath,'utf8'),concurrentPath);
const {canRefreshChangedLayers}=load('mapRefresh');
async function loadingTimeline(pageSource){
 let source=pageSource.slice(pageSource.indexOf('    async function loadAllCzml('),pageSource.indexOf('    let persistTimers'));
 source=source.replace(/\bmapLayers\b/g,'layerState.value');
 const harness=`export async function run(mapConcurrent,canRefreshChangedLayers) {
 const timeline=[],started=performance.now();let current=[];const layerState={get value(){return current},set value(value){current=value;timeline.push({ms:Math.round(performance.now()-started),layers:value.length});}};
 let viewingRef='main',mapLoading=false,czmlErrors=[],czmlController=null,czmlScope='',czmlCommit='',czmlLoadGen=0,czmlFetchedKey='',czmlInFlightKey='';
 const czmlLayerCache=new Map(),tableNames=['a','b','c','d','e','f'],tables=Object.fromEntries(tableNames.map(n=>[n,['geom']])),canMutate=false;
 const $page={params:{project:'fixture'}},untrack=f=>f(),authHeaders=()=>({});
 const fetch=async(url)=>{if(url.includes('/refs'))return {ok:true,json:async()=>({main:'base'})};if(url.includes('layer-views'))return {ok:true,json:async()=>({layers:{}})};
 const name=url.split('/layers/')[1].split('/')[0];await new Promise(r=>setTimeout(r,name==='f'?250:3));return {ok:true,text:async()=>JSON.stringify({id:name+':1'})};};
 const parseNdjsonCzmlAsync=async text=>[JSON.parse(text)],parseCzmlResponse=async r=>parseNdjsonCzmlAsync(await r.text()),rowsFromPackets=()=>[],entityIdsFromPackets=p=>p.map(p=>p.id),ensureExplicitViews=()=>({views:[{id:'v'}],persist:false}),defaultOpacityForPackets=()=>1;
 ${source}
 await loadAllCzml();return timeline;
 }`;
 return compile(harness,resolve('timeline-harness.ts')).run(mapConcurrent,canRefreshChangedLayers);
}
const timeline=await loadingTimeline(readFileSync('src/routes/[project]/layers/+page.svelte','utf8'));
assert.ok(timeline.some(entry=>entry.layers===5&&entry.ms<200));
console.log('progressive loading',JSON.stringify({changed:timeline}));
if(process.env.MAP_BASELINE_PAGE)console.log('baseline loading',JSON.stringify(await loadingTimeline(readFileSync(process.env.MAP_BASELINE_PAGE,'utf8'))));
