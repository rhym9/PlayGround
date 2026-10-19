import { build } from 'esbuild'
import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')

const started = performance.now()
await rm(dist, { recursive: true, force: true })
await mkdir(resolve(dist, 'assets'), { recursive: true })
await cp(resolve(root, 'src/index.html'), resolve(dist, 'index.html'))

await build({
  entryPoints: [resolve(root, 'src/main.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2020'],
  outfile: resolve(dist, 'assets/game.js'),
  legalComments: 'none',
  logLevel: 'warning'
})

const html = await stat(resolve(dist, 'index.html'))
const js = await stat(resolve(dist, 'assets/game.js'))
console.log(`[build] dist/index.html ${(html.size / 1024).toFixed(1)} KiB`)
console.log(`[build] dist/assets/game.js ${(js.size / 1024).toFixed(1)} KiB`)
console.log(`[build] completed in ${((performance.now() - started) / 1000).toFixed(2)}s`)
