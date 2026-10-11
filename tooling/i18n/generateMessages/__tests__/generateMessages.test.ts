/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'
import { promisify } from 'node:util'

import { generateMessages } from '../index.ts'

type Messages = Record<string, string>
type ProjectOptions = { parent: string; messages: Messages }
type MessagesOptions = { root: string; messages: Messages }

const execute = promisify(execFile)
const LOCALES = ['pt', 'en', 'es']
const PLUGIN = path.resolve(
  import.meta.dirname,
  '../../../../node_modules/@inlang/plugin-message-format/dist/index.js'
)
const GENERATE = path.resolve(import.meta.dirname, '../../generate.ts')
const COMPILER_CONFIG = path.resolve(
  import.meta.dirname,
  '../../../../project.inlang/paraglide.config.ts'
)
const NODE_MODULES = path.resolve(
  import.meta.dirname,
  '../../../../node_modules'
)
const MESSAGES = { home_title: 'Title {name}', home_body: 'Body' }

async function sandbox(context: TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'i18n-generate-'))
  context.after(async () => {
    await rm(directory, { recursive: true, force: true })
  })
  return directory
}

async function writeMessages({ root, messages }: MessagesOptions) {
  const directory = path.join(root, 'src/routes/Home/i18n')
  await mkdir(directory, { recursive: true })
  for (const locale of LOCALES) {
    await writeFile(
      path.join(directory, `${locale}.json`),
      JSON.stringify(messages)
    )
  }
}

async function project({ parent, messages }: ProjectOptions): Promise<string> {
  const root = await mkdtemp(path.join(parent, 'project-'))
  await mkdir(path.join(root, 'project.inlang'))
  await copyFile(
    COMPILER_CONFIG,
    path.join(root, 'project.inlang/paraglide.config.ts')
  )
  await symlink(NODE_MODULES, path.join(root, 'node_modules'))
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
  await writeMessages({ root, messages })
  return root
}

// Conteúdo de paraglide por caminho relativo.
async function output(root: string): Promise<Map<string, string>> {
  const directory = path.join(root, 'paraglide')
  const files = new Map<string, string>()
  const entries = await readdir(directory, { recursive: true })
  for (const relative of entries.toSorted()) {
    const file = path.join(directory, relative)
    const info = await stat(file)
    if (info.isFile()) files.set(relative, await readFile(file, 'utf8'))
  }
  return files
}

async function modifiedTimes(root: string): Promise<number[]> {
  const directory = path.join(root, 'paraglide')
  const files = await output(root)
  const times: number[] = []
  for (const relative of files.keys()) {
    const info = await stat(path.join(directory, relative))
    times.push(info.mtimeMs)
  }
  return times
}

async function temporaryFiles(root: string): Promise<string[]> {
  const files = await Promise.all(
    ['.paraglide', 'paraglide'].map(directory =>
      readdir(path.join(root, directory), { recursive: true })
    )
  )
  return files.flat().filter(file => file.endsWith('.tmp'))
}

describe('generated messages', () => {
  it('skips unchanged generations and repairs modified outputs', async context => {
    const root = await project({
      parent: await sandbox(context),
      messages: MESSAGES
    })
    assert.deepEqual(await generateMessages(root), { changed: true })
    const reference = await output(root)
    const times = await modifiedTimes(root)
    assert.ok(reference.has('messages/home_title.js'))

    assert.deepEqual(await generateMessages(root), { changed: false })
    assert.deepEqual(await modifiedTimes(root), times)

    await execute(process.execPath, [GENERATE], { cwd: root })
    assert.deepEqual(await modifiedTimes(root), times)

    await writeFile(path.join(root, 'paraglide/runtime.js'), 'broken')
    assert.deepEqual(await generateMessages(root), { changed: true })
    assert.deepEqual(await output(root), reference)
  })

  it('rejects an invalid catalog without touching the previous output', async context => {
    const root = await project({
      parent: await sandbox(context),
      messages: MESSAGES
    })
    await generateMessages(root)
    const reference = await output(root)
    const catalog = path.join(root, 'src/routes/Home/i18n/es.json')
    await writeFile(catalog, JSON.stringify({ home_title: 'Title {name}' }))
    await assert.rejects(
      generateMessages(root),
      /es\.json: missing-translation.*home_body/u
    )
    assert.deepEqual(await output(root), reference)

    await writeFile(catalog, JSON.stringify(MESSAGES))
    assert.deepEqual(await generateMessages(root), { changed: false })
  })

  it('keeps complete outputs under concurrent generations', async context => {
    const parent = await sandbox(context)
    const reference = await project({ parent, messages: MESSAGES })
    await generateMessages(reference)
    const expected = await output(reference)

    const inProcess = await project({ parent, messages: MESSAGES })
    await Promise.all([
      generateMessages(inProcess),
      generateMessages(inProcess),
      generateMessages(inProcess)
    ])
    assert.deepEqual(await output(inProcess), expected)

    const processes = await project({ parent, messages: MESSAGES })
    await Promise.all(
      [0, 1].map(() =>
        execute(process.execPath, [GENERATE], { cwd: processes })
      )
    )
    assert.deepEqual(await output(processes), expected)
    assert.deepEqual(await temporaryFiles(inProcess), [])
    assert.deepEqual(await temporaryFiles(processes), [])
  })

  it('lets Paraglide remove obsolete modules, including in a new process', async context => {
    const parent = await sandbox(context)
    const root = await project({ parent, messages: MESSAGES })
    await generateMessages(root)
    const obsolete = path.join(root, 'paraglide/messages/home_body.js')
    await stat(obsolete)

    await writeMessages({ root, messages: { home_title: 'Title {name}' } })
    await execute(process.execPath, [GENERATE], { cwd: root })
    const files = await output(root)
    assert.ok(files.has('messages/home_title.js'))

    await assert.rejects(stat(obsolete), { code: 'ENOENT' })
  })
})
