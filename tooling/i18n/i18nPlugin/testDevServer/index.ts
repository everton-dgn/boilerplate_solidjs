/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mock, type TestContext } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import { createServer } from 'vite-plus'

import { generateMessages } from '../../generateMessages/index.ts'
import { writeProject } from '../../testProject/index.ts'
import { i18nPlugin } from '../index.ts'

type Close = () => Promise<unknown>
type StartOptions = {
  context: TestContext
  root?: string
  onClosing?: () => void
  shouldDelayWatchEvents?: boolean
}
type DevServer = {
  root: string
  payloads: () => unknown[]
  status: () => Promise<number>
  body: () => Promise<string>
  change: (file: string) => void
  close: () => Promise<void>
}
type ProjectWrite = {
  file: string
  update: (content: string) => string
  output: string
  expected: RegExp
}
type ContainsOptions = { root: string; file: string; expected: RegExp }

const RUNTIME_FILE = 'paraglide/runtime.js'
const TIMEOUT_MS = 20_000
const SETTLE_MS = 1500
const CACHE_TEST_STABILITY_MS = 1000

function payloadType(payload: unknown): unknown {
  return typeof payload === 'object' && payload !== null && 'type' in payload
    ? payload.type
    : undefined
}

export const MESSAGES = { home_title: 'Title', home_body: 'Body' }
export const POLL_MS = 50
export const PROJECT_WRITES: ProjectWrite[] = [
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

export function readRuntime(root: string): Promise<string> {
  return readFile(path.join(root, RUNTIME_FILE), 'utf8')
}

export async function contains({
  root,
  file,
  expected
}: ContainsOptions): Promise<boolean> {
  try {
    return expected.test(await readFile(path.join(root, file), 'utf8'))
  } catch {
    return false
  }
}

export async function waitFor(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the watcher')
    }
    await delay(POLL_MS)
  }
}

// Servidor de desenvolvimento real, com o watcher do Vite e o plugin oficial,
// numa raiz temporária. O teardown fecha HTTP e Vite antes de limpar a raiz,
// para o watcher não reagir à remoção.
export async function startServer({
  context,
  root: existing,
  onClosing,
  shouldDelayWatchEvents = false
}: StartOptions): Promise<DevServer> {
  const root = existing ?? (await mkdtemp(path.join(tmpdir(), 'i18n-plugin-')))
  const closers: Close[] = []
  context.after(async () => {
    for (const close of closers.toReversed()) await close()
    if (!existing) await rm(root, { recursive: true, force: true })
  })
  if (!existing) {
    await writeProject({ root, messages: MESSAGES })
    // Inicializa os metadados do SDK antes de observar edições do usuário.
    // Reinícios usam a saída anterior para verificar a recuperação real.
    await generateMessages(root)
  }
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    // fs.watch é o backend do Chokidar no Linux do CI. No macOS o padrão é
    // FSEvents e, sem ele, polling; os dois mudam a cadência dos eventos.
    server: {
      middlewareMode: true,
      watch: {
        useFsEvents: false,
        usePolling: false,
        ...(shouldDelayWatchEvents
          ? {
              awaitWriteFinish: {
                stabilityThreshold: CACHE_TEST_STABILITY_MS,
                pollInterval: 10
              }
            }
          : {})
      }
    },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      i18nPlugin(),
      { name: 'test:shutdown-observer', closeBundle: onClosing }
    ]
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
