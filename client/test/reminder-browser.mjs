// Run: node client/test/group-messaging-browser.mjs. Installed Chrome + local fixture only.
// All persistence/delays/failures below are synthetic; no Supabase connection.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profile = await mkdtemp(path.join(tmpdir(), 'wolfie-reminders-'))
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
  await until(async () => (await fetch('http://127.0.0.1:5178/test/reminder-preview.html')).ok, 'Vite startup')
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
  const button = (name, scope = 'document') => `Array.from(${scope}.querySelectorAll('button')).find(element => element.textContent.replace('↗','').trim().replace(/^\\+\\s*/, '') === ${JSON.stringify(name)} || element.getAttribute('aria-label') === ${JSON.stringify(name)})`
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
 async function screenshot(name){const result=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(profile,name),Buffer.from(result.data,'base64'))}
 async function reload(){const loaded=new Promise(resolve=>{onLoad=resolve});await send('Page.reload');await loaded;await until(()=>evaluate('!!window.reminderFixture'))}
 await send('Page.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Page.navigate',{url:'http://127.0.0.1:5178/test/reminder-preview.html'});await send('Page.bringToFront');await until(()=>evaluate('!!window.reminderFixture'))
 for(const width of [1280,375]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===375});await evaluate('localStorage.clear()');await reload();
  await click(button('Notifications'));await until(()=>evaluate('document.body.textContent.includes("No reminders")'));await click(button('Reminder settings'));await until(()=>evaluate('!!document.querySelector("dialog[open]")'));await screenshot(`settings-${width}.png`);
  await evaluate("document.querySelector('dialog button[type=submit],dialog button.primary').focus()");await key('Tab');assert.equal(await evaluate("document.activeElement===document.querySelector('dialog input')"),true,'native focus wraps');await key('Tab',8);assert.equal(await evaluate("document.activeElement===document.querySelector('dialog button.primary')"),true,'reverse focus wraps');await click(button('Cancel'));
  await evaluate('window.reminderFixture.arrive(25)');await until(()=>evaluate('document.querySelector(".notification-trigger").textContent.includes("25")'));await click('document.querySelector(".notification-trigger")');await until(()=>evaluate('document.querySelectorAll(".reminder-open").length===20'));await screenshot(`dropdown-${width}.png`);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  await click(button('Load more reminders'));await until(()=>evaluate('document.querySelectorAll(".reminder-open").length===25'));await click('document.querySelector(".reminder-open")');await until(()=>evaluate('!!document.querySelector("dialog[open]")'));await until(()=>evaluate('document.querySelector(".notification-trigger").textContent.includes("24")'));await click(button('Close'));await reload();await until(()=>evaluate('document.querySelector(".notification-trigger").textContent.includes("24")'));
  await click('document.querySelector(".notification-trigger")');await click('document.querySelector(".reminder-open")');await until(()=>evaluate(`!!${button('View item')}&&!${button('View item')}.disabled`));await click(button('View item'));await until(()=>evaluate('!!document.querySelector("dialog[open] input[name=title]")'));assert.equal(await evaluate('document.querySelector("input[name=title]").value'),'Exam on distributed systems');await click(button('Cancel'));
  await click('document.querySelector(".notification-trigger")');await evaluate('window.reminderFixture.failClear=true');await click(button('Clear all'));await until(()=>evaluate('document.body.textContent.includes("Offline: clear")'));await evaluate('window.reminderFixture.arrive()');await click(button('Retry clear all'));await until(()=>evaluate('document.querySelectorAll(".reminder-open").length===1'));await reload();await click('document.querySelector(".notification-trigger")');await until(()=>evaluate('document.querySelectorAll(".reminder-open").length===1'));
  await click('document.querySelector(".reminder-open")');await until(()=>evaluate(`!!${button('View item')}&&!${button('View item')}.disabled`));await click(button('View item'));await until(()=>evaluate('!!document.querySelector("dialog[open] input[name=title]")'));await evaluate("{const input=document.querySelector('dialog input[type=date]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'2026-11-12');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}");await click(button('Save item'));await until(()=>evaluate('!document.querySelector("dialog[open]")'));await click('document.querySelector(".notification-trigger")');await until(()=>evaluate('document.body.textContent.includes("No reminders")'));await key('Escape');
  await evaluate('window.reminderFixture.arrive()');await click('document.querySelector(".notification-trigger")');await until(()=>evaluate('document.querySelectorAll(".reminder-open").length===1'));
  await evaluate('window.reminderFixture.hold=true');await click('document.querySelector(".notification-dropdown li > button:last-child")');await until(()=>evaluate('!!window.reminderFixture.release'));await evaluate('window.reminderFixture.switchAccount("two");window.reminderFixture.release();window.reminderFixture.hold=false');await until(()=>evaluate('document.body.textContent.includes("Account two")'));await click('document.querySelector(".notification-trigger")');await until(()=>evaluate('document.body.textContent.includes("No reminders")'));
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);console.log(`PASS reminders ${width}px: settings, arrival, pagination, read/reload, details/item editor, bounded retry clear, persistence, account teardown`)
 }
 assert.deepEqual(alerts,[]);console.log(`Screenshots: ${profile}`);await send('Browser.close')
}finally{ws?.close();chrome.kill();vite.kill()}
