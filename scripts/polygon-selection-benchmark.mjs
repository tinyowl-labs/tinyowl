// Run against a debugging Chromium and the app's IIFE assets; does not modify project data.
// MAP_BROWSER_DEBUG=http://localhost:9222 MAP_UI_ORIGIN=http://localhost:5173 node scripts/polygon-selection-benchmark.mjs
import fs from 'node:fs';import { resolve } from 'node:path';import ts from 'typescript';
const debug=process.env.MAP_BROWSER_DEBUG ?? 'http://localhost:9222';
const origin=process.env.MAP_UI_ORIGIN ?? 'http://localhost:5173';
const workloads=JSON.parse(process.env.MAP_POLYGON_WORKLOADS ?? '[[1,16,false],[1,256,false],[1,2048,false],[100,64,false],[1,256,true],[1,20000,false],[1000,128,false]]');
const frameOnly=process.env.MAP_SELECTION_FRAME_ONLY==='1';
const root=resolve('src/lib');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const source=fs.readFileSync(root+'/geoDiff/cesiumOverlay.ts','utf8');
const attach=source.slice(source.indexOf('function findNamedDataSource'),source.indexOf('function asRings'))+source.slice(source.indexOf('const overlayAttach'),source.indexOf('/** Paint `DiffFeature'));
const codes={overlay:compile(fs.readFileSync(process.env.MAP_SELECTION_SOURCE ?? root+'/components/dashboard/selectionOverlay.ts','utf8')),attach:compile(attach),load:compile(fs.readFileSync(root+'/components/dashboard/czmlLoad.ts','utf8')),style:compile(fs.readFileSync(root+'/components/dashboard/selectionStyle.ts','utf8')),pick:compile(fs.readFileSync(root+'/components/dashboard/mapSelection.ts','utf8'))};
const target=await(await fetch(debug+'/json/new?about:blank',{method:'PUT'})).json();const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}};const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method,params}))});
await send('Runtime.enable');await send('Page.enable');
// Keep the worker origin, but suppress application startup in this disposable page.
await send('Emulation.setScriptExecutionDisabled',{value:true});
await send('Page.navigate',{url:origin+'/'});
await new Promise(r=>setTimeout(r,1000));
const {frameTree}=await send('Page.getFrameTree');
await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:'<!doctype html><html><head></head><body></body></html>'});
await send('Emulation.setScriptExecutionDisabled',{value:false});
await send('Runtime.evaluate',{expression:`new Promise(r=>{window.CESIUM_BASE_URL=${JSON.stringify(origin+'/cesium/')};const s=document.createElement('script');s.src=window.CESIUM_BASE_URL+'Cesium.js';s.onload=r;document.head.append(s)})`,awaitPromise:true});
const result=await send('Runtime.evaluate',{expression:`(async()=>{
const codes=${JSON.stringify(codes)},modules={};function load(name){if(modules[name])return modules[name];const module={exports:{}};const req=p=>load(p.includes('geoDiff')?'attach':p.includes('czmlLoad')?'load':'style');new Function('require','module','exports',codes[name])(req,module,module.exports);return modules[name]=module.exports;}
const {syncSelectionOverlay,prepareSelectionEntity}=load('overlay'),{collectKeysAtScreenPoint}=load('pick');
const C=window.Cesium,results=[],errors=[];let renderer='unknown';
for(const [count,vertices,ground] of ${JSON.stringify(workloads)}){
const div=document.createElement('div');div.style.cssText='width:512px;height:512px';document.body.replaceChildren(div);
const v=new C.Viewer(div,{baseLayer:false,geocoder:false,animation:false,timeline:false,baseLayerPicker:false,skyBox:false,skyAtmosphere:false,requestRenderMode:false,contextOptions:{webgl:{preserveDrawingBuffer:true}},msaaSamples:1});v.scene.pickTranslucentDepth=false;v.scene.renderError.addEventListener((s,e)=>errors.push(String(e)));
v.scene.globe.baseColor=C.Color.BLACK;v.scene.backgroundColor=C.Color.BLACK;
v.camera.setView({destination:C.Cartesian3.fromDegrees(153,-27,2500)});
const baseLoadStart=performance.now();const ds=new C.CustomDataSource('base');await v.dataSources.add(ds);const items=[];
for(let i=0;i<count;i++){
const lon=153+(i%10)*0.001,lat=-27+Math.floor(i/10)*0.001,positions=[];for(let n=0;n<vertices;n++){const a=n/vertices*Math.PI*2;positions.push(C.Cartesian3.fromDegrees(lon+0.00035*Math.cos(a),lat+0.00035*Math.sin(a),ground?0:50));}
const e=ds.entities.add({id:String(i),polygon:{hierarchy:new C.PolygonHierarchy(positions),material:C.Color.BLUE.withAlpha(0.5),outline:true,outlineColor:C.Color.BLUE,...(ground?{height:0,heightReference:C.HeightReference.CLAMP_TO_GROUND}:{perPositionHeight:true})}});prepareSelectionEntity?.(C,e);items.push({entity:e,kind:i===0?'primary':'secondary'});
}
const pos=C.Cartesian3.fromDegrees(153,-27,ground?0:50),pixel=new Uint8Array(4),gl=v.scene.canvas.getContext('webgl2');const rendererInfo=gl.getExtension('WEBGL_debug_renderer_info');renderer=gl.getParameter(rendererInfo?rendererInfo.UNMASKED_RENDERER_WEBGL:gl.RENDERER);
function read(){const p=C.SceneTransforms.worldToWindowCoordinates(v.scene,pos);gl.readPixels(Math.round(p.x),gl.drawingBufferHeight-Math.round(p.y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];}
function until(test,timeout=15000){return new Promise((resolve,reject)=>{const start=performance.now();let frames=0;const remove=v.scene.postRender.addEventListener(()=>{frames++;const p=read();if(test(p)){remove();clearTimeout(timer);resolve({ms:performance.now()-start,frames,pixel:p})}});const timer=setTimeout(()=>{remove();reject(Error('pixel timeout '+JSON.stringify(read())))},timeout)});}
await until(p=>p[0]<20 && p[2]>30);const baseVisibleMs=Number((performance.now()-baseLoadStart).toFixed(2));await new Promise(r=>setTimeout(r,300));
async function renderCosts(){const costs=[],updates=[];const original=v.dataSourceDisplay.update;v.dataSourceDisplay.update=function(...args){const start=performance.now();try{return original.apply(this,args)}finally{updates.push(Number((performance.now()-start).toFixed(2)))}};let start;const removeStart=v.scene.preRender.addEventListener(()=>{start=performance.now()});await new Promise(resolve=>{const removeEnd=v.scene.postRender.addEventListener(()=>{costs.push(Number((performance.now()-start).toFixed(2)));if(costs.length===60){removeEnd();removeStart();resolve()}})});v.dataSourceDisplay.update=original;return {costs,updates};}
const unselectedCosts=await renderCosts();const unselectedRenderMs=unselectedCosts.costs,unselectedUpdateMs=unselectedCosts.updates;
if(${frameOnly}){results.push({count,vertices,ground,baseVisibleMs,unselectedRenderMs,unselectedUpdateMs});v.destroy();div.remove();continue;}
const samples=[];
for(let run=0;run<6;run++){
if(run){await syncSelectionOverlay(C,v,[]);await until(p=>p[0]<20 && p[2]>30);}
const visible=until(p=>p[0]>40 && p[1]>20);const start=performance.now();await syncSelectionOverlay(C,v,items);const prepareMs=performance.now()-start;const ready=await visible;samples.push({run,prepareMs:Number(prepareMs.toFixed(2)),visibleMs:Number(ready.ms.toFixed(2)),frames:ready.frames});
}
// Picking is separately timed so it cannot be confused with highlight rendering.
const screen=C.SceneTransforms.worldToWindowCoordinates(v.scene,pos);const pickStart=performance.now();v.scene.pick(screen);const gpuPickMs=performance.now()-pickStart;
const selectable=items.map(({entity})=>({key:entity.id,entity}));const exactStart=performance.now();const keys=collectKeysAtScreenPoint(C,v,selectable,screen,{longitude:C.Math.toRadians(153),latitude:C.Math.toRadians(-27)});const exactMs=performance.now()-exactStart;
const warmPicks=[];for(let i=0;i<5;i++){await new Promise(r=>{const remove=v.scene.postRender.addEventListener(()=>{remove();r()})});const start=performance.now();v.scene.pick(screen);warmPicks.push(Number((performance.now()-start).toFixed(2)));}
const primaryChanges=[];
for(let run=0;run<5;run++){
const previousPixel=read();const primary=run%2===1;
const next=items.map((item,i)=>({...item,kind:i===(primary?0:1)?'primary':'secondary'}));
const visible=until(p=>p[0]>40 && p[1]>15 && Math.abs(p[1]-previousPixel[1])>5);
const start=performance.now();await syncSelectionOverlay(C,v,next);const prepareMs=performance.now()-start;const ready=await visible;
primaryChanges.push({prepareMs:Number(prepareMs.toFixed(2)),visibleMs:Number(ready.ms.toFixed(2)),frames:ready.frames});
}
await new Promise(r=>setTimeout(r,300));const selectedCosts=await renderCosts();const selectedRenderMs=selectedCosts.costs,selectedUpdateMs=selectedCosts.updates;
const overlay=v.dataSources.getByName('tinyowl-selection')[0];const previous=new Set(overlay.entities.values);await syncSelectionOverlay(C,v,items);const retained=overlay.entities.values.filter(e=>previous.has(e)).length;

results.push({count,vertices,ground,baseVisibleMs,unselectedRenderMs,selectedRenderMs,unselectedUpdateMs,selectedUpdateMs,samples,primaryChanges,gpuPickMs:Number(gpuPickMs.toFixed(2)),candidateScanWithoutBoundsMs:Number(exactMs.toFixed(2)),warmPicks,unchangedSelectionEntitiesRetained:retained,hits:keys.length});v.destroy();div.remove();
}
return {renderer,results,errors};})()`,awaitPromise:true,returnByValue:true});
await fetch(debug+'/json/close/'+target.id);ws.close();
if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
console.log(JSON.stringify(result.result.value,null,2));
