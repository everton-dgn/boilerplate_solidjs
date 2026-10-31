import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'
import * as v from 'valibot'

type ScanOptions = { directory: string; extension: string; pattern: RegExp }

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const STATIC_OUTPUT = path.join(ROOT, '.vercel/output/static')
const FUNCTIONS_OUTPUT = path.join(ROOT, '.vercel/output/functions')
const VITE_METADATA = path.join(ROOT, 'dist/.vite')
const METADATA_FILES = ['manifest.json', 'solid-server-functions.json']
const SERVER_BUILD_ID =
  /configureServerFunctionsServer\(\{[^}]*?\bendpoint:[^}]*?\bbuildId:\s*[`'"](?<id>[0-9a-f]+)[`'"]/gu
const CLIENT_BUILD_ID =
  /X-Server-Function-Build[`'"]\]\s*=\s*[`'"](?<id>[0-9a-f]+)[`'"]/gu

const persistedSchema = v.object({
  buildId: v.pipe(v.string(), v.nonEmpty())
})

async function scanBuildIds({
  directory,
  extension,
  pattern
}: ScanOptions): Promise<string[]> {
  const files = await readdir(directory, { recursive: true })
  const ids = await Promise.all(
    files
      .filter(file => file.endsWith(extension))
      .map(async file => {
        const source = await readFile(path.join(directory, file), 'utf8')
        return [...source.matchAll(pattern)].flatMap(match =>
          match.groups?.id ? [match.groups.id] : []
        )
      })
  )
  return ids.flat()
}

test.use({ javaScriptEnabled: false })

// O preview recusa caminhos com segmento iniciado por ponto, mas o CDN da
// Vercel serve o que estiver no estático; só o artefato prova a ausência.
test('keeps the Vite metadata out of the published static output', async () => {
  const published = await readdir(STATIC_OUTPUT, { recursive: true })
  expect(
    published.filter(file => file.split(path.sep).includes('.vite'))
  ).toEqual([])
  expect(await readdir(VITE_METADATA)).toEqual(
    expect.arrayContaining(METADATA_FILES)
  )
})

test('uses the same build id in the client, the server and the manifest', async () => {
  const persisted = await readFile(
    path.join(VITE_METADATA, 'solid-server-functions.json'),
    'utf8'
  )
  const { buildId } = v.parse(persistedSchema, JSON.parse(persisted))
  const serverIds = await scanBuildIds({
    directory: FUNCTIONS_OUTPUT,
    extension: '.mjs',
    pattern: SERVER_BUILD_ID
  })
  const clientIds = await scanBuildIds({
    directory: STATIC_OUTPUT,
    extension: '.js',
    pattern: CLIENT_BUILD_ID
  })

  expect(serverIds.length).toBeGreaterThan(0)
  expect(clientIds.length).toBeGreaterThan(0)
  expect(new Set([...serverIds, ...clientIds])).toEqual(new Set([buildId]))
})
