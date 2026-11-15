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
await page.getByLabel('윗면', { exact: true }).selectOption('D')

const shown = 72
await page.click('text=질문 3개로 좁히기')
await page.waitForSelector('.qp', { timeout: 10000 })
const answer = async (label) => {
  await page.locator('.qp-opt', { hasText: label }).first().click()
  await page.waitForTimeout(260)
}
// a real answer set: top all white, no corner home, no row correct (45 rotations)
await answer('네, 모두 같은 색이에요')
await answer('0개')
await answer('0곳')
const afterQuestions = await page.locator('.case').count()
if (afterQuestions === 0) {
  console.error('FAIL: answering all three questions left nothing to choose from')
  process.exit(1)
}
if (afterQuestions >= shown) {
  console.error(`FAIL: three questions did not narrow anything (${afterQuestions} of ${shown})`)
  process.exit(1)
}
if (afterQuestions !== 45) {
  console.error(`FAIL: expected that answer set to leave 45 rotations, got ${afterQuestions}`)
  process.exit(1)
}
const center = await page.locator('.case-u i').nth(4).evaluate((el) => el.style.backgroundColor)
if (center !== 'rgb(244, 196, 48)') throw new Error('The result pictures lost the chosen yellow top color')
console.log(`PASS: three questions found ${afterQuestions} matching PLL positions with the chosen yellow top`)
// A single mismatched edge is impossible in PLL. Show all images without submitting one.
await page.getByRole('button', { name: '이전 질문' }).click()
await answer('3곳')
await page.getByRole('button', { name: '이 단계의 그림 72개 보기' }).click()
if (await page.locator('.gallery-grid .case').count() !== 72) {
  throw new Error('The no-match fallback did not open all 72 pictures')
}

await page.locator('.qp-foot button', { hasText: '처음부터' }).click()
await answer('아니오, 다른 색이 섞여 있어요')
await page.locator('.cross-example .case-u').waitFor()
await answer('아니오 / 잘 모르겠어요')
await page.getByText(/직접 입력으로 확인할 수 있어요/).waitFor()
if (await page.locator('.gallery-grid .case').count() !== 0) {
  throw new Error('Corner examples were shown without aligned edges')
}
await page.getByRole('button', { name: '이전 질문' }).click()
await answer('네, 십자와 옆면 네 곳이 맞아요')
await answer('0개')
await page.locator('.gallery-grid .case').first().waitFor({ timeout: 60000 })
const ollCases = await page.locator('.case').count()
if (ollCases === 0) {
  console.error('FAIL: the corner stage found nothing to offer')
  process.exit(1)
}
console.log(`PASS: a top face with other colours in it narrows to ${ollCases} corner-stage cases`)

// and picking one of them has to produce a solution that finishes the cube
await page.locator('.case').first().click()
await page.waitForSelector('.steps, .verdict', { timeout: 10000 })
const ollWatch = await page.locator('.watch').textContent()
const ollWhy = await page.locator('.steps .why-what').first().textContent()
if (!/지금 볼 것/.test(ollWatch ?? '') || !ollWhy) {
  console.error('FAIL: a corner-stage case gave no guidance')
  process.exit(1)
}
console.log(`  corner stage: ${ollWatch.trim().slice(7, 46)}`)
await page.getByRole('button', { name: '전체 재생' }).click()
await page.getByRole('status').filter({ hasText: '마지막 층 완성!' }).waitFor({ timeout: 60000 })
console.log('PASS: the corner solution finishes from the question flow')
const back2 = page.locator('button', { hasText: '다른 그림 고르기' }).first()
if ((await back2.count()) === 0) {
  console.error('FAIL: no way back from a corner-stage solution')
  process.exit(1)
}
await back2.click()
await page.waitForTimeout(250)
// that lands on the gallery screen; step back to the questions to get home
const toManual = page.locator('button', { hasText: '직접 입력하러 가기' }).first()
if ((await toManual.count()) === 0) {
  console.error('FAIL: no way from the gallery back to the manual screen')
  process.exit(1)
}
await toManual.click()
await page.waitForTimeout(250)
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
let playedMultipleSteps = false
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
  if (!playedMultipleSteps && steps > 1) {
    if (!(await page.locator('.steps li button').nth(1).isDisabled())) {
      throw new Error('A future step can be played out of order')
    }
    await page.getByRole('button', { name: '다음 단계' }).click()
    const remaining = page.getByRole('button', { name: '남은 단계 재생' })
    await remaining.waitFor({ timeout: 30000 })
    if (await page.getByRole('status').count() !== 0) throw new Error('Completed before all steps ran')
    await remaining.click({ timeout: 30000 })
    await page.getByRole('status').filter({ hasText: '마지막 층 완성!' }).waitFor({ timeout: 60000 })
    playedMultipleSteps = true
    console.log('PASS: a multi-step solution blocks skipped steps and only finishes after the remaining steps')
  }
  const back = page.locator('button', { hasText: '다른 그림 고르기' }).first()
  if ((await back.count()) === 0) {
    console.error('FAIL: no way back to the gallery')
    process.exit(1)
  }
  await back.click()
  await page.waitForSelector('.case', { timeout: 10000 })
}
if (!playedMultipleSteps) throw new Error('No multi-step case was exercised')
console.log('PASS: picking a case leads to a solution, for 4 different cases')

if (errors.length) {
  console.error('FAIL: console errors: ' + errors.slice(0, 3).join(' | '))
  process.exit(1)
}
console.log('PASS: no console errors')

await browser.close()
server.close()
console.log('\nOK: someone can look at their cube, tap a picture, and get the moves')
