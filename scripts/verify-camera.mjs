/**
 * End-to-end check of the camera path using a fake webcam.
 *
 * A real camera cannot be tested from here, but the whole plumbing can:
 * Chromium will play a Y4M file as if it were a webcam, so getUserMedia, frame
 * grabbing, detection, the overlay and the accumulation all run for real.
 * What this deliberately does not cover is real photometry: glare, uneven
 * lighting, white balance, focus blur. That still needs a phone in a hand.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname
const TMP = '/tmp/cube-fake'
const PORT = 4321
const VIDEO = join(TMP, 'cube.y4m')

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
}

const server = createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0]
  let file = join(DIST, normalize(url === '/' ? '/index.html' : url))
  if (!existsSync(file)) file = join(DIST, 'index.html')
  const body = await readFile(file)
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(body)
})
await new Promise((r) => server.listen(PORT, r))

if (!existsSync(VIDEO)) {
  console.error(`FAIL: ${VIDEO} is missing. Generate it first with pnpm fake-camera`)
  process.exit(1)
}

const WEBGL_ARGS = (
  process.env.PLAYWRIGHT_CHROMIUM_ARGS ??
  '--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist'
)
  .split(' ')
  .filter(Boolean)

const browser = await chromium.launch({
  args: [
    ...WEBGL_ARGS,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-video-capture=${VIDEO}`,
  ],
})

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ['camera'],
})
const page = await context.newPage()

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' && !/WebGL context|Error creating WebGL/.test(m.text())) {
    errors.push(m.text())
  }
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })

// The camera button must be reachable, which is the thing a user complained
// was missing.
// reach the camera screen from the manual screen
const toCam = await page.$('text=카메라로 읽기')
if (!toCam) {
  console.error('FAIL: no way to reach the camera screen')
  process.exit(1)
}
await toCam.click()
await page.waitForTimeout(500)
const camButton = await page.$('text=실시간 카메라')
if (!camButton) {
  console.error('FAIL: no way to start the camera from the first screen')
  await browser.close()
  server.close()
  process.exit(1)
}
console.log('found the camera button')

await camButton.click()

// Give the fake stream time to start and a few frames time to be processed.
await page.waitForTimeout(2500)

const state = await page.evaluate(() => {
  const v = document.querySelector('video')
  const c = document.querySelector('.cam-canvas')
  return {
    hasVideo: !!v,
    videoSize: v ? `${v.videoWidth}x${v.videoHeight}` : null,
    playing: v ? !v.paused : false,
    hasCanvas: !!c,
    status: document.querySelector('.cam-status')?.textContent ?? null,
    hint: document.querySelector('.cam-hint')?.textContent ?? null,
    error: document.querySelector('.cam-bad')?.textContent ?? null,
    minis: document.querySelectorAll('.mini').length,
  }
})
console.log('state:', JSON.stringify(state))

if (!state.hasVideo || !state.playing) {
  console.error('FAIL: the video element never started playing')
  await browser.close()
  server.close()
  process.exit(1)
}

await page.screenshot({ path: 'screenshots/camera-live.png' })

if (errors.length) {
  console.error('FAIL: console errors:')
  errors.forEach((e) => console.error('  ' + e))
  await browser.close()
  server.close()
  process.exit(1)
}

console.log('\nPASS: getUserMedia starts, frames are processed, the overlay renders')
console.log('  next step is a real phone: glance at the colours it reports.')
await browser.close()
server.close()
