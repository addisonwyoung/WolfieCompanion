// From repository root: node client/test/library-occupancy-browser.mjs
// Uses installed Chrome/CDP and Vite; synthetic readings only, no upstream requests.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const profile = await mkdtemp(path.join(tmpdir(), 'wolfie-occupancy-'))
const production = process.argv.includes('--production')
let serverArgs = []
if (production) {
  // Isolated production-mode build of the same UI with synthetic occupancy only.
  // The test HTML is never added to the normal production application's output.
  const { build } = await import('../node_modules/vite/dist/node/index.js')
  const output = path.join(profile, 'production')
  await build({ root: path.join(process.cwd(), 'client'), build: {
    outDir: output, emptyOutDir: true,
    rollupOptions: { input: path.join(process.cwd(), 'client/test/library-occupancy-preview.html') },
  } })
  serverArgs = ['preview', '--outDir', output]
}
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...serverArgs, '--host', '127.0.0.1', '--port', '5187', '--strictPort'], { cwd: path.join(process.cwd(), 'client'), windowsHide: true, stdio: 'ignore' })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    try { const value = await fn(); if (value) return value } catch { /* wait for startup/render */ }
    await new Promise(resolve => setTimeout(resolve, 80))
  }
  throw new Error('Browser verification timed out')
}
let ws
try {
  await until(async () => (await fetch('http://127.0.0.1:5187/test/library-occupancy-preview.html')).ok)
  const port = await until(async () => (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0])
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  const pending = new Map(), errors = []
  let id = 0
  ws.onmessage = event => {
    const data = JSON.parse(event.data)
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text)
    if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') errors.push(JSON.stringify(data.params.args))
    if (data.id) {
      const item = pending.get(data.id); pending.delete(data.id)
      if (data.error) item.reject(Error(JSON.stringify(data.error)))
      else item.resolve(data.result)
    }
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); ws.send(JSON.stringify({ id: next, method, params })) })
  const evaluate = async expression => {
    const output = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (output.exceptionDetails) throw Error(JSON.stringify(output.exceptionDetails))
    return output.result.value
  }
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.bringToFront')
  await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await send('Network.enable')
  await send('Network.setBlockedURLs', { urls: ['https://*'] })
  const optimize = process.argv.includes('--optimize-photos')
  if (optimize) {
    await send('Page.navigate', { url: 'http://127.0.0.1:5187/test/library-occupancy-preview.html' })
    await until(() => evaluate('document.readyState === "complete"'))
    for (const name of ['north_reading_room', 'central_reading_room', 'health_sciences', 'music_library', 'third_floor']) {
      const result = await evaluate(`(async () => {
        const image = new Image(); image.src = '/images/library/${name}.jpg'; await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(1200, image.naturalWidth); canvas.height = Math.round(image.naturalHeight * canvas.width / image.naturalWidth);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        let quality = .9, encoded = canvas.toDataURL('image/webp', quality);
        while (encoded.length * .75 > 250000 && quality > .7) { quality -= .05; encoded = canvas.toDataURL('image/webp', quality); }
        return { originalWidth: image.naturalWidth, originalHeight: image.naturalHeight, width: canvas.width, height: canvas.height, quality, data: encoded.split(',')[1] };
      })()`)
      const output = Buffer.from(result.data, 'base64')
      await writeFile(path.join('client/public/images/library', name + '.webp'), output)
      console.log(`${name}: ${result.originalWidth}x${result.originalHeight} -> ${result.width}x${result.height}, ${output.length} bytes WebP, quality ${result.quality.toFixed(2)}`)
    }
  }
  const photoSources = [
    'https://news.stonybrook.edu/university/stony-brook-university-libraries-named-finalist-for-international-innovation-award/',
    'https://library.stonybrook.edu/redesigned-spaces/',
    'https://www.linkedin.com/posts/william-wertheim-3a75299_stonybrook-healthsciences-activity-7146228317656948736-8_3T',
    'https://www.facebook.com/stonybrooklibrary/photos/good-luck-to-all-stony-brook-university-students-on-your-finals-if-youre-looking/10162784796475010/',
    'https://library.stonybrook.edu/redesigned-spaces/',
  ]
  if (!optimize) for (const [width, columns] of [[1280, 3], [820, 2], [375, 1]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 })
    await send('Page.navigate', { url: 'http://127.0.0.1:5187/test/library-occupancy-preview.html' })
    await until(() => evaluate('document.querySelectorAll(".location-card").length === 5'))
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `card overflow at ${width}`)
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".location-grid")).gridTemplateColumns.split(" ").length'), columns)
    assert.equal(await evaluate('document.querySelector(".library-reading").getBoundingClientRect().top - document.querySelector(".library-card-title").getBoundingClientRect().bottom <= 12'), true, 'compact title/occupancy spacing')
    await until(() => evaluate('Array.from(document.querySelectorAll(".location-card img")).filter(image => image.complete && image.naturalWidth > 0).length === 5'))
    await evaluate('(async () => { await Promise.all(Array.from(document.images, image => image.decode())); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()')
    const cards = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    await writeFile(path.join(profile, `cards-${width}.png`), Buffer.from(cards.data, 'base64'))
    await evaluate('document.querySelector(".location-card").focus()')
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await until(() => evaluate('document.activeElement.id === "library-detail-heading"'))
    await until(() => evaluate('document.querySelectorAll(".history-hour").length === 24'))
    assert.equal(await evaluate('document.querySelector(".history-about").open'), false, 'technical details collapsed by default')
    assert.equal(await evaluate('document.querySelector(".history-about summary").textContent'), 'About this data')
    assert.equal(await evaluate('document.querySelector(".occupancy-history").textContent.includes("previous four")'), false)
    assert.equal(await evaluate('document.querySelector(".history-context").textContent.includes("not a forecast")'), true)
    assert.equal(await evaluate('document.querySelector(".library-capacity").children.length'), 2)
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".library-capacity")).gridTemplateColumns.split(" ").length'), 2)
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `detail overflow at ${width}`)
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".library-detail")).gridTemplateColumns.split(" ").length'), width > 760 ? 2 : 1)
    assert.equal(await evaluate('document.querySelector(".library-amenity-grid").textContent.includes("700+")'), true)
    assert.equal(await evaluate('document.querySelector(".occupancy-history").previousElementSibling.classList.contains("library-amenities")'), true)
    assert.equal(await evaluate('document.querySelector(".occupancy-history").getBoundingClientRect().top > document.querySelector(".library-amenities").getBoundingClientRect().bottom'), true)
    assert.equal(await evaluate('document.querySelector(".history-hour").getAttribute("aria-label")'), '4 PM: 0% occupancy')
    await evaluate('document.querySelector(".history-hour").focus()')
    for (let step = 0; step < 2; step++) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
    }
    await until(() => evaluate('document.querySelector(".history-inspection").textContent.includes("112%")'))
    assert.equal(await evaluate('document.querySelectorAll(".history-bar")[1].style.height'), '100%')
    await evaluate('document.querySelectorAll(".history-hour")[1].scrollIntoView({block:"center"})')
    const target = await evaluate('(()=>{const r=document.querySelectorAll(".history-hour")[1].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
    if (width === 375) {
      await send('Emulation.setTouchEmulationEnabled', { enabled: true })
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [target] })
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } else await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...target })
    await until(() => evaluate('document.querySelector(".history-inspection").textContent.includes("No data")'))
    const detail = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    await writeFile(path.join(profile, `detail-${width}.png`), Buffer.from(detail.data, 'base64'))
    await evaluate('document.querySelector(".library-back").click()')
    await until(() => evaluate('document.activeElement.classList.contains("location-card")'))
    assert.equal(await evaluate('window.occupancyPreview.requests'), 1)
    assert.equal(await evaluate('window.occupancyPreview.histories'), 1)
    for (let library = 0; library < 5; library++) {
      const expected = await evaluate(`document.querySelectorAll('.location-card img')[${library}].getAttribute('src')`)
      await evaluate(`document.querySelectorAll('.location-card')[${library}].click()`)
      await until(() => evaluate('document.querySelector(".library-summary img")?.complete && document.querySelector(".library-summary img")?.naturalWidth > 0'))
      assert.equal(await evaluate('document.querySelector(".library-summary img").getAttribute("src")'), expected)
      assert.equal(await evaluate('document.querySelectorAll(".library-photo-credit a").length'), 1)
      assert.equal(await evaluate('document.querySelector(".library-photo-credit a").href'), photoSources[library])
      if (library === 2) assert.equal(await evaluate('document.querySelector(".library-photo-credit a").textContent'), 'LinkedIn')
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      await writeFile(path.join(profile, `photo-${library + 1}-${width}.png`), Buffer.from(shot.data, 'base64'))
      if (library === 0) {
        await evaluate('document.querySelector(".library-summary img").src = "/images/library/not-present.webp"')
        await until(() => evaluate('document.querySelector(".library-summary .library-image-label")?.textContent.includes("Photo placeholder")'))
        assert.equal(await evaluate('document.querySelector(".library-photo-credit")'), null)
        assert.equal(await evaluate('document.querySelector(".library-summary [role=meter]") !== null'), true)
      }

      await evaluate('document.querySelector(".library-back").click()')
      await until(() => evaluate('document.querySelectorAll(".location-card").length === 5'))
    }
    const size = await evaluate('(()=>{const r=document.querySelector(".library-image").getBoundingClientRect();return {width:r.width,height:r.height}})()')
    await evaluate('document.querySelector(".location-card img").src = "/images/library/not-present.webp"')
    await until(() => evaluate('document.querySelector(".location-card .library-image-label")?.textContent.includes("Photo placeholder")'))
    assert.deepEqual(await evaluate('(()=>{const r=document.querySelector(".library-image").getBoundingClientRect();return {width:r.width,height:r.height}})()'), size)
    console.log(`${width}px: all five photographs loaded in cards/details, local assets, credits, no overflow; real missing-image fallback preserves dimensions`)
    console.log(`${width}px: cards ${columns}, detail columns ${width > 760 ? 2 : 1}, chart below amenities, zero/gap/112%, hover/tap/keyboard, no overflow, 1 live + 1 history request`)
  }
  if (!optimize) for (const width of [1280, 820, 375]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 })
    for (const [mode, label] of [['less', 'Less busy than usual'], ['similar', 'About as busy as usual'], ['busier', 'Busier than usual']]) {
      await send('Page.navigate', { url: `http://127.0.0.1:5187/test/library-occupancy-preview.html?comparison=${mode}` })
      await until(() => evaluate('document.querySelectorAll(".location-card").length === 5'))
      await evaluate('document.querySelector(".location-card").click()')
      await until(() => evaluate(`document.querySelector(".history-comparison h3")?.textContent === ${JSON.stringify(label)}`))
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
      assert.equal(await evaluate('document.querySelector(".history-comparison p")'), null)
      assert.equal(await evaluate('document.querySelector(".history-about").open'), false)
      assert.deepEqual(await evaluate('window.occupancyPreview'), { requests: 1, histories: 1 })
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      await writeFile(path.join(profile, `comparison-${mode}-${width}.png`), Buffer.from(shot.data, 'base64'))
      console.log(`${width}px: ${label}, no overflow, collapsed disclosure, 1 live + 1 history request`)
    }
  }
  assert.deepEqual(errors, [])
  console.log(`Screenshots: ${profile}`)
} finally { ws?.close(); chrome.kill(); vite.kill() }
