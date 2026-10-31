import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it, type TestContext } from 'node:test'

import { moveViteMetadata } from '../index.ts'

type SetupOptions = {
  context: TestContext
  isDev?: boolean
  isPublicRoot?: boolean
}
type Setup = {
  root: string
  publicDir: string
  target: string
  compiled: () => Promise<void>
}
type WriteOptions = { file: string; content: string }

const MANIFEST = '{"src/main.tsx":{"file":"assets/main.js"}}'
const SERVER_FUNCTIONS = '{"buildId":"abc","modules":[],"functions":[]}'
const METADATA_FILES = ['manifest.json', 'solid-server-functions.json']

async function writeText({ file, content }: WriteOptions): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
}

async function setup({
  context,
  isDev = false,
  isPublicRoot = false
}: SetupOptions): Promise<Setup> {
  const root = await mkdtemp(path.join(tmpdir(), 'vite-metadata-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const publicDir = isPublicRoot ? root : path.join(root, 'public')
  let compiled: (() => Promise<void>) | undefined
  moveViteMetadata({
    options: { dev: isDev, rootDir: root, output: { publicDir } },
    hooks: {
      hook(_name, handler) {
        compiled = handler
      }
    }
  })
  assert.ok(compiled)
  return {
    root,
    publicDir,
    target: path.join(root, 'dist/.vite'),
    compiled
  }
}

async function listSorted(directory: string): Promise<string[]> {
  const files = await readdir(directory)
  return files.toSorted()
}

async function writeMetadata(publicDir: string): Promise<void> {
  await writeText({
    file: path.join(publicDir, '.vite/manifest.json'),
    content: MANIFEST
  })
  await writeText({
    file: path.join(publicDir, '.vite/solid-server-functions.json'),
    content: SERVER_FUNCTIONS
  })
}

it('move os metadados do Vite para fora do diretório público', async context => {
  const { publicDir, target, compiled } = await setup({ context })
  await writeMetadata(publicDir)
  await writeText({
    file: path.join(publicDir, 'assets/main.js'),
    content: 'main'
  })

  await compiled()

  assert.deepEqual(await listSorted(target), METADATA_FILES)
  assert.equal(
    await readFile(path.join(target, 'manifest.json'), 'utf8'),
    MANIFEST
  )
  assert.equal(
    await readFile(path.join(target, 'solid-server-functions.json'), 'utf8'),
    SERVER_FUNCTIONS
  )
  assert.deepEqual(await readdir(publicDir), ['assets'])
  assert.equal(
    await readFile(path.join(publicDir, 'assets/main.js'), 'utf8'),
    'main'
  )
})

it('substitui os metadados de um build anterior', async context => {
  const { publicDir, target, compiled } = await setup({ context })
  await writeMetadata(publicDir)
  await writeText({ file: path.join(target, 'stale.json'), content: '{}' })

  await compiled()

  assert.deepEqual(await listSorted(target), METADATA_FILES)
})

it('mantém o destino quando o build não gerou metadados', async context => {
  const { target, compiled } = await setup({ context })
  await writeText({ file: path.join(target, 'manifest.json'), content: '{}' })

  await compiled()

  assert.deepEqual(await readdir(target), ['manifest.json'])
})

it('não move nada em desenvolvimento', async context => {
  const { publicDir, target, compiled } = await setup({ context, isDev: true })
  await writeMetadata(publicDir)

  await compiled()

  assert.deepEqual(
    await listSorted(path.join(publicDir, '.vite')),
    METADATA_FILES
  )
  await assert.rejects(readdir(target), { code: 'ENOENT' })
})

it('recusa um destino dentro do diretório público', async context => {
  const { publicDir, compiled } = await setup({ context, isPublicRoot: true })
  await writeMetadata(publicDir)

  await assert.rejects(compiled(), /Vite metadata target is public/u)
  assert.deepEqual(
    await listSorted(path.join(publicDir, '.vite')),
    METADATA_FILES
  )
})
