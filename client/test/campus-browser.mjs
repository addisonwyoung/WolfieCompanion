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
 ws.onmessage=event=>{const data=JSON.parse(event.data);if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.text);if(data.id){const p=pending.get(data.id);pending.delete(data.id);data.error?p.reject(Error(JSON.stringify(data.error))):p.resolve(data.result)}}
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method,params}))})
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value}
 await send('Runtime.enable');await send('Page.enable');await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true})
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
 // No external network is needed; do not contact Supabase or MapTiler.
 await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*://*.supabase.co/*','*://api.maptiler.com/*']})
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
 assert.deepEqual(errors,[])
 console.log(`Screenshots: ${profile}`)
 await send('Browser.close')
} finally {ws?.close();chrome.kill();vite.kill()}
