import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';

function compile(source, filename) {
    const module = { exports: {} };
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const require = (name) => {
        const path = resolve(dirname(filename), name + '.ts');
        return compile(readFileSync(path, 'utf8'), path);
    };
    new Function('require', 'module', 'exports', code)(require, module, module.exports);
    return module.exports;
}
const concurrentPath = resolve('src/lib/async/mapConcurrent.ts');
const { mapConcurrent } = compile(readFileSync(concurrentPath, 'utf8'), concurrentPath);
let active = 0, peak = 0;
assert.deepEqual(await mapConcurrent([0,1,2,3,4,5,6,7], 3, async n => {
    peak = Math.max(peak, ++active); await new Promise(r=>setTimeout(r,2)); active--; return n*2;
}), [0,2,4,6,8,10,12,14]);
assert.equal(peak,3);

// Exercise the actual Svelte loader with controlled HTTP responses.
const pageSource = readFileSync('src/routes/[project]/layers/+page.svelte','utf8');
const loader = pageSource.slice(pageSource.indexOf('    async function loadAllCzml('), pageSource.indexOf('    let persistTimers'));
const harness = `export async function run(mapConcurrent, assert) {
let viewingRef='develop',mapLayers=[],mapLoading=false,czmlErrors=[],czmlController=null,czmlScope='',czmlLoadGen=0,czmlFetchedKey='',czmlInFlightKey='';
const czmlLayerCache=new Map(),tableNames=['a','b','c','d','e','f'],tables=Object.fromEntries(tableNames.map(n=>[n,['geom']])),canMutate=false;
const $page={params:{project:'dig'}},untrack=f=>f(),authHeaders=()=>({});
let failures=true,active=0,peak=0,calls={},emptyLayer=false;
const fetch=async (url)=>{if(url.includes('layer-views'))return {ok:true,json:async()=>({layers:{}})};
const name=url.split('/layers/')[1].split('/')[0];calls[name]=(calls[name]||0)+1;peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,2));active--;
if(name==='b'&&failures)return {ok:false,status:503};if(name==='f'&&emptyLayer)return {ok:true,text:async()=>JSON.stringify({id:'document'})};return {ok:true,text:async()=>JSON.stringify({id:name+':1',position:url.includes('ref=main')?10:99})};};
const parseNdjsonCzmlAsync=async s=>[JSON.parse(s)],entityIdsFromPackets=packets=>packets.filter(p=>p.id!=='document').map(p=>p.id),ensureExplicitViews=()=>({views:[{id:'v'}],persist:false}),defaultOpacityForPackets=()=>1;
${loader}
await loadAllCzml();assert.equal(peak,4);const initialPeak=peak;assert.deepEqual(czmlErrors,['b']);assert.equal(mapLayers.length,5);
failures=false;await loadAllCzml();assert.equal(mapLayers.length,6);assert.equal(calls.a,1);assert.equal(calls.b,2);
viewingRef='main';await loadAllCzml();assert.equal(mapLayers[0].packets[0].position,10);assert.equal(czmlErrors.length,0);
viewingRef='develop';const pending=loadAllCzml();viewingRef='main';await loadAllCzml();await pending;assert.equal(mapLayers[0].packets[0].position,10);
emptyLayer=true;await loadAllCzml(true);assert.equal(mapLayers.length,5);assert.ok(!mapLayers.some(l=>l.name==='f'));assert.equal(czmlErrors.length,0);
return {emptyGeometryTable:'kept out of map layers',initialPeak,rapidRefSwitch:'passed (mock deliberately ignores abort)',successfulLayerRequests:calls.a,retriedLayerRequests:calls.b};
}`;
console.log('loader checks',await compile(harness,resolve('loader.ts')).run(mapConcurrent,assert));

const entitiesPath=resolve('src/lib/components/dashboard/czmlEntities.ts');
async function measureEntities(source,kind) {
    const {customDataSourceFromCzml}=compile(source,entitiesPath);
    let count=0,last=0,maxChunk=0,suspends=0,resumes=0;
    const prior=globalThis.scheduler;
    globalThis.scheduler={yield:async()=>{maxChunk=Math.max(maxChunk,count-last);last=count;await new Promise(setImmediate);}};
    const color={withAlpha(){return this;}};
    const Cesium={
        CustomDataSource:class {constructor(){this.entities={suspendEvents(){suspends++;},resumeEvents(){resumes++;},add(e){const until=performance.now()+0.025;while(performance.now()<until){}count++;return e;}};}},
        Cartesian3:{fromDegrees:(...p)=>p},Color:{DODGERBLUE:color,WHITE:color,fromBytes:()=>color},
        HeightReference:{NONE:0,CLAMP_TO_GROUND:1},PolygonHierarchy:class{constructor(p){this.positions=p;}}
    };
    const flat=[1,2,1,2,3,1,3,2,1];
    const packets=Array.from({length:1000},(_,i)=>({id:`layer:${i}`,properties:{source_id:String(i)},
        ...(kind==='point'?{point:{},position:{cartographicDegrees:[1,2,1]}}:
            kind==='line'?{polyline:{positions:{cartographicDegrees:flat}}}:{polygon:{positions:{cartographicDegrees:flat}}})}));
    const start=performance.now();await customDataSourceFromCzml(Cesium,{scene:{requestRender(){}}},packets,'layer');
    const elapsed=performance.now()-start;maxChunk=Math.max(maxChunk,count-last);
    await new Promise(setImmediate);globalThis.scheduler=prior;
    assert.equal(count,1000);assert.equal(suspends,1);assert.equal(resumes,1);
    return {maxChunk,totalMs:Math.round(elapsed*100)/100};
}
const old=process.argv[2] ? readFileSync(process.argv[2], 'utf8') : null;
const current=readFileSync(entitiesPath,'utf8');
for (const kind of ['point','line','polygon']) {
    const before=old ? await measureEntities(old,kind) : undefined,after=await measureEntities(current,kind);
    assert.ok(after.maxChunk<=100,`${kind} did not yield`);
    console.log('entity build',kind,{before,after});
}
console.log('Audit frontend regression checks passed. Entity timings use simulated per-entity work; they are not GPU/frame-time measurements.');

const readerPath = resolve('src/lib/project/readTableRows.ts');
const {readTableRows} = compile(readFileSync(readerPath,'utf8'),readerPath);
let pages = 0;
const complete = await readTableRows({slug:'dig',table:'lookup',ref:'main',fetcher:async url=>{
    const qs=new URL('http://test'+url).searchParams; assert.equal(qs.get('ref'),'main');pages++;
    const offset=Number(qs.get('offset')); return {ok:true,json:async()=>({total:10001,rows:Array.from({length:Math.min(1000,10001-offset)},(_,i)=>({source_id:String(offset+i)}))})};
}});
assert.equal(complete.length,10001);assert.equal(pages,11);assert.equal(complete.at(-1).source_id,'10000');
await assert.rejects(()=>readTableRows({slug:'dig',table:'broken',ref:'main',fetcher:async()=>({ok:false,status:503})}));
console.log('Related-table paging reads all 10,001 rows and propagates failures.');
