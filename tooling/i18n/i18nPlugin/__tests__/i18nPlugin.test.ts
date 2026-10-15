/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
/* oxlint-disable vitest/prefer-each -- O runner nativo do Node.js não tem a API it.each. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, mock, type TestContext } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { createServer } from 'vite-plus'

import { generateMessages } from '../../generateMessages/index.ts'
import {
  LOCALES,
  writeMessages,
  writeProject,
  writeSettings
} from '../../testProject/index.ts'
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
type PartsOptions = { file: string; content: string }
type ContainsOptions = { root: string; file: string; expected: RegExp }

const RUNTIME_FILE = 'paraglide/runtime.js'
const MESSAGES = { home_title: 'Title', home_body: 'Body' }
const POLL_MS = 50
const TIMEOUT_MS = 20_000
const SETTLE_MS = 1500
const HTTP_ERROR = 500
// Mantém as duas partes dentro da janela de agrupamento dos catálogos.
const WRITE_PAUSE_MS = 20
const CACHE_TEST_STABILITY_MS = 1000
const PROJECT_WRITES: ProjectWrite[] = [
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
const PLUGIN_URL = pathToFileURL(
  path.resolve(import.meta.dirname, '../index.ts')
)
// Outro processo, sem o estado do módulo do plugin oficial: só o cache em
// disco e a preparação da inicialização decidem a nova compilação.
const START_IN_NEW_PROCESS = `
const { createServer } = await import('vite-plus')
const { i18nPlugin } = await import(${JSON.stringify(PLUGIN_URL.href)})
const server = await createServer({
  root: process.cwd(),
  configFile: false,
  logLevel: 'silent',
  appType: 'custom',
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [i18nPlugin()]
})
await server.close()
`
const execute = promisify(execFile)

function readRuntime(root: string): Promise<string> {
  return readFile(path.join(root, RUNTIME_FILE), 'utf8')
}

async function contains({
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

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

function payloadType(payload: unknown): unknown {
  return typeof payload === 'object' && payload !== null && 'type' in payload
    ? payload.type
    : undefined
}

async function temporaryFiles(root: string): Promise<string[]> {
  const files = await readdir(path.join(root, '.paraglide'), {
    recursive: true
  })
  return files.filter(file => file.endsWith('.tmp'))
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

async function waitFor(check: () => Promise<boolean>): Promise<void> {
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
async function startServer({
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

describe('i18n dev shutdown', () => {
  for (const restart of ['same process', 'new process']) {
    it(`recovers an overlapping write after shutdown in the ${restart}`, async context => {
      const closing = Promise.withResolvers<null>()
      const server = await startServer({
        context,
        onClosing: () => closing.resolve(null),
        // Esta fixture retém o segundo evento para reproduzir o cache obsoleto.
        // O plugin preserva a configuração do watcher escolhida pelo consumidor.
        shouldDelayWatchEvents: true
      })
      const source = path.join(server.root, 'src/routes/Home/i18n/es.json')
      const aggregate = '.paraglide/messages/es.json'
      const aggregatePath = await realpath(path.join(server.root, aggregate))
      const output = 'paraglide/messages/home_body.js'
      const released = Promise.withResolvers<null>()
      const read = fs.promises.readFile
      let shouldPause = true

      // Preserva os bytes lidos pelo compilador enquanto outra preparação
      // publica o agregado novo, antes de calcular o digest.
      context.mock.method(
        fs.promises,
        'readFile',
        async (...args: Parameters<typeof read>) => {
          const content = await read(...args)
          if (
            shouldPause &&
            args[0] === aggregatePath &&
            content.toString().includes('Primero')
          ) {
            shouldPause = false
            await released.promise
          }
          return content
        }
      )
      try {
        await writeFile(
          source,
          JSON.stringify({ ...MESSAGES, home_body: 'Primero' })
        )
        await waitFor(() => Promise.resolve(!shouldPause))
        context.diagnostic('Compiler paused after reading Primero')
        await writeFile(
          source,
          JSON.stringify({ ...MESSAGES, home_body: 'Segundo' })
        )
        await waitFor(() =>
          contains({ root: server.root, file: aggregate, expected: /Segundo/u })
        )
        context.diagnostic('Aggregate now contains Segundo')
        const stopped = server.close()
        await closing.promise
        released.resolve(null)
        await stopped
        context.diagnostic('Shutdown completed after releasing the compiler')
        assert.match(
          await readFile(path.join(server.root, output), 'utf8'),
          /Primero/u
        )
        assert.match(await readFile(aggregatePath, 'utf8'), /Segundo/u)

        if (restart === 'new process') {
          const result = await execute(
            process.execPath,
            ['--input-type=module', '--eval', START_IN_NEW_PROCESS],
            { cwd: server.root }
          )
          context.diagnostic(result.stdout.trim())
        } else {
          await startServer({ context, root: server.root })
        }
        assert.match(
          await readFile(path.join(server.root, output), 'utf8'),
          /Segundo/u
        )
      } finally {
        released.resolve(null)
      }
    })
  }

  it('waits for a pending preparation when the server closes', async context => {
    const server = await startServer({ context })
    await writeFile(
      path.join(server.root, 'src/routes/Home/i18n/es.json'),
      JSON.stringify({ ...MESSAGES, home_body: 'Cierre' })
    )
    server.change('src/routes/Home/i18n/es.json')

    await server.close()

    assert.match(
      await readFile(
        path.join(server.root, '.paraglide/messages/es.json'),
        'utf8'
      ),
      /Cierre/u
    )
    assert.deepEqual(await temporaryFiles(server.root), [])
  })

  // O watcher pode fechar antes de entregar o evento da escrita.
  // A próxima inicialização precisa refletir o arquivo salvo em disco.
  for (const { file, update, output, expected } of PROJECT_WRITES) {
    it(`preserves a ${file} write across an immediate shutdown and restart`, async context => {
      const first = await startServer({ context })
      const target = path.join(first.root, file)
      const options = { root: first.root, file: output, expected }

      await writeFile(target, update(await readFile(target, 'utf8')))
      await first.close()

      await startServer({ context, root: first.root })
      assert.equal(await contains(options), true)
    })
  }

  it('preserves a write across an immediate shutdown and a new process', async context => {
    const server = await startServer({ context })
    const { file, update, output, expected } = PROJECT_WRITES[1] ?? {}
    assert.ok(file && update && output && expected)
    const target = path.join(server.root, file)
    const options = { root: server.root, file: output, expected }

    await writeFile(target, update(await readFile(target, 'utf8')))
    await server.close()

    await execute(
      process.execPath,
      ['--input-type=module', '--eval', START_IN_NEW_PROCESS],
      { cwd: server.root }
    )
    assert.equal(await contains(options), true)
  })
})

describe('i18n dev updates', () => {
  it('blocks requests while a catalog is invalid and recovers after the fix', async context => {
    const server = await startServer({ context })
    assert.notEqual(await server.status(), HTTP_ERROR)

    await writeFile(
      path.join(server.root, 'src/routes/Home/i18n/es.json'),
      JSON.stringify({ home_title: 'Title' })
    )
    await waitFor(async () => (await server.status()) === HTTP_ERROR)
    assert.ok(server.payloads().includes('error'))
    assert.match(
      await server.body(),
      /es\.json: missing-translation.*home_body/u
    )

    await writeMessages({ root: server.root, messages: MESSAGES })
    await waitFor(async () => (await server.status()) !== HTTP_ERROR)
    // Os agregados voltam ao conteúdo anterior e não geram HMR; o reload da
    // preparação remove o overlay do erro que ela publicou.
    assert.ok(server.payloads().includes('full-reload'))
  })

  it('compiles a catalog change without cascades from generated files', async context => {
    const server = await startServer({ context })
    const [, catalog] = PROJECT_WRITES
    assert.ok(catalog)
    const target = path.join(server.root, catalog.file)
    const aggregate = path.join(server.root, '.paraglide/messages/es.json')
    const output = path.join(server.root, catalog.output)

    await writeFile(target, catalog.update(await readFile(target, 'utf8')))
    await waitFor(() =>
      contains({ root: server.root, ...catalog, file: catalog.output })
    )
    const before = await Promise.all([stat(aggregate), stat(output)])
    // Agregados, saída e eventos repetidos não podem gerar outra rodada.
    await delay(SETTLE_MS)
    const after = await Promise.all([stat(aggregate), stat(output)])
    assert.deepEqual(
      after.map(info => info.mtimeMs),
      before.map(info => info.mtimeMs)
    )
    assert.deepEqual(server.payloads(), [])
  })

  it('regenerates the runtime when the base locale changes', async context => {
    const server = await startServer({ context })
    assert.match(await readRuntime(server.root), /baseLocale = "pt";/u)

    await writeSettings({
      root: server.root,
      baseLocale: 'en',
      locales: LOCALES
    })
    await waitFor(async () =>
      /baseLocale = "en";/u.test(await readRuntime(server.root))
    )
    assert.ok(!server.payloads().includes('error'))
    assert.notEqual(await server.status(), HTTP_ERROR)
  })

  it('blocks requests while the compiler configuration is invalid and recovers', async context => {
    const server = await startServer({ context })
    const file = path.join(server.root, 'project.inlang/paraglide.config.ts')
    const source = await readFile(file, 'utf8')
    const runtime = await readRuntime(server.root)

    await writeFile(
      file,
      source.replace("trailingSlash: 'never'", "trailingSlash: 'invalid'")
    )
    await waitFor(async () => (await server.status()) === HTTP_ERROR)
    assert.equal(await readRuntime(server.root), runtime)

    await writeFile(
      file,
      source.replace("cookieName: 'locale'", "cookieName: 'test-locale'")
    )
    await waitFor(async () =>
      /cookieName = "test-locale"/u.test(await readRuntime(server.root))
    )
    await waitFor(async () => (await server.status()) !== HTTP_ERROR)
  })

  it('blocks requests while the locale settings are invalid and recovers after the fix', async context => {
    const server = await startServer({ context })

    await writeSettings({
      root: server.root,
      baseLocale: 'pt',
      locales: [...LOCALES, 'fr']
    })
    await waitFor(async () => (await server.status()) === HTTP_ERROR)
    assert.match(await server.body(), /missing locales \[fr\]/u)

    await writeSettings({
      root: server.root,
      baseLocale: 'pt',
      locales: LOCALES
    })
    await waitFor(async () => (await server.status()) !== HTTP_ERROR)
    await waitFor(async () =>
      /locales = \/\*\* @type \{const\} \*\/ \(\["pt",\s*"en",\s*"es"\]\)/u.test(
        await readRuntime(server.root)
      )
    )
  })

  it('discovers consumers added and removed while the server runs', async context => {
    const server = await startServer({ context })
    const consumer = path.join(server.root, 'src/routes/About')
    const staging = path.join(consumer, 'staging')
    const output = path.join(server.root, 'paraglide/messages/about_title.js')
    await mkdir(staging, { recursive: true })
    for (const locale of LOCALES) {
      await writeFile(
        path.join(staging, `${locale}.json`),
        JSON.stringify({ about_title: 'About' })
      )
    }

    // Os três idiomas aparecem e somem de uma vez, como numa troca de branch.
    await rename(staging, path.join(consumer, 'i18n'))
    await waitFor(() => exists(output))
    await rename(path.join(consumer, 'i18n'), staging)
    await waitFor(async () => !(await exists(output)))
    assert.ok(!server.payloads().includes('error'))
  })

  it('keeps complete message modules when the standalone generator runs', async context => {
    const server = await startServer({ context })
    const directory = path.join(server.root, 'paraglide')
    const files = await readdir(directory, { recursive: true })
    const message = path.join(directory, 'messages/home_title.js')
    const before = await readFile(message, 'utf8')

    await generateMessages(server.root)

    assert.deepEqual(await readdir(directory, { recursive: true }), files)
    assert.equal(await readFile(message, 'utf8'), before)
    assert.match(await readRuntime(server.root), /baseLocale = "pt"/u)
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
      assert.match(await readRuntime(root), /baseLocale = "pt"/u)
    } finally {
      await server.close()
    }
  })

  for (const { file, update, output, expected } of PROJECT_WRITES) {
    it(`publishes only the completed ${file} when it is written in parts`, async context => {
      const server = await startServer({ context })
      const target = path.join(server.root, file)

      await writeInParts({
        file: target,
        content: update(await readFile(target, 'utf8'))
      })
      await waitFor(() =>
        contains({ root: server.root, file: output, expected })
      )
      assert.ok(!server.payloads().includes('error'))
      assert.notEqual(await server.status(), HTTP_ERROR)
    })
  }
})
