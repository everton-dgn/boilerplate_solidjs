/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { once } from 'node:events'
import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import { build, createServer } from 'vite-plus'

import { writeProject } from '../../../i18n/testProject/index.ts'
import { markdownPlugin } from '../index.ts'

type Close = () => Promise<unknown>
type BodyIncludesOptions = { url: string; text: string }

const ROOT = path.resolve(import.meta.dirname, '../../../..')
const TIMEOUT_MS = 20_000
const POLL_MS = 50
const SETTLE_MS = 1000
const HTTP_OK = 200
const HTTP_ERROR = 500

async function bodyIncludes(options: BodyIncludesOptions): Promise<boolean> {
  const response = await fetch(options.url)
  const body = await response.text()
  return body.includes(options.text)
}

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Markdown watcher timed out')
    await delay(POLL_MS)
  }
}

function producer(title: string): string {
  return `export const markdown = { render: () => ({ title: ${JSON.stringify(title)}, description: 'Description', intro: 'Public text', sections: [], links: [] }) };`
}

it('serves generated snapshots, refreshes changed sources and recovers from generation errors', async context => {
  const root = await mkdtemp(path.join(tmpdir(), 'markdown-dev-'))
  const closers: Close[] = []
  context.after(async () => {
    for (const close of closers.toReversed()) await close()
    await rm(root, { recursive: true, force: true })
  })
  await writeProject({ root, messages: { home_title: 'Title' } })
  await symlink(path.join(ROOT, 'tooling'), path.join(root, 'tooling'))
  await mkdir(path.join(root, 'src/i18n/urls'), { recursive: true })
  await copyFile(
    path.join(ROOT, 'src/i18n/urls/index.ts'),
    path.join(root, 'src/i18n/urls/index.ts')
  )
  const source = path.join(root, 'src/routes/Home/markdown.ts')
  await writeFile(source, producer('First snapshot'))
  await writeFile(
    path.join(root, 'src/routes/Home/index.tsx'),
    `export const route = { info: { markdown: { source: '@/routes/Home/markdown.ts' } } }; export default function Home() { return null; }`
  )
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [markdownPlugin({ directory: 'src/routes' })]
  })
  closers.push(() => server.close())
  const http = createHttpServer(server.middlewares).listen(0, '127.0.0.1')
  closers.push(async () => {
    http.closeAllConnections()
    http.close()
    await once(http, 'close')
  })
  await once(http, 'listening')
  await delay(SETTLE_MS)
  const address = http.address()
  assert.ok(address !== null && typeof address === 'object')
  const url = `http://127.0.0.1:${address.port}/en/Home.md`
  const initial = await fetch(url)
  assert.equal(initial.status, HTTP_OK)
  assert.equal(initial.headers.get('content-language'), 'en')
  assert.equal(initial.headers.get('set-cookie'), null)
  const body = await initial.text()
  assert.ok(body.includes('First snapshot'))
  const send = context.mock.method(server.ws, 'send')
  await writeFile(
    path.join(root, 'src/unrelated.css'),
    '.example { color: red; }'
  )
  await delay(SETTLE_MS)
  assert.equal(send.mock.callCount(), 0)
  await writeFile(source, producer('Updated snapshot'))
  await waitFor(() => bodyIncludes({ url, text: 'Updated snapshot' }))
  await writeFile(
    source,
    'export const markdown = { render: () => { throw new Error("invalid source"); } };'
  )
  await waitFor(async () => {
    const response = await fetch(url)
    await response.body?.cancel()
    return response.status === HTTP_ERROR
  })
  await writeFile(source, producer('Recovered snapshot'))
  await waitFor(() => bodyIncludes({ url, text: 'Recovered snapshot' }))
  const head = await fetch(url, { method: 'HEAD' })
  assert.equal(head.status, HTTP_OK)
  assert.equal(await head.text(), '')
})

it('rejects importing a Markdown producer into an application bundle', async context => {
  const root = await mkdtemp(path.join(tmpdir(), 'markdown-bundle-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'src'))
  const source = path.join(root, 'src/markdown.ts')
  await writeFile(source, producer('Build only'))
  await assert.rejects(
    build({
      root,
      configFile: false,
      logLevel: 'silent',
      build: { write: false, rolldownOptions: { input: source } },
      plugins: [markdownPlugin({ directory: 'src', shouldGenerate: false })]
    }),
    /Markdown producers are build-only/u
  )
})
