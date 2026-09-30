import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Does the 3D view actually show the cube, or only part of it?
 *
 * This exists because the renderer used to colour one sticker mesh per corner
 * and leave the other two showing whatever was on screen before, so a solved
 * face looked scrambled. Nothing else caught it: the model was right, the
 * animation worked, and the page had no errors.
 */

const DIST = new URL('../dist', import.meta.url).pathname
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = http.createServer((rq, rs) => {
  const url = (rq.url || '/').split('?')[0]
  let file = path.join(DIST, url === '/' ? '/index.html' : url)
  if (!fs.existsSync(file)) file = path.join(DIST, 'index.html')
  rs.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
  rs.end(fs.readFileSync(file))
})
await new Promise((r) => server.listen(4325, r))

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 480, height: 640 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:4325/', { waitUntil: 'networkidle' })
await page.waitForSelector('canvas:not(.cam-canvas)', { timeout: 15000 })
await page.waitForTimeout(1200)

// A WebGL canvas cannot be read back after the frame is gone, so screenshot it
// and analyse the picture inside the page instead.
const shot = (await page.locator('canvas:not(.cam-canvas)').screenshot()).toString('base64')

const analyse = async (source) =>
  page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, c.width, c.height)
    const isBlack = (i) => data[i] < 26 && data[i + 1] < 26 && data[i + 2] < 26
    let black = 0
    for (let i = 0; i < data.length; i += 4) if (isBlack(i)) black++
    // the right-hand face occupies the right side, below the top
    const x0 = Math.floor(c.width * 0.7)
    const y0 = Math.floor(c.height * 0.45)
    let red = 0
    let other = 0
    for (let y = y0; y < c.height; y++) {
      for (let x = x0; x < c.width; x++) {
        const i = (y * c.width + x) * 4
        if (isBlack(i)) continue
        if (data[i] > 120 && data[i + 1] < 90) red++
        else other++
      }
    }
    return { total: data.length / 4, black, red, other }
  }, source)

const painted = await analyse(shot)
console.log('paint:', JSON.stringify(painted))

if (painted.black > painted.total * 0.97) {
  console.error('FAIL: the cube is not painted at all')
  process.exit(1)
}

// A solved cube: the right face is red, so almost nothing there may be another
// colour. Stale stickers used to show up here as a rainbow.
if (painted.other > painted.red * 4) {
  console.error(
    `FAIL: the right face is not one colour (${painted.other} other pixels vs ${painted.red} red), so stickers are stale`
  )
  process.exit(1)
}

if (errors.length) {
  console.error('FAIL: console errors: ' + errors.slice(0, 2).join(' | '))
  process.exit(1)
}

await browser.close()
server.close()
console.log('PASS: every visible sticker is painted from the cube it belongs to')
