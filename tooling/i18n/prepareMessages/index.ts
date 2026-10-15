import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import * as v from 'valibot'

import { readCatalogs } from '../readCatalogs/index.ts'

type WriteOptions = { root: string; file: string; content: string }

const SETTINGS_FILE = 'project.inlang/settings.json'
const TEMPORARY_DIRECTORY = '.paraglide'
const AGGREGATE_DIRECTORY = '.paraglide/messages'
const JSON_INDENT = 2
const LocalesSchema = v.pipe(v.array(v.string()), v.minLength(1))
const SettingsSchema = v.object({
  baseLocale: v.string(),
  locales: LocalesSchema
})

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function readExisting(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

// Os agregados entram por rename para o compilador não ler JSON pela metade.
// O temporário fica fora da pasta lida pelo compilador, que recompila a cada
// arquivo criado nela.
async function writeIfChanged({
  root,
  file,
  content
}: WriteOptions): Promise<void> {
  if ((await readExisting(file)) === content) return
  const temporary = path.join(
    root,
    TEMPORARY_DIRECTORY,
    `.${path.basename(file)}.${randomUUID()}.tmp`
  )
  await writeFile(temporary, content)
  try {
    await rename(temporary, file)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export async function prepareMessages(root = process.cwd()): Promise<void> {
  const resolved = path.resolve(root)
  const source = await readFile(path.join(resolved, SETTINGS_FILE), 'utf8')
  const settings = v.parse(SettingsSchema, JSON.parse(source))
  const catalogs = await readCatalogs({ root: resolved, ...settings })
  await mkdir(path.join(resolved, AGGREGATE_DIRECTORY), { recursive: true })
  for (const locale of settings.locales) {
    await writeIfChanged({
      root: resolved,
      file: path.join(resolved, AGGREGATE_DIRECTORY, `${locale}.json`),
      content: `${JSON.stringify(catalogs[locale] ?? {}, null, JSON_INDENT)}\n`
    })
  }
}
