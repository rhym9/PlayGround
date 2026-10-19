import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const url = process.env.CAPTURE_URL
const output = process.env.CAPTURE_DIR
if (!url) fail(1, 'CAPTURE_URL is required')
if (!output) fail(1, 'CAPTURE_DIR is required')

let config
let chromium
try {
  const runtime = join(process.env.HOME, '.local/share/omgithub-playwright')
  const configName = process.platform === 'darwin' ? 'metal.json' : 'linux.json'
  config = JSON.parse(readFileSync(join(runtime, configName), 'utf8'))
  if (process.platform === 'linux') {
    process.env.DISPLAY ||= ':' + readFileSync(join(runtime, 'display'), 'utf8').trim()
  }
  const require = createRequire(join(runtime, 'package.json'))
  ;({ chromium } = require('playwright'))
} catch (error) {
  fail(75, `Browser runtime unavailable: ${error.message}`)
}

try {
  mkdirSync(output, { recursive: true })
} catch (error) {
  fail(75, `Cannot create capture directory: ${error.message}`)
}

function fail(code, message) {
  console.error(`[capture] ${message}`)
  process.exit(code)
}

async function timed(label, fn) {
  const started = process.hrtime.bigint()
  try {
    return await fn()
  } finally {
    const ms = Number(process.hrtime.bigint() - started) / 1e6
    console.log(`[capture] ${label}: ${ms.toFixed(0)} ms`)
  }
}

const transient = (error) => Object.assign(error, { exitCode: 75 })
const classify = (error) => {
  if (error?.exitCode) return error.exitCode
  if (/timeout|net::|ERR_|Target (page|browser)|browser has been closed|Protocol error/i.test(String(error?.message || error))) return 75
  return 1
}

const views = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
]

let browser
try {
  browser = await timed('launch browser', () =>
    chromium.launch({ ...config.browser.launchOptions, timeout: 30000 }).catch(transient)
  )

  for (const view of views) {
    const context = await timed(`create ${view.name} context`, () =>
      browser.newContext({
        viewport: view.viewport,
        deviceScaleFactor: view.deviceScaleFactor,
        isMobile: view.isMobile,
        hasTouch: view.hasTouch,
        locale: 'en-US'
      }).catch(transient)
    )
    const page = await timed(`open ${view.name} page`, () => context.newPage().catch(transient))
    page.setDefaultTimeout(30000)

    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
      console.error(`[capture] ${view.name} pageerror: ${error.message}`)
    })

    const response = await timed(`${view.name} navigate`, () =>
      page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(transient)
    )
    if (!response || !response.ok()) {
      const status = response?.status()
      const code = !response || [408, 425, 429, 500, 502, 503, 504].includes(status) ? 75 : 1
      await context.close().catch(() => {})
      fail(code, `HTTP ${status ?? 'network error'} loading ${url}`)
    }

    await timed(`${view.name} wait rendered`, async () => {
      try {
        await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 30000 })
        const canvas = page.locator('#game')
        await canvas.waitFor({ state: 'visible', timeout: 10000 })
        const size = await canvas.evaluate((element) => ({ width: element.width, height: element.height }))
        if (!size.width || !size.height) throw new Error('Game canvas has no drawing buffer')
        const frames = await page.evaluate(() => window.__GAME_FRAMES__ || 0)
        if (frames < 2) throw new Error('Game render loop did not advance')
      } catch (error) {
        if (!browser.isConnected()) throw transient(error)
        const detail = pageErrors.length ? ` Page errors: ${pageErrors.join(' | ')}` : ''
        throw Object.assign(new Error(`Game failed to render: ${error.message}.${detail}`), { exitCode: 1 })
      }
    })

    const started = await timed(`${view.name} start game`, async () => {
      try {
        await page.locator('#play-button').click({ timeout: 5000 })
      } catch {
        return false
      }
      try {
        await page.waitForFunction(() => window.__GAME_STATE__?.mode === 'running', null, { timeout: 8000 })
      } catch (error) {
        if (!browser.isConnected() || /Target (page|browser)|has been closed/i.test(error.message)) throw transient(error)
        throw Object.assign(new Error('Game did not enter the running state after START RUN'), { exitCode: 1 })
      }
      return true
    })
    if (!started) throw new Error('START RUN control did not start the game')

    await timed(`${view.name} settle`, () => page.waitForTimeout(2200))

    const render = await timed(`${view.name} verify render`, async () => {
      const snapshot = await page.evaluate(() => {
        const state = window.__GAME_STATE__
        return {
          mode: state?.mode,
          frames: window.__GAME_FRAMES__ || 0,
          lane: state?.lane,
          speed: state?.speed,
          lives: state?.lives,
          info: window.__NEON_RUN__?.rendererInfo?.()
        }
      })
      if (snapshot.mode !== 'running') throw new Error(`Game stopped unexpectedly (mode ${snapshot.mode})`)
      if (!snapshot.frames || snapshot.frames < 8) throw new Error(`Too few rendered frames (${snapshot.frames})`)
      if (!snapshot.info?.calls) throw new Error('WebGL renderer produced no draw calls')
      console.log(`[capture] ${view.name} frames=${snapshot.frames} calls=${snapshot.info.calls} triangles=${snapshot.info.triangles} speed=${snapshot.speed.toFixed(1)}`)
      return snapshot
    })

    if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`)

    const target = join(output, `final-${view.name}.png`)
    await timed(`${view.name} screenshot`, () =>
      page.screenshot({ path: target, timeout: 30000, animations: 'disabled' }).catch((error) => {
        if (error.name === 'TimeoutError' || !browser.isConnected()) transient(error)
        throw error
      })
    )
    const size = statSync(target).size
    if (size < 20 * 1024) throw new Error(`Screenshot looks empty (${size} bytes): ${target}`)
    console.log(`[capture] ${view.name} screenshot: ${target} (${(size / 1024).toFixed(0)} KiB) render=${JSON.stringify(render.info)}`)

    await timed(`close ${view.name} context`, () => context.close().catch(transient))
  }
} catch (error) {
  console.error(`[capture] ${error?.stack || error}`)
  process.exitCode = classify(error)
} finally {
  await browser?.close().catch(() => { process.exitCode ||= 75 })
}
