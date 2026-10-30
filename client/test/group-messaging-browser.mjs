// Run: node client/test/group-messaging-browser.mjs. Installed Chrome + local fixture only.
// All persistence/delays/failures below are synthetic; no Supabase connection.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profile = await mkdtemp(path.join(tmpdir(), 'wolfie-group-messaging-'))
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
  await until(async () => (await fetch('http://127.0.0.1:5178/test/group-messaging-preview.html')).ok, 'Vite startup')
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
 async function fill(selector,value){await click(q(selector));await send('Input.insertText',{text:value})}
 async function ready(){await until(()=>evaluate('!!document.querySelector("#dm-text")'),'chat ready')}
 async function groupRow(){return `document.querySelector('.dm-inbox li button')`}
 async function openGroup(){await until(()=>evaluate('!!document.querySelector(".dm-inbox li button")'),'saved group');await click(await groupRow());await ready()}
 async function screenshot(name){const result=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(profile,name),Buffer.from(result.data,'base64'))}
 async function reload(){const loaded=new Promise(resolve=>{onLoad=resolve});await send('Page.reload');await loaded;await until(()=>evaluate('!!window.groupFixture'))}
 const count=()=>evaluate('document.querySelectorAll(".dm-message").length')
 const user=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`
 const candidate=name=>`Array.from(document.querySelectorAll('.group-candidates label')).find(e=>e.textContent.includes(${JSON.stringify(name)})).querySelector('input')`
 await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Page.navigate',{url:'http://127.0.0.1:5178/test/group-messaging-preview.html'});await send('Page.bringToFront');await until(()=>evaluate('!!window.groupFixture'))
 for(const width of [1280,375]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===375});await evaluate('localStorage.clear()');await reload()
  await click(button('New group'));await until(()=>evaluate('!!document.querySelector("dialog[open] .group-candidates input")'))
  assert.equal(await evaluate(`${button('Create group')}.disabled`),true)
  await click(candidate('Friend Ada'));assert.equal(await evaluate(`${button('Create group')}.disabled`),true);await click(candidate('Friend Grace'));assert.equal(await evaluate(`${button('Create group')}.disabled`),false)
  assert.equal(await evaluate('document.querySelector(".group-candidates input").getBoundingClientRect().width'),18);assert.equal(await evaluate('document.querySelector("dialog[open]").scrollWidth<=document.querySelector("dialog[open]").clientWidth'),true);
  await fill('.group-picker input[placeholder="Name your group"]',`Study group ${width}`);await screenshot(`picker-${width}.png`)
  await evaluate('window.groupFixture.lost=true');await click(button('Create group'));await until(()=>evaluate(`!!${button('Retry creation')}`),'creation lost response');await click(button('Retry creation'));await ready();await until(()=>evaluate('document.activeElement.id==="dm-chat-heading"'),'chat focus');assert.equal(await evaluate('document.querySelectorAll("dialog[open]").length'),0);assert.equal(await evaluate('JSON.parse(localStorage.getItem("group-fixture-data")).groups.length'),1)
  await fill('#dm-text','Earlier private group text 😀\n<b>literal</b>');await key('Enter');await until(async()=>await count()===1);assert.equal(await evaluate('document.querySelectorAll(".dm-message b").length'),0)
  await click(button('Add members'));await until(()=>evaluate('!!document.querySelector("dialog[open] .group-candidates input")'));await click(candidate('Later Friend Dana'));await evaluate('window.groupFixture.closed=true');await click(button('Add selected members'));await until(()=>evaluate('document.querySelector("dialog[open]").textContent.includes("closed new messages")'),'closure after selection');await evaluate('window.groupFixture.closed=false;window.groupFixture.unfriend=true');await click(button('Retry adding members'));await until(()=>evaluate('document.querySelector("dialog[open]").textContent.includes("Accepted friendship unavailable")'),'unfriend after selection');await evaluate('window.groupFixture.unfriend=false');await click(button('Retry adding members'));await until(()=>evaluate('!document.querySelector("dialog[open]")'))
  await evaluate(`window.groupFixture.switchAccount('${user(4)}')`);await openGroup();assert.equal(await count(),0,'later member no earlier text');assert.equal(await evaluate(`!!${button('Add members')}`),false);assert.equal(await evaluate('document.body.textContent.includes("Earlier private group text")'),false)
  await fill('#dm-text','Reply from later friend');await key('Enter');await until(async()=>await count()===1);await screenshot(`later-member-${width}.png`)
  await evaluate(`window.groupFixture.switchAccount('${user(1)}')`);await openGroup();await until(async()=>await count()===2)
  await evaluate('window.groupFixture.lost=true');await fill('#dm-text','Retry this text once');await click(button('Send'));await until(()=>evaluate(`!!${button('Retry send')}`));await click(button('Retry send'));await until(async()=>await count()===3)
  await click(button('Dashboard'));await evaluate('window.groupFixture.incoming()');await until(()=>evaluate('!!document.querySelector(".dm-nav-unread")'),'group notification outside messages');await screenshot(`notification-${width}.png`)
  await click('document.querySelector(".app-nav button:nth-child(2)")');await until(()=>evaluate('!!document.querySelector(".dm-conversation-unread")'),'unread group');await openGroup();await until(async()=>await count()===4);await until(()=>evaluate('!document.querySelector(".dm-nav-unread")'),'read clears')
  await reload();await openGroup();await until(async()=>await count()===4,'reload persistence')
  await evaluate('window.groupFixture.seed()');await until(async()=>await count()===70,'multi-page catchup');await click(button('Back to conversations'));await openGroup();await until(async()=>await count()===50)
  await evaluate('document.querySelector(".dm-history").scrollTop=0;document.querySelector(".dm-history").dispatchEvent(new Event("scroll"))');await click(button('Load older messages'));await until(async()=>await count()===70)
  assert.ok(await evaluate('document.querySelector(".dm-history").scrollTop')>0,'older anchor preserved')
  await evaluate('document.querySelector(".dm-history").scrollTop=120;document.querySelector(".dm-history").dispatchEvent(new Event("scroll"))');const scroll=await evaluate('document.querySelector(".dm-history").scrollTop');await evaluate('window.groupFixture.incoming()');await until(async()=>await count()===71);assert.equal(await evaluate('document.querySelector(".dm-history").scrollTop'),scroll)
  await screenshot(`chat-${width}.png`);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true)
  await click(button('New messages — jump to latest'));
  await click('document.querySelector(".group-actions summary")');await click(button('Remove Friend Ada'));await click(button('Cancel removal'));assert.equal(await evaluate('JSON.parse(localStorage.getItem("group-fixture-data")).groups[0].detail.members.length'),4);
  await click(button('Remove Friend Ada'));await screenshot(`remove-confirm-${width}.png`);await click(button('Confirm removal'));await until(()=>evaluate(`!${button('Remove Friend Ada')}`),'removed member disappears');assert.equal(await count(),71,'removed sender texts retained');
  await evaluate(`window.groupFixture.switchAccount('${user(2)}')`);await until(()=>evaluate('!document.querySelector(".dm-inbox li button")'),'removed member no inbox');assert.equal(await count(),0);
  await evaluate(`window.groupFixture.switchAccount('${user(1)}')`);await openGroup();await evaluate('window.groupFixture.hold=true');await fill('#dm-text','Old private pending draft');await click(button('Send'));await until(()=>evaluate('!!window.groupFixture.release'));await evaluate(`window.groupFixture.switchAccount('${user(5)}');window.groupFixture.release();window.groupFixture.hold=false`);await sleep(100);assert.equal(await count(),0);assert.equal(await evaluate('!!document.querySelector("#dm-text")'),false)
  console.log(`PASS group ${width}px: create/retry, native focus, min friends, creator-only add, closure race, post-join privacy, multi-sender/reload, unread, paging/scroll, creator removal/retained history, account teardown`)
 }
 assert.deepEqual(alerts,[]);console.log(`Screenshots: ${profile}`);await send('Browser.close')
}finally{ws?.close();chrome.kill();vite.kill()}
