import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'

import * as v from 'valibot'

import { readCatalogs } from '../readCatalogs/index.ts'

type GenerationResult = { changed: boolean }
type RootState = { fingerprint: string; outputs: Map<string, string> }
type GenerationState = {
  queue: Promise<unknown>
  roots: Map<string, RootState>
}
type WriteOptions = { file: string; content: string | Uint8Array }

const SETTINGS_FILE = 'project.inlang/settings.json'
const COMPILER_CONFIG = 'project.inlang/paraglide.config.ts'
const AGGREGATE_DIRECTORY = '.paraglide/messages'
const OUTPUT_DIRECTORY = 'paraglide'
const JSON_INDENT = 2
const GENERATED_SOURCE = /\.(?:js|d\.ts)$/u
const resolvePackage = createRequire(import.meta.url)
const COMPILER_CLI = path.resolve(
  path.dirname(resolvePackage.resolve('@inlang/paraglide-js')),
  '../bin/run.js'
)
const execute = promisify(execFile)
// Cargas repetidas da config compartilham a fila e o cache no processo.
const STATE_KEY = Symbol.for('boilerplate.i18n.generation')
const LocalesSchema = v.pipe(v.array(v.string()), v.minLength(1))
const SettingsSchema = v.object({
  baseLocale: v.string(),
  locales: LocalesSchema
})

let temporaryCount = 0

function isGenerationState(value: unknown): value is GenerationState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'roots' in value &&
    value.roots instanceof Map
  )
}

function generationState(): GenerationState {
  const current: unknown = Reflect.get(globalThis, STATE_KEY)
  if (isGenerationState(current)) return current
  const created: GenerationState = {
    queue: Promise.resolve(),
    roots: new Map()
  }
  Reflect.set(globalThis, STATE_KEY, created)
  return created
}

async function serialized<T>(task: () => Promise<T>): Promise<T> {
  const state = generationState()
  const previous = state.queue
  const { promise, resolve } = Promise.withResolvers<true>()
  state.queue = promise
  try {
    await previous
    return await task()
  } finally {
    resolve(true)
  }
}

function digest(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function readExisting(file: string): Promise<Uint8Array | undefined> {
  try {
    return await readFile(file)
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

// Os agregados entram por rename para o compilador não ler JSON pela metade.
async function writeIfChanged({
  file,
  content
}: WriteOptions): Promise<boolean> {
  const next = typeof content === 'string' ? Buffer.from(content) : content
  const current = await readExisting(file)
  if (current && Buffer.compare(current, next) === 0) return false
  temporaryCount += 1
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${temporaryCount}.tmp`
  )
  await writeFile(temporary, next)
  try {
    await rename(temporary, file)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
  return true
}

async function isIntact(outputs: Map<string, string>): Promise<boolean> {
  for (const [file, hash] of outputs) {
    const content = await readExisting(file)
    if (!content || digest(content) !== hash) return false
  }
  return true
}

async function readOutputs(outdir: string): Promise<Map<string, string>> {
  const outputs = new Map<string, string>()
  try {
    for (const relative of await readdir(outdir, { recursive: true })) {
      if (!GENERATED_SOURCE.test(relative)) continue
      const file = path.join(outdir, relative)
      outputs.set(file, digest(await readFile(file)))
    }
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  return outputs
}

async function generate(root: string): Promise<GenerationResult> {
  const [settingsSource, compilerConfig] = await Promise.all([
    readFile(path.join(root, SETTINGS_FILE), 'utf8'),
    readFile(path.join(root, COMPILER_CONFIG), 'utf8')
  ])
  const settings = v.parse(SettingsSchema, JSON.parse(settingsSource))
  const catalogs = await readCatalogs({ root, ...settings })
  const aggregates = settings.locales.map(locale => ({
    file: path.join(root, AGGREGATE_DIRECTORY, `${locale}.json`),
    content: `${JSON.stringify(catalogs[locale] ?? {}, null, JSON_INDENT)}\n`
  }))
  const fingerprint = digest(
    JSON.stringify({ settingsSource, aggregates, compilerConfig })
  )
  const { roots } = generationState()
  const previous = roots.get(root)
  // Mesmos catálogos e a saída anterior intacta: nada a compilar.
  if (
    previous?.fingerprint === fingerprint &&
    (await isIntact(previous.outputs))
  ) {
    return { changed: false }
  }
  roots.delete(root)
  await mkdir(path.join(root, AGGREGATE_DIRECTORY), { recursive: true })
  for (const aggregate of aggregates) await writeIfChanged(aggregate)
  const outdir = path.join(root, OUTPUT_DIRECTORY)
  const before = await readOutputs(outdir)
  // O CLI oficial reaproveita os hashes em disco, escreve apenas mudanças e
  // remove módulos obsoletos. Node também mantém o compilador fora do Bun do Vite.
  await execute(
    'node',
    [
      COMPILER_CLI,
      'compile',
      '--project',
      path.join(root, 'project.inlang'),
      '--outdir',
      outdir,
      '--silent'
    ],
    { cwd: root }
  )
  const outputs = await readOutputs(outdir)
  roots.set(root, { fingerprint, outputs })
  return {
    changed:
      before.size !== outputs.size ||
      [...outputs].some(([file, hash]) => before.get(file) !== hash)
  }
}

// Valida os catálogos e atualiza paraglide. `changed` indica se algum
// arquivo da saída mudou. Arquivos gerados ficam sob a gestão do Paraglide.
export function generateMessages(
  root = process.cwd()
): Promise<GenerationResult> {
  const resolved = path.resolve(root)
  return serialized(() => generate(resolved))
}
