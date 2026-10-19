/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
/* oxlint-disable vitest/prefer-each -- O runner nativo do Node.js não tem a API it.each. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import { createServer } from 'vite-plus'

import { generateMessages } from '../../generateMessages/index.ts'
import {
  LOCALES,
  writeMessages,
  writeProject,
  writeSettings
} from '../../testProject/index.ts'
import { i18nPlugin } from '../index.ts'
import {
  contains,
  MESSAGES,
  POLL_MS,
  PROJECT_WRITES,
  readRuntime,
  startServer,
  waitFor
} from '../testDevServer/index.ts'

type PartsOptions = { file: string; content: string }

const SETTLE_MS = 1500
const HTTP_ERROR = 500
// Mantém as duas partes dentro da janela de agrupamento dos catálogos.
const WRITE_PAUSE_MS = 20

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
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

  it('compiles the complete compiler configuration without transient errors after a save in multiple writes', async context => {
    const server = await startServer({ context })
    const file = path.join(server.root, 'project.inlang/paraglide.config.ts')
    const source = await readFile(file, 'utf8')
    const statuses: number[] = []
    const requestController = new AbortController()
    const requestWhileSaving = async () => {
      while (!requestController.signal.aborted) {
        statuses.push(await server.status())
        await delay(POLL_MS)
      }
    }
    const pendingRequests = requestWhileSaving()

    try {
      await writeInParts({
        file,
        content: source.replace(
          "cookieName: 'locale'",
          "cookieName: 'test-locale'"
        )
      })
      await waitFor(async () =>
        /cookieName = "test-locale"/u.test(await readRuntime(server.root))
      )
      await waitFor(async () => (await server.status()) !== HTTP_ERROR)
    } finally {
      requestController.abort()
      await pendingRequests
    }
    assert.ok(!statuses.includes(HTTP_ERROR))
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

describe('i18n dev directory discovery', () => {
  it('discovers catalogs renamed into a new consumer before it is watched', async context => {
    const server = await startServer({ context })
    const outside = await mkdtemp(path.join(tmpdir(), 'i18n-consumer-'))
    context.after(() => rm(outside, { recursive: true, force: true }))
    const tree = path.join(outside, 'About')
    const consumer = path.join(server.root, 'src/routes/About')
    const output = path.join(server.root, 'paraglide/messages/about_title.js')
    await mkdir(path.join(tree, 'staging'), { recursive: true })
    for (const locale of LOCALES) {
      await writeFile(
        path.join(tree, 'staging', `${locale}.json`),
        JSON.stringify({ about_title: 'About' })
      )
    }
    const watch = fs.watch.bind(fs)
    let renames = 0
    // O chokidar lê o diretório novo e só depois o observa; a troca de nome
    // entre os dois passos não gera evento de arquivo.
    context.mock.method(fs, 'watch', (...args: Parameters<typeof fs.watch>) => {
      const [target] = args
      if (
        renames === 0 &&
        String(target).endsWith(path.join('src', 'routes', 'About'))
      ) {
        // oxlint-disable-next-line node/no-sync -- A troca precisa ocorrer antes de o watch existir.
        fs.renameSync(
          path.join(consumer, 'staging'),
          path.join(consumer, 'i18n')
        )
        renames += 1
      }
      return watch(...args)
    })

    await rename(tree, consumer)
    await waitFor(() => Promise.resolve(renames === 1))
    assert.equal(renames, 1)
    await waitFor(() => exists(output))
    await rename(path.join(consumer, 'i18n'), path.join(consumer, 'staging'))
    await waitFor(async () => !(await exists(output)))
    assert.ok(!server.payloads().includes('error'))
  })
})
