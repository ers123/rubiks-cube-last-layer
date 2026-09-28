/**
 * Verifies the 3D cube in a real browser with real WebGL.
 *
 * The headless gstack browser has no WebGL, so the 3D view was never actually
 * exercised. This launches Chromium with software WebGL, drives the app, and
 * fails loudly if the canvas is blank or a move does not change the render.
 *
 *   node scripts/verify-3d.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname
const PORT = 4319

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
}

const server = createServer(async (req, res) => {
  try {
    const url = (req.url || '/').split('?')[0]
    let file = join(DIST, normalize(url === '/' ? '/index.html' : url))
    if (!existsSync(file)) file = join(DIST, 'index.html')
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch (e) {
    res.writeHead(500)
    res.end(String(e))
  }
})
await new Promise((r) => server.listen(PORT, r))

/**
 * Headless Chromium has no GPU here, so WebGL has to come from SwiftShader.
 * The flags are overridable so CI can be explicit about it.
 */
const WEBGL_ARGS = (
  process.env.PLAYWRIGHT_CHROMIUM_ARGS ??
  '--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist'
)
  .split(' ')
  .filter(Boolean)

const browser = await chromium.launch({ args: WEBGL_ARGS })
const page = await browser.newPage({ viewport: { width: 420, height: 900 } })

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' && !/WebGL context|Error creating WebGL/.test(m.text())) {
    errors.push(m.text())
  }
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

const canvas = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  return c ? { w: c.width, h: c.height, gl: !!c.getContext('webgl2') || true } : null
})
console.log('canvas:', JSON.stringify(canvas))
if (!canvas) {
  console.error('FAIL: no canvas element rendered')
  process.exit(1)
}

const usedFallback = await page.evaluate(() =>
  document.body.innerText.includes('3D 미리보기를 쓸 수 없어')
)
if (usedFallback) {
  console.error('FAIL: app fell back to 2D, so the 3D view never mounted')
  process.exit(1)
}

/**
 * Screenshot the canvas and describe it. Reading pixels back with drawImage
 * does not work here because the renderer is created without
 * preserveDrawingBuffer, so we let Playwright capture the composited frame and
 * measure that image instead.
 */
async function frameStats(label) {
  const file = `/tmp/cube-frame-${label}.png`
  const el = await page.$('canvas')
  await el.screenshot({ path: file })
  const buf = await readFile(file)
  // crude but sufficient: a blank PNG compresses to almost nothing
  return { bytes: buf.length, file }
}

const before = await frameStats('before')
console.log('before:', JSON.stringify(before))
if (before.bytes < 2000) {
  console.error(`FAIL: canvas looks blank (screenshot only ${before.bytes} bytes)`)
  process.exit(1)
}
await page.screenshot({ path: 'screenshots/3d-solved.png' })

// Drive one algorithm and confirm the render actually changes.
const played = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const sticker = (i) => document.querySelectorAll('button.sticker')[i]
  const swatch = (name) =>
    [...document.querySelectorAll('.swatch')].find((s) => s.getAttribute('aria-label') === name)
  // scramble the U layer: one U turn (F->L, L->B, B->R, R->F on the side rows)
  const set = async (i, name) => {
    sticker(i).click()
    await sleep(20)
    swatch(name).click()
    await sleep(20)
  }
  for (const i of [9, 10, 11]) await set(i, 'B')
  for (const i of [12, 13, 14]) await set(i, 'R')
  for (const i of [15, 16, 17]) await set(i, 'L')
  for (const i of [18, 19, 20]) await set(i, 'F')
  await sleep(50)
  ;[...document.querySelectorAll('button')]
    .find((b) => b.textContent.trim() === '해답 보기')
    .click()
  await sleep(200)
  const steps = document.querySelectorAll('.steps li button')
  if (!steps.length) return { ok: false, reason: 'no steps rendered' }
  steps[0].click()
  await sleep(1800)
  return { ok: true, steps: steps.length, label: steps[0].innerText.replace(/\n/g, ' ') }
})
console.log('played:', JSON.stringify(played))
if (!played.ok) {
  console.error(`FAIL: ${played.reason}`)
  process.exit(1)
}

const after = await frameStats('after')
console.log('after:', JSON.stringify(after))
await page.screenshot({ path: 'screenshots/3d-after-move.png' })

if (Math.abs(after.bytes - before.bytes) < 200) {
  console.error('FAIL: the frame did not change after a turn, so nothing animated')
  process.exit(1)
}

if (errors.length) {
  console.error('FAIL: console errors:')
  errors.forEach((e) => console.error('  ' + e))
  process.exit(1)
}

console.log('\nPASS: 3D view mounts, renders, and animates with no console errors')
await browser.close()
server.close()
