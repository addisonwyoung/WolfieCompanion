// Run: node client/test/academic-browser.mjs. Installed Chrome + local fixture only.
// All persistence/delays/failures below are synthetic; no Supabase connection.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profile = await mkdtemp(path.join(tmpdir(), 'wolfie-messaging-'))
const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5178', '--strictPort'], { cwd: client, windowsHide: true, stdio: 'ignore' })
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let ws
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(fn, label = 'local render') {
  for (let n = 0; n < 600; n++) { try { const result = await fn(); if (result) return result } catch { /* wait for startup/render */ } await sleep(50) }
  throw new Error(`Timed out: ${label}`)
}
try {
  await until(async () => (await fetch('http://127.0.0.1:5178/test/messaging-preview.html')).ok, 'Vite startup')
  const port = await until(async () => (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0], 'Chrome startup')
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let id = 0, onLoad
  const pending = new Map(), alerts = []
  ws.onmessage = event => {
    const data = JSON.parse(event.data)
    if (data.method === 'Page.loadEventFired') onLoad?.()
    if (data.method === 'Page.javascriptDialogOpening') { alerts.push(data.params.type); void send('Page.handleJavaScriptDialog', { accept: false }) }
    if (data.id) { const handler = pending.get(data.id); pending.delete(data.id); if (data.error) handler.reject(new Error(data.error.message)); else handler.resolve(data.result) }
  }
  function send(method, params = {}) { return new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); ws.send(JSON.stringify({ id: next, method, params })) }) }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const q = selector => `document.querySelector(${JSON.stringify(selector)})`
  const button = (name, scope = 'document') => `Array.from(${scope}.querySelectorAll('button')).find(element => element.textContent.replace('↗','').trim().replace(/^\\+\\s*/, '') === ${JSON.stringify(name)} || element.getAttribute('aria-label') === ${JSON.stringify(name)})`
  const dlg = q('dialog[open]')
  async function click(expression) {
    await evaluate(`{const element=${expression}; if(!element)throw Error('Missing click target: '+document.body.innerText); element.scrollIntoView({block:'nearest'});}`)
    // Let the initiating scroll/resize settle before opening an anchored menu.
    await sleep(60)
    const box = await evaluate(`(()=>{const r=${expression}.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...box, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...box, button: 'left', clickCount: 1 })
    await sleep(35)
  }
  async function key(key, modifiers = 0) {
    const virtualKey = { Tab: 9, Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35, ' ': 32 }[key]
    const params = { key, code: key === ' ' ? 'Space' : key, modifiers, windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey }
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params, text: key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
    await sleep(25)
  }
 async function fill(value){await click(q('#dm-text'));await send('Input.insertText',{text:value})}
 async function ready(){await until(()=>evaluate(`!!${q('#dm-text')}&&!${q('#dm-text')}.disabled`),'ready composer')}
 async function profileChat(kind='classmate'){await click(button('Profiles'));await click(button(`View ${kind} profile`));await until(()=>evaluate(`!!${button('Message')}&&!${button('Message')}.disabled`),'profile message');await click(button('Message'));await ready();await until(()=>evaluate('document.activeElement.id==="dm-chat-heading"'),'chat focus');assert.equal(await evaluate(`!!${dlg}`),false)}
 async function screenshot(name){const result=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(profile,name),Buffer.from(result.data,'base64'))}
 async function reload(){const loaded=new Promise(resolve=>{onLoad=resolve});await send('Page.reload');await loaded;await until(()=>evaluate(`!!${button('Profiles')}`))}
 const count=()=>evaluate('document.querySelectorAll(".dm-message").length')
 await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Page.navigate',{url:'http://127.0.0.1:5178/test/messaging-preview.html'});await send('Page.bringToFront');await until(()=>evaluate('!!window.messagingFixture'))
 for(const width of [1280,375]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===375})
  await evaluate('localStorage.clear()');await reload();await profileChat()
  const body='<img src=x onerror=alert(1)>\nHello 😀 '+width
  await fill(body);await key('Enter');await until(()=>evaluate(`${q('#dm-text')}.value===''`),'keyboard send')
  assert.equal(await evaluate('document.querySelector(".dm-send").getBoundingClientRect().width'),44);
  assert.equal(await count(),1);assert.equal(await evaluate('document.querySelectorAll(".dm-message img").length'),0);assert.equal(await evaluate(`${q('.dm-message p')}.textContent`),body)
  await fill('Discard on close');await click(button('Back to conversations'));await click(button('Profiles'));await profileChat();assert.equal(await evaluate(`${q('#dm-text')}.value`),'');assert.equal(await count(),1)
  await reload();await click(button('Inbox'));await click(`document.querySelector('.dm-inbox li button')`);await ready();assert.equal(await count(),1,'saved through reload')
  await evaluate('window.messagingFixture.incoming()');await until(async()=>await count()===2,'incoming refresh')
  await evaluate('window.messagingFixture.lost=true');await fill('Lost acknowledgement');await click(button('Send'));await until(()=>evaluate(`!!${button('Retry send')}`),'failed send');assert.equal(await evaluate(`${q('#dm-text')}.readOnly`),true)
  await click(button('Retry send'));await until(()=>evaluate(`${q('#dm-text')}.value===''`));assert.equal(await count(),3,'idempotent retry')
  await screenshot(`chat-${width}.png`)
  await click(button('Recipient settings'));await click(button('Edit profile'))
  // Locate the actual setting by label; no synthetic direct mutation substitutes for Save.
  await click(`Array.from(document.querySelectorAll('label')).find(e=>e.textContent.includes('Allow new direct messages')).querySelector('input')`);await click(button('Save'));await until(()=>evaluate(`!!${button('Edit profile')}`))
  await profileChat();await fill('Existing continues');await click(button('Send'));await until(async()=>await count()===4)
  // A fresh fixture account has no established conversation with the closed recipient.
  await evaluate('window.messagingFixture.switchAccount()');await click(button('View classmate profile'));await until(()=>evaluate(`${button('Message')}?.disabled`),'new conversation closed');assert.equal(await evaluate(`${button('Message')}.disabled`),true)
  await key('Escape');await profileChat('friend');await fill('Friend first message');await click(button('Send'));await until(async()=>await count()===1);await screenshot(`friend-${width}.png`)
  await evaluate('window.messagingFixture.switchAccount()');await profileChat();await until(async()=>await count()===4,'reopened saved history');await evaluate('window.messagingFixture.seed()');await until(async()=>await count()===65,'catch-up long history')
  await click(button('Back to conversations'));await click(`document.querySelector('.dm-inbox li button')`);await ready();await until(async()=>await count()===50)
  await evaluate(`${q('.dm-history')}.scrollTop=0;${q('.dm-history')}.dispatchEvent(new Event('scroll'))`)
  await click(button('Load older messages'));await until(async()=>await count()===65,'older page')
  assert.ok(await evaluate(`${q('.dm-history')}.scrollTop`)>0,'older page preserves visual anchor')
  await evaluate(`${q('.dm-history')}.scrollTop=120;${q('.dm-history')}.dispatchEvent(new Event('scroll'))`)
  const scroll=await evaluate(`${q('.dm-history')}.scrollTop`);await evaluate('window.messagingFixture.incoming()');await until(async()=>await count()===66)
  assert.equal(await evaluate(`${q('.dm-history')}.scrollTop`),scroll,'incoming preserves reader scroll');assert.equal(await evaluate(`!!${button('New messages — jump to latest')}`),true)
  await screenshot(`history-${width}.png`);await click(button('New messages — jump to latest'))
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'no horizontal page overflow')
  await evaluate('window.messagingFixture.hold=true');await fill('Old pending private draft');await click(button('Send'));await until(()=>evaluate('!!window.messagingFixture.release'))
  await evaluate('window.messagingFixture.switchAccount();window.messagingFixture.release();window.messagingFixture.hold=false');await sleep(100)
  assert.equal(await evaluate('!!document.querySelector("#dm-text")'),false);assert.equal(await evaluate('document.body.textContent.includes("Old pending private draft")'),false);assert.equal(await evaluate(`!!${dlg}`),false)
  console.log(`PASS ${width}px: native profile handoff/focus, friend/non-friend sends, Unicode literal text, reload, incoming, retry, settings, paging, scroll, account teardown`)
 }
 assert.deepEqual(alerts,[]);console.log(`Screenshots: ${profile}`);await send('Browser.close')
}finally{ws?.close();chrome.kill();vite.kill()}
