// Run: node client/test/academic-browser.mjs. Installed Chrome + local fixture only.
// All persistence/delays/failures below are synthetic; no Supabase connection.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profile = await mkdtemp(path.join(tmpdir(), 'wolfie-compact-agenda-'))
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5178', '--strictPort'], { cwd: client, windowsHide: true, stdio: 'ignore' })
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let ws
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(fn, label = 'local render') {
  for (let n = 0; n < 100; n++) { try { const result = await fn(); if (result) return result } catch { /* wait for startup/render */ } await sleep(50) }
  throw new Error(`Timed out: ${label}`)
}
try {
  await until(async () => (await fetch('http://127.0.0.1:5178/test/academic-preview.html')).ok, 'Vite startup')
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
  const button = (name, scope = 'document') => `Array.from(${scope}.querySelectorAll('button')).find(element => element.textContent.trim().replace(/^\\+\\s*/, '') === ${JSON.stringify(name)} || element.getAttribute('aria-label') === ${JSON.stringify(name)})`
  const dlg = q('dialog[open]')
  async function click(expression) {
    await evaluate(`{const element=${expression}; if(!element)throw Error('Missing click target'); element.scrollIntoView({block:'nearest'});}`)
    // Let the initiating scroll/resize settle before opening an anchored menu.
    await sleep(60)
    const box = await evaluate(`(()=>{const r=${expression}.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...box, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...box, button: 'left', clickCount: 1 })
    await sleep(35)
  }
  async function key(key, modifiers = 0) {
    const virtualKey = { Tab: 9, Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, Home: 36, End: 35, ' ': 32 }[key]
    const params = { key, code: key === ' ' ? 'Space' : key, modifiers, windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey }
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params, text: key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
    await sleep(25)
  }
  async function fill(name, value) {
    await evaluate(`{const element=${q(`dialog[open] [name="${name}"]`)};const prototype=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));}`)
    await sleep(20)
  }
  async function reload() { const loaded = new Promise(resolve => { onLoad = resolve }); await send('Page.reload'); await loaded; await until(() => evaluate(`!!${button('Add item')} && !${button('Add item')}.disabled`), 'ready agenda') }
  async function expectDialog(title) { await until(() => evaluate(`${dlg}?.querySelector('h2')?.textContent === ${JSON.stringify(title)}`), title); assert.equal(await evaluate(`document.querySelectorAll('dialog[open]').length`), 1) }
  async function noDialog() { await until(() => evaluate(`!${dlg}`), 'closed modal') }
  async function focusTrap() {
    const controls = `Array.from(${dlg}.querySelectorAll('button,input,select,textarea,summary,[tabindex]')).filter(element=>!element.disabled && element.tabIndex>=0 && element.getClientRects().length)`
    await evaluate(`window.__first=${controls}[0];window.__last=${controls}.at(-1);window.__last.focus()`)
    await key('Tab'); assert.equal(await evaluate(`document.activeElement===window.__first`), true, 'forward focus containment')
    await key('Tab', 8); assert.equal(await evaluate(`document.activeElement===window.__last`), true, 'reverse focus containment')
  }
  async function backdropAndBackground() {
    await click(q('#fixture-background'))
    assert.equal(await evaluate('window.academicFixture.backgroundClicks'), 0, 'background pointer blocked')
    await evaluate(`${q('#fixture-background')}.focus()`)
    assert.equal(await evaluate(`${dlg}.contains(document.activeElement)`), true, 'background focus blocked')
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 2, y: 2, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 2, y: 2, button: 'left', clickCount: 1 })
    assert.equal(await evaluate(`!!${dlg}`), true, 'backdrop cannot dismiss')
  }
  async function screenshot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(profile, name), Buffer.from(result.data, 'base64')) }
  async function menu(title) { await click(button(`Actions for ${title}`)); await until(() => evaluate(`!!${q('[role=menu]')}`), 'actions menu') }
  async function menuAction(title, action) { await menu(title); await click(button(action, q('[role=menu]'))) }
  async function fit() { assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'no page overflow'); if (await evaluate(`!!${dlg}`)) assert.equal(await evaluate(`${dlg}.scrollWidth <= ${dlg}.clientWidth`), true, 'no modal overflow') }
  await send('Page.enable'); await send('Page.navigate', { url: 'http://127.0.0.1:5178/test/academic-preview.html' }); await send('Page.bringToFront')
  await send('Accessibility.enable')
  await until(() => evaluate('!!window.academicFixture'))
  // A non-campus browser zone must not shift stored calendar dates or wall times.
  await send('Emulation.setTimezoneOverride', { timezoneId: 'America/Los_Angeles' })
  for (const width of [1280, 375]) {
    const title = `Browser assignment ${width}`
    const longTitle = 'Research project with a deliberately long title to exercise wrapping and keep every action reachable on a narrow screen'
    const seed = [{ id: 'long', user_course_id: '10000000-0000-0000-0000-000000000021', title: longTitle, type: 'project', due_date: '2026-10-21', due_time: '14:30:00', notes: 'Existing notes', location: 'Library', completed_at: null }]
    await evaluate(`localStorage.setItem('wolfie-academic-browser-fixture:a',${JSON.stringify(JSON.stringify(seed))});localStorage.removeItem('wolfie-academic-browser-fixture:b')`)
    await reload()
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 })
    await fit()
    assert.equal(await evaluate(`${q('time')}.textContent`), 'Oct 21, 2026')
    assert.equal(await evaluate(`${q('.academic-deadline')}.textContent.includes('2:30 PM')`), true)
    await screenshot(`agenda-${width}.png`)

    // Menu keys and bounded positioning near a viewport edge.
    await menu(longTitle)
    assert.equal(await evaluate('document.activeElement.textContent'), 'Edit')
    await key('ArrowDown'); assert.equal(await evaluate('document.activeElement.textContent'), 'Delete')
    await key('ArrowUp'); await key('End'); assert.equal(await evaluate('document.activeElement.textContent'), 'Delete')
    await key('Home'); assert.equal(await evaluate('document.activeElement.textContent'), 'Edit')
    const bounds = await evaluate(`(()=>{const r=${q('[role=menu]')}.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`)
    assert.equal(bounds, true, 'menu within viewport')
    await key('Escape'); assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`), `Actions for ${longTitle}`)
    await menu(longTitle); await key('Tab'); assert.equal(await evaluate(`!${q('[role=menu]')}`), true)

    // Create and same-dialog discard, native focus containment and inertness.
    await click(button('Add item')); await expectDialog('Add academic item')
    assert.equal(await evaluate('document.activeElement.name'), 'title')
    assert.notEqual(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'none')
    await focusTrap(); await backdropAndBackground(); await screenshot(`editor-${width}.png`)
    await fill('title', title); await fill('due_date', '2026-10-23')
    await click(q('dialog[open] summary')); await fill('notes', 'Draft notes that must survive confirmation')
    await click(button('Cancel', dlg)); await expectDialog('Discard unsaved changes?')
    assert.equal(await evaluate('document.activeElement.textContent'), 'Keep Editing')
    await focusTrap(); await backdropAndBackground(); await screenshot(`discard-${width}.png`)
    await key('Escape'); await expectDialog('Add academic item')
    assert.equal(await evaluate(`${q('dialog[open] [name=notes]')}.value`), 'Draft notes that must survive confirmation')
    await click(button('Close editor', dlg)); await expectDialog('Discard unsaved changes?')
    await click(button('Keep Editing', dlg)); await expectDialog('Add academic item')

    // Pending save is not dismissible; a failing save retains its modal and draft.
    await evaluate(`window.academicFixture.saveMode='wait'`)
    await click(button('Save item', dlg)); await until(() => evaluate('!!window.academicFixture.releaseSave'))
    const saveCalls = await evaluate('window.academicFixture.saveCalls')
    await key('Escape'); assert.equal(await evaluate(`!!${dlg}`), true)
    assert.equal(await evaluate(`${button('Cancel', dlg)}.disabled`), true)
    await evaluate(`window.academicFixture.saveMode='fail';window.academicFixture.releaseSave()`)
    await until(() => evaluate(`!!${q('dialog[open] [role=alert]')}`), 'save failure')
    assert.equal(await evaluate(`${q('dialog[open] [name=title]')}.value`), title)
    assert.equal(await evaluate('window.academicFixture.saveCalls'), saveCalls)
    await click(button('Save item', dlg)); await noDialog()
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), '+ Add item')
    await reload(); assert.equal(await evaluate('document.querySelectorAll(".academic-row").length'), 2, 'create persisted through reload')

    // Existing details expand; short-height dialog remains scrollable and operable.
    await menuAction(longTitle, 'Edit'); await expectDialog('Edit academic item')
    assert.equal(await evaluate(`${q('dialog[open] details')}.open`), true)
    await send('Emulation.setDeviceMetricsOverride', { width, height: 480, deviceScaleFactor: 1, mobile: width === 375 })
    await fit(); await click(button('Cancel', dlg)); await noDialog()
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), `Actions for ${longTitle}`)
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 })

    // Editing/reverting versus explicit discard, then a successful edit.
    await menuAction(title, 'Edit'); await fill('title', 'Temporary'); await fill('title', title)
    await key('Escape'); await noDialog()
    await menuAction(title, 'Edit'); await fill('title', 'Discard this'); await key('Escape')
    await expectDialog('Discard unsaved changes?'); await click(button('Discard Changes', dlg)); await noDialog()
    await menuAction(title, 'Edit'); await fill('title', `${title} revised`); await click(button('Save item', dlg)); await noDialog()
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), `Actions for ${title} revised`)

    // Checkboxes complete/reopen directly; no confirmation is inserted.
    await click(q(`input[aria-label="Mark complete ${title} revised"]`)); await until(() => evaluate(`!${q(`input[aria-label="Mark complete ${title} revised"]`)}`))
    assert.equal(await evaluate(`!${dlg}`), true)
    await click(button('Completed')); await click(q(`input[aria-label="Reopen ${title} revised"]`)); await until(() => evaluate(`!${q(`input[aria-label="Reopen ${title} revised"]`)}`))
    await click(button('Pending'))

    // Delete: safe Enter, focus trap, ignored backdrop, pending/failure/retry.
    await menuAction(`${title} revised`, 'Delete'); await expectDialog('Delete this item?')
    assert.equal(await evaluate('document.activeElement.textContent'), 'Cancel')
    assert.equal(await evaluate(`${dlg}.textContent.includes('cannot be undone')`), true)
    const tree = await send('Accessibility.getFullAXTree')
    const confirmation = tree.nodes.find(node => node.role?.value === 'alertdialog')
    assert.equal(confirmation?.name?.value, 'Delete this item?')
    assert.ok(confirmation.description?.value.includes(`${title} revised`) && confirmation.description?.value.includes('cannot be undone'), 'spoken description identifies the item and consequence')
    await focusTrap(); await backdropAndBackground(); await screenshot(`delete-${width}.png`)
    await evaluate(`${button('Cancel', dlg)}.focus()`); await key('Enter'); await noDialog()
    assert.equal(await evaluate('window.academicFixture.deleteCalls'), 0)
    await menuAction(`${title} revised`, 'Delete'); await key('Escape'); await noDialog()
    await menuAction(`${title} revised`, 'Delete')
    await evaluate(`window.academicFixture.deleteMode='wait'`); await click(button('Delete', dlg))
    await until(() => evaluate('!!window.academicFixture.releaseDelete'))
    await key('Escape'); assert.equal(await evaluate(`${button('Cancel', dlg)}.disabled`), true)
    await evaluate(`window.academicFixture.deleteMode='fail';window.academicFixture.releaseDelete()`)
    await until(() => evaluate(`!!${q('dialog[open] [role=alert]')}`), 'delete failure')
    assert.equal(await evaluate('document.querySelectorAll(".academic-row").length'), 2)
    assert.equal(await evaluate('document.activeElement.textContent'), 'Cancel')
    await key('Escape'); await noDialog()
    assert.equal(await evaluate('window.academicFixture.deleteCalls'), 1)
    await menuAction(`${title} revised`, 'Delete')
    await evaluate(`window.academicFixture.deleteMode='fail'`); await click(button('Delete', dlg))
    await until(() => evaluate(`!!${q('dialog[open] [role=alert]')}`))
    await click(button('Delete', dlg)); await noDialog()
    assert.equal(await evaluate('document.querySelectorAll(".academic-row").length'), 1)
    assert.equal(await evaluate('document.activeElement.getAttribute("data-row-completion")'), 'long')

    // Completing the last visible row must not arm Add Item for the next Enter.
    await click(q(`input[aria-label="Mark complete ${longTitle}"]`))
    await until(() => evaluate('document.querySelectorAll(".academic-row").length === 0'))
    assert.equal(await evaluate('document.activeElement.textContent'), 'Pending')
    await key('Enter'); assert.equal(await evaluate(`!${dlg}`), true, 'completion must not focus Add Item')
    await click(button('Completed')); await click(q(`input[aria-label="Reopen ${longTitle}"]`))
    await until(() => evaluate('document.querySelectorAll(".academic-row").length === 0')); await click(button('Pending'))

    // External account replacement must release native modality even during a write.
    await menuAction(longTitle, 'Delete'); await evaluate(`window.academicFixture.deleteMode='wait'`); await click(button('Delete', dlg))
    await until(() => evaluate('!!window.academicFixture.releaseDelete'))
    await evaluate('window.academicFixture.switchAccount()'); await noDialog()
    await evaluate('window.academicFixture.releaseDelete()'); await sleep(80)
    assert.equal(await evaluate('document.querySelectorAll(".academic-row").length'), 0)
    assert.notEqual(await evaluate('document.body.style.overflow'), 'hidden')
    await evaluate('window.academicFixture.switchAccount()'); await sleep(50)
    await fit(); assert.deepEqual(alerts, [], 'no browser confirm/alert')
    console.log(`PASS ${width}px: compact rows, campus dates, menu keys, modal containment/inertness, discard, save/delete failure/retry, CRUD, teardown`)
  }
  console.log(`Screenshots: ${profile}`)
  await send('Browser.close')
} finally { ws?.close(); chrome.kill(); vite.kill() }
