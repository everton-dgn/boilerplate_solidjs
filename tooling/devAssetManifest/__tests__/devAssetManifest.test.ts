/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'node:test'
import { setImmediate } from 'node:timers/promises'

import solid from '@solidjs/vite-plugin'
import { createServer } from 'vite-plus'

import { devAssetManifest } from '../index.ts'

const MANIFEST_ID = '\0virtual:solid-manifest'
const HTTP_OK = 200

it('resolves route CSS after an early manifest import and an automatic port retry', async context => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-assets-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'page.ts'), "import './page.css'")
  await writeFile(path.join(root, 'page.css'), '.probe { color: red; }')
  const occupied = createHttpServer().listen(0, '127.0.0.1')
  context.after(async () => {
    const closed = once(occupied, 'close')
    occupied.close()
    await closed
  })
  await once(occupied, 'listening')
  const occupiedAddress = occupied.address()
  assert.ok(occupiedAddress !== null && typeof occupiedAddress === 'object')
  const started = Promise.withResolvers<string>()
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: {
      host: '127.0.0.1',
      port: occupiedAddress.port,
      watch: null,
      ws: false
    },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      {
        name: 'eager-manifest-probe',
        enforce: 'pre',
        load(id) {
          if (id === MANIFEST_ID) started.resolve(id)
        }
      },
      devAssetManifest(),
      solid({ ssr: true })
    ]
  })
  context.after(() => server.close())
  const manifest = server.environments.ssr.transformRequest(MANIFEST_ID)
  assert.equal(await started.promise, MANIFEST_ID)
  // Deixa a importação adiantada progredir antes do bind, como no Nitro.
  await setImmediate()
  await server.listen()
  const address = server.httpServer?.address()
  assert.ok(address !== null && typeof address === 'object')
  assert.notEqual(address.port, occupiedAddress.port)
  const origin = `http://127.0.0.1:${address.port}`
  const result = await manifest
  assert.ok(result)
  assert.ok(
    result.code.includes(
      `const bridgeUrl = "${origin}/@solidjs/vite-plugin/dev-manifest"`
    ),
    'An isolated SSR worker must receive the listening bridge URL'
  )
  const url = `${origin}/@solidjs/vite-plugin/dev-manifest?key=page.ts`
  const response = await fetch(url)
  assert.equal(response.status, HTTP_OK)
  const assets = await response.text()
  assert.match(assets, /page\.css/u)
  assert.match(assets, /\.probe/u)
  const repeated = await fetch(url)
  assert.equal(await repeated.text(), assets)
})

it('does not wait for an HTTP listener in middleware mode', async context => {
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [devAssetManifest(), solid({ ssr: true })]
  })
  context.after(() => server.close())
  const result = await server.environments.ssr.transformRequest(MANIFEST_ID)
  assert.ok(result)
  assert.match(result.code, /const bridgeUrl = null/u)
})

it('releases an eager manifest import when closed before listen', async context => {
  const started = Promise.withResolvers<string>()
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { host: '127.0.0.1', port: 0, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      {
        name: 'cancelled-manifest-probe',
        enforce: 'pre',
        load(id) {
          if (id === MANIFEST_ID) started.resolve(id)
        }
      },
      devAssetManifest(),
      solid({ ssr: true })
    ]
  })
  context.after(() => server.close())
  const manifest = server.environments.ssr.transformRequest(MANIFEST_ID)
  const settled = Promise.allSettled([manifest])
  assert.equal(await started.promise, MANIFEST_ID)
  await setImmediate()
  await server.close()
  await settled
  assert.equal(server.httpServer?.listening, false)
})
