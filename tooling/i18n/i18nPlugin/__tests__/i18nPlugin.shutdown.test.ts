/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
/* oxlint-disable vitest/prefer-each -- O runner nativo do Node.js não tem a API it.each. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import {
  contains,
  MESSAGES,
  PROJECT_WRITES,
  startServer,
  waitFor
} from '../testDevServer/index.ts'

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

async function temporaryFiles(root: string): Promise<string[]> {
  const files = await readdir(path.join(root, '.paraglide'), {
    recursive: true
  })
  return files.filter(file => file.endsWith('.tmp'))
}

describe('i18n dev shutdown', () => {
  for (const restart of ['same process', 'new process']) {
    it(`recovers an overlapping write after shutdown in the ${restart}`, async context => {
      const closing = Promise.withResolvers<null>()
      const server = await startServer({
        context,
        onClosing: () => closing.resolve(null),
        // O teste entrega o evento do primeiro agregado e retém o do segundo,
        // que o watcher só reportaria depois do fechamento. Nenhum outro evento
        // das entradas do compilador pode iniciar a compilação retida.
        shouldIgnoreCompilerInputs: true
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
        await waitFor(() =>
          contains({ root: server.root, file: aggregate, expected: /Primero/u })
        )
        server.change(aggregate)
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
