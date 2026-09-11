// Requires a running Chromium debugging endpoint and this app's IIFE assets.
// Example: MAP_BROWSER_DEBUG=http://127.0.0.1:9222 MAP_UI_ORIGIN=http://localhost:5173 node scripts/map-zoom-browser-tests.mjs
import assert from 'node:assert/strict';
const debug=process.env.MAP_BROWSER_DEBUG ?? 'http://127.0.0.1:9222';
const origin=process.env.MAP_UI_ORIGIN ?? 'http://localhost:5173';
const target=await(await fetch(`${debug}/json/new?about:blank`,{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve=>ws.onopen=resolve);
let id=0;const pending=new Map();
ws.onmessage=event=>{const message=JSON.parse(event.data);if(!message.id)return;const callback=pending.get(message.id);pending.delete(message.id);message.error?callback.reject(message.error):callback.resolve(message.result);};
const send=(method,params)=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method,params}));});
try {
 await send('Runtime.evaluate',{expression:`new Promise((resolve,reject)=>{window.CESIUM_BASE_URL=${JSON.stringify(origin+'/cesium/')};const script=document.createElement('script');script.src=window.CESIUM_BASE_URL+'Cesium.js';script.onload=()=>resolve(true);script.onerror=()=>reject(Error('Cesium failed to load'));document.head.append(script);})`,awaitPromise:true});
 // A minimal primitive drives the real environment-map command lifecycle.
 // Repeated pre-update picks reproduce the camera-controller call order.
 const response=await send('Runtime.evaluate',{expression:"(async()=>{\nconst C=window.Cesium,results=[];\nfor(const translucent of [true,false]) {\n const div=document.createElement('div');div.style.cssText='position:fixed;inset:0;width:400px;height:400px;z-index:99999';document.body.append(div);\n const v=new C.Viewer(div,{globe:false,skyBox:false,skyAtmosphere:false,baseLayer:false,geocoder:false,animation:false,timeline:false,baseLayerPicker:false,requestRenderMode:false});\n v.scene.pickTranslucentDepth=translucent;\n const manager=new C.DynamicEnvironmentMapManager({mipmapLevels:3});manager.position=C.Cartesian3.fromDegrees(153,-27,100);\n const errors=[];v.scene.renderError.addEventListener((s,e)=>errors.push(String(e)));\n const primitive={update(fs){manager.update(fs)},isDestroyed(){return false},destroy(){manager.destroy()}};\n v.scene.primitives.add(primitive);\n v.camera.setView({destination:C.Cartesian3.fromDegrees(153,-27,1000)});\n let picks=0,attempts=0;const remove=v.scene.preUpdate.addEventListener(()=>{if(picks++>2 && picks<100){attempts++;try{v.scene.pickPosition(new C.Cartesian2(200+(picks%10),200));}catch(e){errors.push(String(e));}}});\n await new Promise(r=>setTimeout(r,7000));remove();results.push({translucent,frames:picks,attempts,errors,supported:C.DynamicEnvironmentMapManager.isDynamicUpdateSupported(v.scene)});v.destroy();div.remove();\n}\nreturn results;\n})()\n",awaitPromise:true,returnByValue:true});
 assert.equal(response.exceptionDetails,undefined);
 const results=response.result.value;
 assert.ok(results.every(result=>result.supported),'WebGL environment-map updates must be supported');
 assert.ok(results[0].errors.some(error=>error.includes('destroy')),'Baseline must reproduce the reported crash');
 assert.deepEqual(results[1].errors,[]);
 assert.ok(results[1].attempts>=90);
 console.log(JSON.stringify(results,null,2));
} finally {await fetch(`${debug}/json/close/${target.id}`);ws.close();}
