// Run from repo root: node client/test/campus-browser.mjs.
// Existing Chrome/CDP approach, synthetic resources only; no hosted services.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const root = process.cwd(), profile = await mkdtemp(path.join(tmpdir(), 'wolfie-campus-browser-'))
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5179','--strictPort'], { cwd: path.join(root,'client'), windowsHide:true, stdio:'ignore' })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--disable-background-networking','about:blank'], { windowsHide:true, stdio:'ignore' })
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms))
async function until(fn) { for(let n=0;n<100;n++){try{const value=await fn();if(value)return value}catch{ /* allow rendering/startup */ }await sleep(60)}throw Error('Browser check timed out') }
let ws
try {
 await until(async()=> (await fetch('http://127.0.0.1:5179/test/campus-preview.html')).ok)
 const port=await until(async()=> (await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0])
 const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject})
 let id=0;const pending=new Map(), errors=[]
 ws.onmessage=event=>{const data=JSON.parse(event.data);if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.text);if(data.method==='Fetch.requestPaused')void respond(data.params).catch(error=>errors.push(error.message));if(data.id){const p=pending.get(data.id);pending.delete(data.id);data.error?p.reject(Error(JSON.stringify(data.error))):p.resolve(data.result)}}
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method,params}))})
 let styleRequests=0
 async function respond({requestId,request}) {
  const url=new URL(request.url)
  if(url.pathname==='/maps/offline-fixture/style.json'){
   assert.equal(url.searchParams.get('key'),'offline-fixture-key')
   styleRequests++
   const style={version:8,sources:{fixture:{type:'geojson',attribution:'<img src="invalid" onload="1" onerror="window.badAttribution=true">',data:{type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-73.13,40.91],[-73.116,40.91],[-73.116,40.92],[-73.13,40.92],[-73.13,40.91]]]}}]}}},layers:[{id:'background',type:'background',paint:{'background-color':'#a6cee3'}},{id:'fixture-vector',type:'fill',source:'fixture',paint:{'fill-color':'#6aaa72'}}]}
   await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(JSON.stringify(style)).toString('base64')})
  }else if(url.pathname==='/resources/logo.svg'){
   await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/svg+xml'}],body:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="25"><text x="0" y="18">MapTiler</text></svg>').toString('base64')})
  }else await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'})
 }
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value}
 await send('Runtime.enable');await send('Page.enable');await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true})
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
 // No external network is needed; do not contact Supabase or MapTiler.
 await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*://*.supabase.co/*']})
 await send('Fetch.enable',{patterns:[{urlPattern:'https://api.maptiler.com/*'}]})
 for(const width of [375,1280]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:width===375})
  await send('Emulation.setTouchEmulationEnabled',{enabled:width===375})
  await send('Page.navigate',{url:'http://127.0.0.1:5179/test/campus-preview.html'})
  await until(()=>evaluate('document.querySelectorAll(".campus-pin").length===100'))
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'no page overflow')
  assert.equal(await evaluate('document.querySelectorAll(".campus-location-list li").length'),100)
  await evaluate('window.savedPin=document.querySelector(".campus-pin");document.querySelector(".campus-pin").focus()')
  await sleep(300)
  await until(()=>evaluate('!!document.querySelector(".leaflet-tooltip")'))
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'})
  await until(()=>evaluate('!document.querySelector(".leaflet-tooltip")'))
  // A pointer hover also opens the preview; moving onto it must keep it open.
  await evaluate('document.querySelector(".campus-pin").blur()')
  const hoverPoint=await evaluate('(()=>{const e=document.querySelector(".campus-pin");e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x+16,y:r.y+16}})()')
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...hoverPoint})
  await until(()=>evaluate('!!document.querySelector(".leaflet-tooltip")'))
  const tip=await evaluate('(()=>{const r=document.querySelector(".leaflet-tooltip").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...tip})
  await sleep(250)
  assert.equal(await evaluate('!!document.querySelector(".leaflet-tooltip")'),true,'hover preview stays reachable')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'})
  await until(()=>evaluate('!document.querySelector(".leaflet-tooltip")'))
  await evaluate('document.querySelector(".campus-location-list button").focus()')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
  await until(()=>evaluate('!!document.querySelector(".campus-details")'))
  assert.equal(await evaluate('document.activeElement===document.querySelector(".campus-details")'),true)
  assert.equal(await evaluate('document.querySelectorAll(".campus-coincident button").length'),1)
  if(width===375){
   const rect=await evaluate('(()=>{const e=document.querySelector(".campus-coincident button");e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[rect]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  }else await evaluate('document.querySelector(".campus-coincident button").click()')
  await until(()=>evaluate('document.querySelector("#campus-detail-heading").textContent==="Library water"'))
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  await writeFile(path.join(profile,`details-${width}.png`),Buffer.from(shot.data,'base64'))
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'})
  await until(()=>evaluate('!document.querySelector(".campus-details")'))
  await evaluate('document.querySelector(".leaflet-container").focus()')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39})
  await sleep(350)
  await evaluate('document.querySelector(".campus-return").click()')
  assert.equal(await evaluate('window.savedPin===document.querySelector(".campus-pin")'),true,'pan/return preserves marker DOM')
  assert.equal(await evaluate('window.campusFixture.loads'),1,'pan/selection does not refetch')
  await evaluate('document.querySelector(".campus-legend input").click()')
  await until(()=>evaluate('document.querySelectorAll(".campus-pin").length===81'))
  assert.equal(await evaluate('document.querySelectorAll(".campus-location-list li").length'),81)
  await evaluate('document.querySelector(".campus-legend > button").click();window.scrollTo(0,0)')
  await until(()=>evaluate('document.querySelectorAll(".campus-pin").length===100'))
  const initial=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  await writeFile(path.join(profile,`overview-${width}.png`),Buffer.from(initial.data,'base64'))
  console.log(`PASS ${width}px: 100 markers/list, focus preview, Escape, keyboard details, coincident selection, filters, no refetch or marker replacement on pan.`)
 }
 // Exercise the real 6.4.1 renderer/worker via a fully intercepted vector style.
 for (const vectorWidth of [375,1280]) {
 await send('Emulation.setDeviceMetricsOverride',{width:vectorWidth,height:850,deviceScaleFactor:1,mobile:vectorWidth===375})
 await send('Emulation.setTouchEmulationEnabled',{enabled:vectorWidth===375})
 await send('Page.navigate',{url:'http://127.0.0.1:5179/test/campus-preview.html?vector=1'})
 await until(()=>evaluate('document.querySelectorAll(".campus-pin").length===100 && !!document.querySelector(".maplibregl-canvas")'))
 await until(()=>styleRequests>0)
 await sleep(1800)
 assert.equal(await evaluate('!!document.querySelector(".campus-tile-error")'),false,'vector renderer has no error')
 assert.equal(await evaluate('!!window.badAttribution || !!document.querySelector("img[src=invalid]")'),false,'remote attribution never becomes HTML')
 assert.equal(await evaluate('document.querySelector(".leaflet-control-attribution").textContent.includes("MapTiler") && document.querySelector(".leaflet-control-attribution").textContent.includes("OpenStreetMap")'),true)
 await evaluate('window.savedPin=document.querySelector(".campus-pin"); document.querySelector(".leaflet-control-zoom-in").click()')
 await sleep(400)
 await evaluate('document.querySelector(".campus-return").click()')
 assert.equal(await evaluate('window.savedPin===document.querySelector(".campus-pin") && window.campusFixture.loads===1'),true,'vector zoom/return preserves markers and data')
 const vectorShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
 await writeFile(path.join(profile,`vector-${vectorWidth}.png`),Buffer.from(vectorShot.data,'base64'))
 console.log(`PASS real MapLibre 6.4.1 renderer/worker at ${vectorWidth}px: intercepted GeoJSON vector style, zoom/return, markers and fixed attribution; no live provider access.`)
 }
 // Editor acceptance uses the same real Leaflet map with in-memory CRUD only.
 for (const editorWidth of [375,1280]) {
  await send('Emulation.setDeviceMetricsOverride',{width:editorWidth,height:850,deviceScaleFactor:1,mobile:editorWidth===375})
  await send('Emulation.setTouchEmulationEnabled',{enabled:false})
  await send('Page.navigate',{url:'http://127.0.0.1:5179/test/campus-preview.html?editor=1'})
  await until(()=>evaluate('!!Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Manage locations")'))
  const button = async text => {
   await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(text)});if(!b || b.disabled)throw Error('Button unavailable');b.focus()})()`)
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'})
   await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
  }
  const fill = async (label,value) => evaluate(`(()=>{const label=Array.from(document.querySelectorAll('dialog label')).find(l=>l.childNodes[0].textContent===${JSON.stringify(label)});const e=label.querySelector('input,textarea,select');const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`)
  await button('Manage locations'); await button('Add location')
  await until(()=>evaluate('!!document.querySelector(".campus-use-center")'))
  assert.equal(await evaluate('document.activeElement===document.querySelector(".leaflet-container")'),true,'placement focuses keyboard map')
  // Existing resource markers, zoom/reset controls never capture a position.
  await evaluate('document.querySelector(".campus-pin").click();document.querySelector(".leaflet-control-zoom-in").click();document.querySelector(".campus-return").click()')
  assert.equal(await evaluate('!!document.querySelector("dialog") || window.campusFixture.saves>0'),false,'marker/control clicks do not place or save')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39})
  await button('Use map center')
  await until(()=>evaluate('!!document.querySelector("dialog[open]")'))
  assert.equal(await evaluate('document.activeElement===document.querySelector("dialog input")'),true,'editor initial focus')
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth && document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth'),true,'responsive editor has no horizontal overflow')
  await evaluate('Array.from(document.querySelectorAll("dialog button")).find(b=>b.textContent==="Cancel").focus()')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  assert.equal(await evaluate('document.activeElement.textContent'),'Reposition on map','dialog traps keyboard focus')
  await fill('Name','Local browser draft'); await fill('Directions','Synthetic directions')
  const editorShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  await writeFile(path.join(profile,`editor-${editorWidth}.png`),Buffer.from(editorShot.data,'base64'))
  await button('Reposition on map')
  await until(()=>evaluate('!document.querySelector("dialog")'))
  await button('Use map center')
  assert.equal(await evaluate('document.querySelector("dialog input").value'), 'Local browser draft','reposition retains fields')
  await button('Save location')
  await until(()=>evaluate('window.campusFixture.saves===1 && !document.querySelector("dialog")'))
  assert.equal(await evaluate('window.campusFixture.lastSaved.status'), 'draft')
  assert.equal(await evaluate('window.campusFixture.lastSaved.description'), null)
  // Open the saved record by keyboard, publish, return to draft, then remove it.
  await evaluate('Array.from(document.querySelectorAll(".campus-location-list button")).find(b=>b.textContent.includes("Local browser draft")).focus()')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
  await button('Edit location')
  await fill('Source note','Synthetic test provenance'); await button('Verify now'); await fill('Publication','published'); await button('Save location')
  await until(()=>evaluate('window.campusFixture.saves===2 && !document.querySelector("dialog")'))
  assert.equal(await evaluate('window.campusFixture.lastSaved.status'), 'published')
  await button('Edit location'); await fill('Publication','draft'); await button('Save location')
  await until(()=>evaluate('window.campusFixture.saves===3 && !document.querySelector("dialog")'))
  await evaluate('Array.from(document.querySelectorAll(".campus-location-list button")).find(b=>b.textContent.includes("Local browser draft")).click()')
  await button('Edit location'); await button('Delete location'); await button('Keep editing')
  assert.equal(await evaluate('window.campusFixture.removes'),0,'cancel removal performs no write')
  await button('Delete location'); await button('Confirm delete')
  await until(()=>evaluate('window.campusFixture.removes===1 && !document.querySelector("dialog")'))
  assert.equal(await evaluate('document.querySelectorAll(".campus-location-list li").length'),100)
  await button('Add location')
  // Real background pointer click captures a position without manually entering coordinates.
  const point=await evaluate('(()=>{const e=document.querySelector(".leaflet-container");e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x+190,y:r.y+200}})()')
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point})
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})
  await until(()=>evaluate('!!document.querySelector("dialog[open]")'))
  await button('Cancel'); await button('Discard changes')
  assert.equal(await evaluate('window.campusFixture.saves'),3,'cancel placement performs no save')
  assert.equal(await evaluate('document.activeElement.textContent'), 'Add location','cancel restores focus')
  console.log(`PASS editor ${editorWidth}px: keyboard CRUD/publish/unpublish, reposition, real background capture, marker/control guards, draft default, cancel/confirmation, focus and responsive dialog; synthetic data only.`)
 }
 assert.deepEqual(errors,[])
 console.log(`Screenshots: ${profile}`)
 await send('Browser.close')
} finally {ws?.close();chrome.kill();vite.kill()}
