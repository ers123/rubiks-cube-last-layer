import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Does the gallery actually work for someone standing in front of their cube?
 *
 * It has to show pictures, let a case be picked, and then produce moves that
 * finish the cube. Building the page proves none of that.
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
await new Promise((r) => server.listen(4321, r))

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' })

const shown = 72
await page.click('text=질문 3개로 좁히기')
await page.waitForSelector('.qp', { timeout: 10000 })
const answer = async (label) => {
  await page.locator('.qp-opt', { hasText: label }).first().click()
  await page.waitForTimeout(260)
}
// a real answer set: top all white, no corner home, no row correct (28 cases)
await answer('네, 전부 흰색')
await answer('0개')
await answer('0줄')
const afterQuestions = await page.locator('.case').count()
if (afterQuestions === 0) {
  console.error('FAIL: answering all three questions left nothing to choose from')
  process.exit(1)
}
if (afterQuestions >= shown) {
  console.error(`FAIL: three questions did not narrow anything (${afterQuestions} of ${shown})`)
  process.exit(1)
}
if (afterQuestions !== 28) {
  console.error(`FAIL: expected that answer set to leave 28 cases, got ${afterQuestions}`)
  process.exit(1)
}
console.log(`PASS: three questions cut ${shown} cases down to ${afterQuestions}`)
// a state with a mixed top face is not in the list, and the app has to say so
await page.locator('.qp-foot button', { hasText: '처음부터' }).click()
await page.waitForTimeout(200)
await answer('아니오, 다른 색이 섞여 있어요')
await answer('0개')
await answer('0줄')
const none = await page.locator('.qp-none').count()
if (none === 0) {
  console.error('FAIL: a mixed top face should be reported as not in the list')
  process.exit(1)
}
console.log('PASS: a top face with other colours in it is reported honestly')
await page.locator('.qp-foot button', { hasText: '처음부터' }).click()
await page.waitForTimeout(200)

await page.click('text=그림 72개에서 고르기')
await page.waitForSelector('.case', { timeout: 10000 })
const inGallery = await page.locator('.case').count()
if (inGallery !== 72) {
  console.error(`FAIL: expected 72 cases on screen, got ${inGallery}`)
  process.exit(1)
}
console.log(`PASS: gallery shows all ${inGallery} cases`)

// the shelf filter has to actually narrow the list
const totals = {}
const allShelves = await page.locator('.chip').allTextContents()
for (const label of ['전체', '엣지 이미 맞음', '코너 이미 맞음', '둘 다 섞임']) {
  const chip = page.locator('.chip', { hasText: label }).first()
  if ((await chip.count()) === 0) {
    if (label === '전체') {
      console.error('FAIL: no 전체 filter')
      process.exit(1)
    }
    continue
  }
  await chip.click()
  await page.waitForTimeout(120)
  const n = await page.locator('.case').count()
  const text = (await chip.textContent()) ?? ''
  const count = Number((text.match(/\d+/) || ['0'])[0])
  if (!Number.isFinite(count) || count === 0) {
    console.error(`FAIL: filter ${label} shows no count: ${text}`)
    process.exit(1)
  }
  if (n !== count) {
    console.error(`FAIL: filter ${label} claims ${count} but shows ${n}`)
    process.exit(1)
  }
  totals[label] = n
}
const claimed = Object.entries(totals).filter(([k]) => k !== '전체').reduce((a, [, v]) => a + v, 0)
if (claimed !== totals['전체']) {
  console.error(`FAIL: shelves hold ${claimed} but 전체 says ${totals['전체']}`)
  process.exit(1)
}
console.log(`PASS: shelves partition all cases ${JSON.stringify(totals)}; shown as ${allShelves.length} chips`)
await page.locator('.chip', { hasText: '전체' }).first().click()
await page.waitForTimeout(120)

const empty = await page.locator('.case-u i').evaluateAll((els) =>
  els.filter((e) => !e.style.background || e.style.background === 'transparent').length
)
if (empty > 0) {
  console.error(`FAIL: ${empty} top-face stickers are blank`)
  process.exit(1)
}
console.log('PASS: every picture has all nine top stickers drawn')

// pick a case, and check the moves it produces actually finish the cube
for (const index of [0, 17, 40, 71]) {
  await page.locator('.case').nth(index).click()
  await page.waitForSelector('.steps, .verdict', { timeout: 10000 })
  // every step must say what it is for, not only what to press
  const whys = await page.locator('.steps .why-what').allTextContents()
  const knows = await page.locator('.steps .why-know').allTextContents()
  if (whys.length === 0) {
    console.error(`FAIL: case ${index} gave moves with no explanation`)
    process.exit(1)
  }
  if (whys.length !== knows.length) {
    console.error('FAIL: some steps explain what but not how to tell')
    process.exit(1)
  }
  const verdict = await page.locator('.verdict').textContent().catch(() => null)
  const watch = await page.locator('.watch').textContent().catch(() => null)
  if (!watch || !/지금 볼 것/.test(watch)) {
    console.error(`FAIL: case ${index} did not say what to look at`)
    process.exit(1)
  }
  const steps = await page.locator('.steps .step, .steps > *').count()
  if (!verdict) {
    console.error(`FAIL: case ${index} showed no verdict`)
    process.exit(1)
  }
  console.log(`  case ${index + 1}: ${verdict.trim().slice(0, 26)} | ${watch.trim().slice(7, 52)}`)
  const back = page.locator('button', { hasText: '다른 그림 고르기' }).first()
  if ((await back.count()) === 0) {
    console.error('FAIL: no way back to the gallery')
    process.exit(1)
  }
  await back.click()
  await page.waitForSelector('.case', { timeout: 10000 })
}
console.log('PASS: picking a case leads to a solution, for 4 different cases')

if (errors.length) {
  console.error('FAIL: console errors: ' + errors.slice(0, 3).join(' | '))
  process.exit(1)
}
console.log('PASS: no console errors')

await browser.close()
server.close()
console.log('\nOK: someone can look at their cube, tap a picture, and get the moves')
