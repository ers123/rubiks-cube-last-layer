/**
 * Drives the photo path with a real file, then taps the faces a user would.
 *
 * This is the check that the app no longer guesses: before the taps, nothing
 * should be filled in, because the top face has not been named yet.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const DIST = '/Users/yohan/Projects/rubiks/dist/'
const PORT = 4356
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0]
  let f = join(DIST, normalize(url === '/' ? '/index.html' : url))
  if (!existsSync(f)) f = join(DIST, 'index.html')
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' })
  res.end(await readFile(f))
})
await new Promise((r) => server.listen(PORT, r))

const photo = process.argv[2] ?? '/Users/yohan/Downloads/IMG_1471.PNG'
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })

await (await page.$('input[type=file]')).setInputFiles(photo)
await page.waitForTimeout(1500)

const read = () =>
  page.evaluate(() => ({
    status: document.querySelector('.cam-status')?.textContent ?? null,
    bad: document.querySelector('.cam-bad')?.textContent ?? null,
    filled: [...document.querySelectorAll('.mini')].filter(
      (m) => m.style.background && m.style.background !== 'rgb(32, 36, 45)'
    ).length,
  }))

const before = await read()
console.log('before taps:', JSON.stringify(before))
if (before.filled !== 0) {
  console.error(`FAIL: ${before.filled} stickers stored before the top face was named`)
  process.exit(1)
}

await page.screenshot({ path: 'screenshots/photo-detected.png' })

// tap where the app actually drew its outlines, the way a user would
const quads = await page.evaluate(() => {
  const c = document.querySelector('.cam-canvas')
  const ctx = c.getContext('2d')
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  // Until a face is named the outlines are drawn in the "unknown" colour
  // #ffd166, which no sticker in these photos uses.
  const pts = []
  for (let y = 0; y < c.height; y += 3) {
    for (let x = 0; x < c.width; x += 3) {
      const i = (y * c.width + x) * 4
      if (d[i] > 230 && d[i + 1] > 190 && d[i + 1] < 240 && d[i + 2] < 140) pts.push([x, y])
    }
  }
  if (!pts.length) {
    // report what colours are actually up there, so a future failure is legible
    const hist = {}
    for (let y = 0; y < c.height; y += 3) {
      for (let x = 0; x < c.width; x += 3) {
        const i = (y * c.width + x) * 4
        if (d[i + 3] < 10) continue
        const k = `${d[i]},${d[i + 1]},${d[i + 2]}`
        hist[k] = (hist[k] || 0) + 1
      }
    }
    return { hist: Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 8), size: [c.width, c.height] }
  }
  const ys = pts.map((p) => p[1])
  const xs = pts.map((p) => p[0])
  // split by height: the top face outlines sit above the rest
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2
  const top = pts.filter((p) => p[1] < mid)
  const avg = (arr) => [
    arr.reduce((s, p) => s + p[0], 0) / arr.length,
    arr.reduce((s, p) => s + p[1], 0) / arr.length,
  ]
  return { top: avg(top), all: avg(pts), size: [c.width, c.height] }
})
if (!quads || !quads.top) {
  console.error('FAIL: no outlines drawn. colours seen:', JSON.stringify(quads?.hist))
  process.exit(1)
}
const canvas = await page.$('.cam-canvas')
const box = await canvas.boundingBox()
const tapCanvas = async ([cx, cy]) => {
  await page.mouse.click(
    box.x + (cx / quads.size[0]) * box.width,
    box.y + (cy / quads.size[1]) * box.height
  )
  await page.waitForTimeout(500)
}
await tapCanvas(quads.top)
const mid = await read()
console.log('after top tap:', JSON.stringify(mid))
await tapCanvas(quads.all)
const after = await read()
console.log('after front tap:', JSON.stringify(after))
await page.screenshot({ path: 'screenshots/photo-tapped.png' })

if (errs.length) {
  console.error('FAIL: page errors:', errs)
  process.exit(1)
}
if (after.filled === 0) {
  console.error('FAIL: nothing was stored even after naming the top face')
  process.exit(1)
}
console.log('\nPASS: nothing is guessed, and naming the faces fills the readings')
await browser.close()
server.close()
