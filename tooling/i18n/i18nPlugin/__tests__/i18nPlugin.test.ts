/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, mock, type TestContext } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import { createServer } from 'vite-plus'

import {
  LOCALES,
  writeMessages,
  writeProject,
  writeSettings
} from '../../testProject/index.ts'
import { i18nPlugin } from '../index.ts'

type Close = () => Promise<unknown>
type DevServer = {
  root: string
  payloads: () => unknown[]
  status: () => Promise<number>
  body: () => Promise<string>
}

const RUNTIME_FILE = 'paraglide/runtime.js'
const MESSAGES = { home_title: 'Title', home_body: 'Body' }
const POLL_MS = 50
const TIMEOUT_MS = 20_000
const SETTLE_MS = 1500
const HTTP_ERROR = 500

function readRuntime(root: string): Promise<string> {
  return readFile(path.join(root, RUNTIME_FILE), 'utf8')
}

function payloadType(payload: unknown): unknown {
  return typeof payload === 'object' && payload !== null && 'type' in payload
    ? payload.type
    : undefined
}

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the watcher')
    }
    await delay(POLL_MS)
  }
}

// Servidor de desenvolvimento real, com o watcher do Vite, numa raiz
// temporária. O teardown fecha HTTP e Vite antes de limpar a raiz, para o
// watcher não reagir à remoção.
async function startServer(context: TestContext): Promise<DevServer> {
  const root = await mkdtemp(path.join(tmpdir(), 'i18n-plugin-'))
  const closers: Close[] = []
  context.after(async () => {
    for (const close of closers.toReversed()) await close()
    await rm(root, { recursive: true, force: true })
  })
  await writeProject({ root, messages: MESSAGES })
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [i18nPlugin()]
  })
  closers.push(() => server.close())
  const send = mock.method(server.ws, 'send')
  const http = createHttpServer(server.middlewares).listen(0, '127.0.0.1')
  closers.push(async () => {
    http.close()
    await once(http, 'close')
  })
  await once(http, 'listening')
  // Deixa o watcher terminar a varredura inicial antes das mudanças.
  await delay(SETTLE_MS)
  const address = http.address()
  if (typeof address !== 'object' || address === null) {
    throw new Error('Missing test server address')
  }
  const url = `http://127.0.0.1:${address.port}/`
  return {
    root,
    payloads: () => send.mock.calls.map(call => payloadType(call.arguments[0])),
    status: async () => {
      const response = await fetch(url)
      await response.body?.cancel()
      return response.status
    },
    body: async () => {
      const response = await fetch(url)
      return response.text()
    }
  }
}

describe('i18n dev watcher', () => {
  it('blocks requests while a catalog is invalid and recovers after the fix', async context => {
    const server = await startServer(context)
    assert.notEqual(await server.status(), HTTP_ERROR)

    await writeFile(
      path.join(server.root, 'src/routes/Home/i18n/es.json'),
      JSON.stringify({ home_title: 'Title' })
    )
    await waitFor(() => server.payloads().includes('error'))
    assert.equal(await server.status(), HTTP_ERROR)
    assert.match(
      await server.body(),
      /es\.json: missing-translation.*home_body/u
    )

    await writeMessages({ root: server.root, messages: MESSAGES })
    await waitFor(() => server.payloads().includes('full-reload'))
    assert.notEqual(await server.status(), HTTP_ERROR)
  })

  it('reloads once per catalog change without cascades from generated files', async context => {
    const server = await startServer(context)

    await writeMessages({
      root: server.root,
      messages: { ...MESSAGES, home_body: 'New' }
    })
    await waitFor(() => server.payloads().includes('full-reload'))
    // Agregados, saída e eventos repetidos não podem gerar outro reload.
    await delay(SETTLE_MS)
    assert.deepEqual(server.payloads(), ['full-reload'])
  })

  // O reload chega pelo `send` do servidor original: um restart trocaria o ws.
  it('regenerates the runtime when the base locale changes', async context => {
    const server = await startServer(context)
    assert.match(await readRuntime(server.root), /baseLocale = "pt";/u)

    await writeSettings({
      root: server.root,
      baseLocale: 'en',
      locales: LOCALES
    })
    await waitFor(() => server.payloads().includes('full-reload'))
    assert.match(await readRuntime(server.root), /baseLocale = "en";/u)
    assert.ok(!server.payloads().includes('error'))
  })

  it('reloads compiler configuration and blocks invalid options', async context => {
    const server = await startServer(context)
    const file = path.join(server.root, 'project.inlang/paraglide.config.ts')
    const source = await readFile(file, 'utf8')

    await writeFile(
      file,
      source.replace("trailingSlash: 'never'", "trailingSlash: 'invalid'")
    )
    await waitFor(() => server.payloads().includes('error'))
    assert.equal(await server.status(), HTTP_ERROR)

    await writeFile(
      file,
      source.replace("cookieName: 'locale'", "cookieName: 'test-locale'")
    )
    await waitFor(() => server.payloads().includes('full-reload'))
    assert.notEqual(await server.status(), HTTP_ERROR)
    assert.match(await readRuntime(server.root), /cookieName = "test-locale"/u)
  })

  it('blocks requests while the locale settings are invalid and recovers after the fix', async context => {
    const server = await startServer(context)

    await writeSettings({
      root: server.root,
      baseLocale: 'pt',
      locales: [...LOCALES, 'fr']
    })
    await waitFor(() => server.payloads().includes('error'))
    assert.equal(await server.status(), HTTP_ERROR)
    assert.match(await server.body(), /missing locales \[fr\]/u)

    await writeSettings({
      root: server.root,
      baseLocale: 'pt',
      locales: LOCALES
    })
    await waitFor(() => server.payloads().includes('full-reload'))
    assert.notEqual(await server.status(), HTTP_ERROR)
  })
})
