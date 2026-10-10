/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, mock, type TestContext } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import { createServer } from 'vite-plus'

import { moveToTrash } from '../../moveToTrash/index.ts'
import { i18nPlugin } from '../index.ts'

type Messages = Record<string, string>
type MessagesOptions = { root: string; messages: Messages }
type Close = () => Promise<unknown>
type DevServer = {
  root: string
  payloads: () => unknown[]
  status: () => Promise<number>
  body: () => Promise<string>
}

const LOCALES = ['pt', 'en', 'es']
const PLUGIN = path.resolve(
  import.meta.dirname,
  '../../../../node_modules/@inlang/plugin-message-format/dist/index.js'
)
const MESSAGES = { home_title: 'Title', home_body: 'Body' }
const POLL_MS = 50
const TIMEOUT_MS = 20_000
const SETTLE_MS = 1500
const HTTP_ERROR = 500

async function writeMessages({ root, messages }: MessagesOptions) {
  const directory = path.join(root, 'src/routes/Home/messages')
  await mkdir(directory, { recursive: true })
  for (const locale of LOCALES) {
    await writeFile(
      path.join(directory, `${locale}.json`),
      JSON.stringify(messages)
    )
  }
}

async function writeProject(root: string): Promise<void> {
  await mkdir(path.join(root, 'project.inlang'))
  await writeFile(
    path.join(root, 'project.inlang/settings.json'),
    JSON.stringify({
      baseLocale: 'pt',
      locales: LOCALES,
      modules: [PLUGIN],
      'plugin.inlang.messageFormat': {
        pathPattern: './.paraglide/messages/{locale}.json'
      }
    })
  )
  await writeMessages({ root, messages: MESSAGES })
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
// temporária. Um único teardown fecha HTTP e Vite antes de mover a raiz para a
// lixeira, para o watcher não reagir à remoção. Sem comando de lixeira (CI sem
// GLib), a raiz fica no runner efêmero.
async function startServer(context: TestContext): Promise<DevServer> {
  const root = await mkdtemp(path.join(tmpdir(), 'i18n-plugin-'))
  const closers: Close[] = []
  context.after(async () => {
    for (const close of closers.toReversed()) await close()
    await moveToTrash([root])
  })
  await writeProject(root)
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
      path.join(server.root, 'src/routes/Home/messages/es.json'),
      JSON.stringify({ home_title: 'Title' })
    )
    await waitFor(() => server.payloads().includes('error'))
    assert.equal(await server.status(), HTTP_ERROR)
    assert.match(await server.body(), /es\.json: missing keys \[home_body\]/u)

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
})
