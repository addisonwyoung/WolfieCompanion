// Synthetic native Chrome check; no real accounts or shared database.
// Run with Node 22+: node client/test/classmate-browser.mjs
import {spawn} from 'node:child_process'
import {mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const client=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const profile=await mkdtemp(path.join(tmpdir(),'wolfie-peer-browser-'))
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5181','--strictPort'],{cwd:client,stdio:'ignore'})
const chrome=spawn(process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--disable-background-networking','about:blank'],{stdio:'ignore'})
let ws
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn){for(let n=0;n<600;n++){try{const value=await fn();if(value)return value}catch{}await sleep(50)}throw Error('Timed out')}
try{
 await until(async()=>(await fetch('http://127.0.0.1:5181/test/classmate-preview.html')).ok)
 const port=await until(async()=>(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0])
 const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject})
 let id=0,onLoad;const pending=new Map()
 ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.method==='Page.loadEventFired')onLoad?.();if(message.id){const job=pending.get(message.id);pending.delete(message.id);message.error?job.reject(Error(message.error.message)):job.resolve(message.result)}}
 function send(method,params={}){return new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method,params}))})}
 async function evaluate(expression){const data=await send('Runtime.evaluate',{expression,returnByValue:true});if(data.exceptionDetails)throw Error(JSON.stringify(data.exceptionDetails));return data.result.value}
 async function reload(){const loaded=new Promise(resolve=>{onLoad=resolve});await send('Page.reload');await loaded;onLoad=null;await until(()=>evaluate('!!document.querySelector(".student-card button")'))}
 async function key(key,code=key,modifiers=0){const virtualKey={Tab:9,Enter:13,Escape:27}[key];const params={key,code,modifiers,windowsVirtualKeyCode:virtualKey,nativeVirtualKeyCode:virtualKey};await send('Input.dispatchKeyEvent',{type:'keyDown',...params,text:key==='Enter'?'\r':undefined});await send('Input.dispatchKeyEvent',{type:'keyUp',...params})}
 await send('Page.enable');await send('Page.navigate',{url:'http://127.0.0.1:5181/test/classmate-preview.html'});await send('Page.bringToFront')
 await until(()=>evaluate('!!document.querySelector(".student-card button")'))
 for(const width of [1280,375]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:width===375})
  await evaluate('localStorage.removeItem("profile-sharing-fixture")');await reload()
  await evaluate('document.querySelector(".student-card button").focus()');await key('Enter')
  await until(()=>evaluate('!!document.querySelector("dialog[open] h3")'))
  assert.equal(await evaluate('document.querySelector("dialog").textContent.includes("Graduate")'),false)
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Close profile')
  await key('Tab');assert.equal(await evaluate('document.activeElement.closest("dialog")!==null'),true)
  await key('Tab','Tab',8);assert.equal(await evaluate('document.activeElement.closest("dialog")!==null'),true)
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true)
  const image=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(profile,`profile-${width}.png`),Buffer.from(image.data,'base64'))
  await key('Escape');await until(()=>evaluate('!document.querySelector("dialog[open]")'))
  assert.equal(await evaluate('document.activeElement.textContent'),'View profile')
  await evaluate('document.querySelector(".edit-button").click()')
  await until(()=>evaluate('!!document.querySelector(".sharing-choice input")'))
  assert.equal(await evaluate('Array.from(document.querySelectorAll(".sharing-choice input")).every(el=>!el.checked)'),true)
  await evaluate('document.querySelector(".sharing-choice input").click();document.querySelector(".profile button[type=submit]").click()')
  await until(()=>evaluate('!!document.querySelector(".edit-button")'))
  await reload()
  await evaluate('document.querySelector(".student-card button").click()');await until(()=>evaluate('document.querySelector("dialog")?.textContent.includes("Graduate")'))
  assert.equal(await evaluate('document.querySelector("dialog").textContent.includes("Interests")'),false)
  await key('Escape');await until(()=>evaluate('!document.querySelector("dialog[open]")'))
  await evaluate('document.querySelector(".edit-button").click()');await until(()=>evaluate('!!document.querySelector(".sharing-choice input")'))
  assert.equal(await evaluate('document.querySelector(".sharing-choice input").checked'),true)
  await evaluate('document.querySelector(".sharing-choice input").click();document.querySelector(".profile button[type=submit]").click()');await until(()=>evaluate('!!document.querySelector(".edit-button")'))
  await evaluate('document.querySelector(".student-card button").click()');await until(()=>evaluate('!!document.querySelector("dialog h3")'))
  assert.equal(await evaluate('document.querySelector("dialog").textContent.includes("Graduate")'),false)
  await key('Escape');await until(()=>evaluate('!document.querySelector("dialog[open]")'))
  console.log(`PASS ${width}px: native modal, keyboard close/focus, private defaults, sharing reload and revocation`)
 }
 console.log(`Screenshots: ${profile}`);await send('Browser.close')
}finally{ws?.close();chrome.kill();vite.kill()}
