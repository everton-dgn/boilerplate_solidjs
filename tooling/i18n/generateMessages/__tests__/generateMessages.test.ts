/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'
import { promisify } from 'node:util'

import { writeMessages, writeProject } from '../../testProject/index.ts'
import { generateMessages } from '../index.ts'

type Messages = Record<string, string>
type ProjectOptions = { parent: string; messages: Messages }

const execute = promisify(execFile)
const GENERATE = path.resolve(import.meta.dirname, '../../generate.ts')
const MESSAGES = { home_title: 'Title {name}', home_body: 'Body' }

async function sandbox(context: TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'i18n-generate-'))
  context.after(async () => {
    await rm(directory, { recursive: true, force: true })
  })
  return directory
}

async function project({ parent, messages }: ProjectOptions): Promise<string> {
  const root = await mkdtemp(path.join(parent, 'project-'))
  await writeProject({ root, messages })
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
    await generateMessages(root)
    const reference = await output(root)
    const times = await modifiedTimes(root)
    assert.ok(reference.has('messages/home_title.js'))
    assert.ok(reference.has('messages/home_title.d.ts'))

    await generateMessages(root)
    assert.deepEqual(await modifiedTimes(root), times)

    await execute('bun', [GENERATE], { cwd: root })
    assert.deepEqual(await modifiedTimes(root), times)

    await writeFile(path.join(root, 'paraglide/runtime.js'), 'broken')
    await generateMessages(root)
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
    await generateMessages(root)
    assert.deepEqual(await output(root), reference)
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
      [0, 1].map(() => execute('bun', [GENERATE], { cwd: processes }))
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
    await execute('bun', [GENERATE], { cwd: root })
    const files = await output(root)
    assert.ok(files.has('messages/home_title.js'))

    await assert.rejects(stat(obsolete), { code: 'ENOENT' })
  })
})
