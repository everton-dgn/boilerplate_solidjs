import { once } from 'node:events'
import { watch } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mock, type TestContext } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import { createServer, type FSWatcher } from 'vite-plus'

import { generateMessages } from '../../generateMessages/index.ts'
import { writeProject } from '../../testProject/index.ts'
import { i18nPlugin } from '../index.ts'

type Close = () => Promise<unknown>
type StartOptions = {
  context: TestContext
  root?: string
  onClosing?: () => void
  shouldIgnoreCompilerInputs?: boolean
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
// Inputs read by the compiler. The fixture writes them before the scan, and the
// macOS fs.watch can report those writes after ready.
const COMPILER_INPUTS = ['**/project.inlang/**', '**/.paraglide/**']

function payloadType(payload: unknown): unknown {
  return typeof payload === 'object' && payload !== null && 'type' in payload
    ? payload.type
    : undefined
}

// Resolves with the error instead of rejecting: createServer can fail after the
// hook that starts the wait, and it cannot become an unhandled rejection.
async function scanResult(watcher: FSWatcher): Promise<unknown> {
  try {
    await once(watcher, 'ready', { signal: AbortSignal.timeout(TIMEOUT_MS) })
    return null
  } catch (error) {
    return error
  }
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
    update: () => JSON.stringify({ ...MESSAGES, home_body: 'New' }),
    output: 'paraglide/messages/home_body.js',
    expected: /New/u
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

// Real development server, with the Vite watcher and the official plugin, in a
// temporary root. The teardown closes HTTP and Vite before cleaning the root, so
// the watcher does not react to the removal.
export async function startServer({
  context,
  root: existing,
  onClosing,
  shouldIgnoreCompilerInputs = false
}: StartOptions): Promise<DevServer> {
  const root = existing ?? (await mkdtemp(path.join(tmpdir(), 'i18n-plugin-')))
  const closers: Close[] = []
  let scan: Promise<unknown> | undefined
  context.after(async () => {
    for (const close of closers.toReversed()) await close()
    if (!existing) await rm(root, { recursive: true, force: true })
  })
  if (!existing) {
    await writeProject({ root, messages: MESSAGES })
    // Initializes the SDK metadata before watching user edits. Restarts use the
    // previous output to check the real recovery.
    await generateMessages(root)
  }
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    // Vite hands Chokidar the .env files and the public folder of the root, which
    // the fixture does not have, and the Chokidar bundled in Vite+ counts the ready
    // of each missing path twice. The event then goes out with subfolders still to
    // scan, and the first write is lost.
    envDir: false,
    publicDir: false,
    // fs.watch is the Chokidar backend on the CI Linux. On macOS the default is
    // FSEvents and, without it, polling; both change the cadence of the events.
    server: {
      middlewareMode: true,
      watch: {
        useFsEvents: false,
        usePolling: false,
        ...(shouldIgnoreCompilerInputs ? { ignored: COMPILER_INPUTS } : {})
      }
    },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      i18nPlugin(),
      {
        name: 'test:lifecycle-observer',
        // The chokidar `ready` can go out before createServer resolves. Until the
        // first configureServer, Vite+ only runs microtasks, and the scan depends
        // on I/O, so the event has not gone out here yet. If an update changes
        // that order, the wait runs past TIMEOUT_MS.
        configureServer: {
          order: 'pre',
          handler: devServer => {
            scan = scanResult(devServer.watcher)
          }
        },
        closeBundle: onClosing
      }
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
  // Lets the watcher finish the initial scan before the changes.
  const scanError = await scan
  if (scanError !== null) {
    throw new Error('The watcher did not finish the initial scan', {
      cause: scanError
    })
  }
  // On macOS, libuv recreates the FSEvents stream in its own thread for each
  // watched folder, and the new stream ignores what came before it. ready does
  // not wait for that thread. Closing a folder watch blocks until the thread
  // drains the queue, and the following folder events reach the stream.
  watch(root).close()
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
