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
import assert from 'node:assert/strict'
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
const url = `http://localhost:${PORT}/`
const evidence = process.env.RUBIKS_QA_DIR

async function verifyManual({ noWebGL, viewport }) {
  const page = await browser.newPage({ viewport })
  const errors = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    if (noWebGL && /WebGL context|Error creating WebGL/.test(message.text())) return
    errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  try {
    if (noWebGL) {
      await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext
        HTMLCanvasElement.prototype.getContext = function (type, ...options) {
          return /^webgl|^experimental-webgl/.test(type) ? null : getContext.call(this, type, ...options)
        }
      })
    }
    await page.goto(url, { waitUntil: 'networkidle' })
    assert.equal(page.url(), url)
    assert.match(await page.title(), /큐브 라스트/)
    await page.getByRole('heading', { name: '큐브 라스트' }).waitFor()
    await page.getByLabel('윗면', { exact: true }).selectOption('D')
    await page.getByLabel('앞면', { exact: true }).selectOption('F')

    const canvas = page.locator('canvas')
    if (noWebGL) await page.getByText(/3D 미리보기를 쓸 수 없어/).waitFor()
    else await canvas.waitFor()
    assert.match(await page.locator('.sticker').nth(4).getAttribute('aria-label'), /노란색/)
    assert.equal(await page.locator('.sticker').nth(4).isDisabled(), true)
    assert.equal(await page.locator('.sticker').nth(4).evaluate((el) => el.style.backgroundColor), 'rgb(244, 196, 48)')
    if (evidence && !noWebGL) await page.screenshot({ path: join(evidence, 'mobile-input.png'), fullPage: true })

    // A single U on a solved cube with yellow up and green front.
    const sideColors = ['파란색', '주황색', '빨간색', '초록색']
    for (const [row, color] of sideColors.entries()) {
      for (let column = 0; column < 3; column++) {
        await page.locator('.sticker').nth(9 + row * 3 + column).click()
        await page.getByRole('button', { name: color, exact: true }).click()
      }
    }

    await page.getByRole('button', { name: '해답 보기' }).click()
    const next = page.getByRole('button', { name: '다음 단계' })
    const replay = page.getByRole('button', { name: '마지막 단계 다시 보기' })
    const complete = page.getByRole('status').filter({ hasText: '마지막 층 완성!' })
    await next.waitFor()
    assert.equal(await page.locator('.steps li').count(), 1)
    assert.equal(await complete.count(), 0)
    assert.match(await page.locator('.watch').innerText(), /틀린/)
    const before = noWebGL ? null : await canvas.screenshot()
    if (before) assert.ok(before.length > 2000, '3D canvas is blank')

    await next.click()
    if (!noWebGL) assert.equal(await page.getByRole('button', { name: '수동 수정' }).isDisabled(), true)
    await complete.waitFor()
    assert.match(await page.locator('.watch').innerText(), /옆면 네 줄이 모두 맞아요/)
    assert.equal(await next.isDisabled(), true)
    if (noWebGL) {
      const rows = await page.locator('.mininet .case-row').evaluateAll((elements) =>
        elements.map((row) => Array.from(row.querySelectorAll('i'), (cell) => cell.style.backgroundColor))
      )
      assert.deepEqual(rows, [
        Array(3).fill('rgb(42, 157, 75)'),
        Array(3).fill('rgb(240, 124, 30)'),
        Array(3).fill('rgb(38, 100, 216)'),
        Array(3).fill('rgb(215, 38, 61)'),
      ])
    } else {
      const after = await canvas.screenshot()
      assert.ok(!before.equals(after), '3D frame still shows the scrambled state')
    }

    await replay.click()
    await complete.waitFor()
    assert.equal(await next.isDisabled(), true)
    if (evidence) await page.screenshot({
      path: join(evidence, noWebGL ? 'desktop-2d-solved.png' : 'mobile-3d-solved.png'),
      fullPage: true,
    })

    await page.getByRole('button', { name: '수동 수정' }).click()
    await page.getByRole('button', { name: '해답 보기' }).click()
    await page.getByText('마지막 층 이미 완성입니다').waitFor()
    assert.equal(await page.locator('vite-error-overlay').count(), 0)
    assert.deepEqual(errors, [])
    console.log(`PASS: ${noWebGL ? '2D fallback' : 'WebGL'} ${viewport.width}×${viewport.height} — yellow input → verified solve → replay → solved input`)
  } finally {
    await page.close()
  }
}

try {
  await verifyManual({ noWebGL: false, viewport: { width: 420, height: 900 } })
  await verifyManual({ noWebGL: true, viewport: { width: 1100, height: 900 } })
} finally {
  await browser.close()
  server.close()
}
