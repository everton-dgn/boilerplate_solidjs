/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
/* oxlint-disable vitest/prefer-each -- O runner nativo do Node.js não tem a API it.each. */
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
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
  change: (file: string) => void
  close: () => Promise<void>
}
type ChunkedWrite = {
  file: string
  update: (content: string) => string
  output: string
  expected: RegExp
}
type PartsOptions = { file: string; content: string }

const RUNTIME_FILE = 'paraglide/runtime.js'
const MESSAGES = { home_title: 'Title', home_body: 'Body' }
const POLL_MS = 50
const TIMEOUT_MS = 20_000
const SETTLE_MS = 1500
const HTTP_ERROR = 500
// Pausa entre as partes de uma gravação, menor que a janela de estabilidade
// do watcher.
const WRITE_PAUSE_MS = 20
const CHUNKED_WRITES: ChunkedWrite[] = [
  {
    file: 'project.inlang/settings.json',
    update: content =>
      content.replace('"baseLocale":"pt"', '"baseLocale":"en"'),
    output: RUNTIME_FILE,
    expected: /baseLocale = "en";/u
  },
  {
    file: 'src/routes/Home/i18n/es.json',
    update: () => JSON.stringify({ ...MESSAGES, home_body: 'Nuevo' }),
    output: 'paraglide/messages/home_body.js',
    expected: /Nuevo/u
  }
]

function readRuntime(root: string): Promise<string> {
  return readFile(path.join(root, RUNTIME_FILE), 'utf8')
}

function payloadType(payload: unknown): unknown {
  return typeof payload === 'object' && payload !== null && 'type' in payload
    ? payload.type
    : undefined
}

// Trunca, grava o começo e só depois o restante, como um editor que salva
// em mais de uma escrita.
async function writeInParts({ file, content }: PartsOptions): Promise<void> {
  const middle = content.indexOf(',')
  const handle = await open(file, 'w')
  try {
    await handle.write(content.slice(0, middle))
    await delay(WRITE_PAUSE_MS)
    await handle.write(content.slice(middle))
  } finally {
    await handle.close()
  }
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
    // fs.watch é o backend do Chokidar no Linux do CI. No macOS o padrão é
    // FSEvents e, sem ele, polling; os dois mudam a cadência dos eventos.
    server: {
      middlewareMode: true,
      watch: { useFsEvents: false, usePolling: false }
    },
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
    change: file => {
      server.watcher.emit('change', path.join(server.config.root, file))
    },
    close: () => server.close(),
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
  it('waits for a pending generation when the server closes', async context => {
    const server = await startServer(context)
    await writeSettings({
      root: server.root,
      baseLocale: 'en',
      locales: LOCALES
    })
    server.change('project.inlang/settings.json')

    await server.close()

    assert.match(await readRuntime(server.root), /baseLocale = "en";/u)
  })

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

  it('keeps the watcher disabled when the config disables it', async context => {
    const root = await mkdtemp(path.join(tmpdir(), 'i18n-plugin-'))
    context.after(() => rm(root, { recursive: true, force: true }))
    await writeProject({ root, messages: MESSAGES })
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      server: { middlewareMode: true, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [i18nPlugin()]
    })
    try {
      assert.equal(server.config.server.watch, null)
    } finally {
      await server.close()
    }
  })

  for (const { file, update, output, expected } of CHUNKED_WRITES) {
    it(`publishes only the completed ${file} when it is written in parts`, async context => {
      const server = await startServer(context)
      const target = path.join(server.root, file)

      await writeInParts({
        file: target,
        content: update(await readFile(target, 'utf8'))
      })
      await waitFor(() => server.payloads().includes('full-reload'))
      assert.deepEqual(server.payloads(), ['full-reload'])
      assert.match(
        await readFile(path.join(server.root, output), 'utf8'),
        expected
      )
      assert.notEqual(await server.status(), HTTP_ERROR)
    })
  }
})
