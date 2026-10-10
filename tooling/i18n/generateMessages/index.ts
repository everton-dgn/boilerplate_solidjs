import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  writeFile
} from 'node:fs/promises'
import path from 'node:path'

import { compile } from '@inlang/paraglide-js'
import * as v from 'valibot'

import { moveToTrash } from '../moveToTrash/index.ts'
import { readCatalogs } from '../readCatalogs/index.ts'

type CompileOptions = Parameters<typeof compile>[0]
type ProjectOptions = Omit<CompileOptions, 'project' | 'outdir' | 'fs'>
type GenerationResult = { changed: boolean }
type RootState = { fingerprint: string; outputs: Map<string, string> }
type GenerationState = {
  queue: Promise<unknown>
  roots: Map<string, RootState>
}
type WriteOptions = { file: string; content: string | Uint8Array }
type CompileFsOptions = { written: Set<string> }
type ObsoleteOptions = {
  outdir: string
  outputs: Map<string, string>
  startedAt: number
}
type ObsoleteFileOptions = { file: string; startedAt: number }

const SETTINGS_FILE = 'project.inlang/settings.json'
const AGGREGATE_DIRECTORY = '.paraglide/messages'
const OUTPUT_DIRECTORY = 'src/paraglide'
const JSON_INDENT = 2
const GENERATED_SOURCE = /\.(?:js|d\.ts)$/u
// Cada carga da config pode instanciar este módulo de novo, e a trava interna
// do compile() só serializa duas chamadas: com três ou mais, duas compilam ao
// mesmo tempo e podem trocar os resultados. A fila fica no processo.
const STATE_KEY = Symbol.for('boilerplate.i18n.generation')
const LocalesSchema = v.pipe(v.array(v.string()), v.minLength(1))
const SettingsSchema = v.object({
  baseLocale: v.string(),
  locales: LocalesSchema
})

let temporaryCount = 0

function compileOptions(locales: readonly string[]): ProjectOptions {
  return {
    emitTsDeclarations: true,
    outputStructure: 'message-modules',
    strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
    cookieName: 'locale',
    trailingSlash: 'never',
    urlPatterns: [
      {
        pattern: '/',
        localized: locales.map(locale => [locale, `/${locale}`])
      },
      {
        pattern: '/:path(.*)?',
        localized: locales.map(locale => [locale, `/${locale}/:path(.*)?`])
      }
    ],
    // cleanOutdir apagaria a saída inteira; obsoletos vão para a lixeira.
    cleanOutdir: false,
    emitReadme: false,
    emitPrettierIgnore: false
  }
}

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

async function discardTemporary(file: string): Promise<void> {
  try {
    await moveToTrash([file])
  } catch {
    // O temporário fica ao lado do destino; a falha original é a relevante.
  }
}

// Conteúdo igual não é regravado, para não disparar o watcher nem o HMR. O
// novo conteúdo entra por rename: outro processo ou o Vite nunca leem um
// arquivo pela metade.
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
    await discardTemporary(temporary)
    throw error
  }
  return true
}

function refuseDeletion(): never {
  throw new Error('[i18n] Generation never deletes files permanently')
}

function rejectDeletion(): Promise<never> {
  return Promise.reject(
    new Error('[i18n] Generation never deletes files permanently')
  )
}

// O compile() usa este fs para ler o projeto e escrever a saída. Exclusões
// falham em vez de apagar arquivos de forma permanente.
function compileFs({ written }: CompileFsOptions) {
  return {
    ...fs,
    rm: refuseDeletion,
    rmdir: refuseDeletion,
    unlink: refuseDeletion,
    rmSync: refuseDeletion,
    rmdirSync: refuseDeletion,
    unlinkSync: refuseDeletion,
    promises: {
      ...fs.promises,
      rm: rejectDeletion,
      rmdir: rejectDeletion,
      unlink: rejectDeletion,
      async writeFile(file: string, content: string | Uint8Array) {
        if (await writeIfChanged({ file, content })) {
          written.add(path.resolve(file))
        }
      }
    }
  }
}

async function isIntact(outputs: Map<string, string>): Promise<boolean> {
  for (const [file, hash] of outputs) {
    const content = await readExisting(file)
    if (!content || digest(content) !== hash) return false
  }
  return true
}

async function isObsolete({
  file,
  startedAt
}: ObsoleteFileOptions): Promise<boolean> {
  try {
    const info = await stat(file)
    // Um arquivo mais novo que esta geração pode ser de outro processo.
    return info.isFile() && info.mtimeMs < startedAt
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

async function trashObsolete({
  outdir,
  outputs,
  startedAt
}: ObsoleteOptions): Promise<boolean> {
  const obsolete: string[] = []
  for (const relative of await readdir(outdir, { recursive: true })) {
    const file = path.join(outdir, relative)
    if (!GENERATED_SOURCE.test(relative) || outputs.has(file)) continue
    if (await isObsolete({ file, startedAt })) obsolete.push(file)
  }
  if (obsolete.length === 0) return false
  try {
    if (await moveToTrash(obsolete)) return true
    console.warn(
      `[i18n] ${obsolete.length} obsolete generated files kept: no trash command available`
    )
  } catch (error) {
    console.warn(
      `[i18n] ${obsolete.length} obsolete generated files kept: ${String(error)}`
    )
  }
  return false
}

async function generate(root: string): Promise<GenerationResult> {
  const settingsSource = await readFile(path.join(root, SETTINGS_FILE), 'utf8')
  const settings = v.parse(SettingsSchema, JSON.parse(settingsSource))
  const catalogs = await readCatalogs({ root, ...settings })
  const aggregates = settings.locales.map(locale => ({
    file: path.join(root, AGGREGATE_DIRECTORY, `${locale}.json`),
    content: `${JSON.stringify(catalogs[locale] ?? {}, null, JSON_INDENT)}\n`
  }))
  const options = compileOptions(settings.locales)
  const fingerprint = digest(
    JSON.stringify({ settingsSource, aggregates, options })
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
  const written = new Set<string>()
  const startedAt = Date.now()
  // Sem previousCompilation o compile() não remove arquivos; o fs acima pula
  // o que não mudou.
  const { outputHashes } = await compile({
    project: path.join(root, 'project.inlang'),
    outdir,
    fs: compileFs({ written }),
    ...options
  })
  // Sem a lista da saída, todo arquivo gerado pareceria obsoleto.
  if (!outputHashes) {
    throw new Error('[i18n] Paraglide did not report the generated files')
  }
  const outputs = new Map<string, string>()
  for (const relative of Object.keys(outputHashes)) {
    const file = path.join(outdir, relative)
    outputs.set(file, digest(await readFile(file)))
  }
  const trashed = await trashObsolete({ outdir, outputs, startedAt })
  roots.set(root, { fingerprint, outputs })
  const prefix = `${outdir}${path.sep}`
  return {
    changed: trashed || [...written].some(file => file.startsWith(prefix))
  }
}

// Valida os catálogos e atualiza src/paraglide. `changed` indica se algum
// arquivo da saída foi escrito ou enviado à lixeira.
export function generateMessages(
  root = process.cwd()
): Promise<GenerationResult> {
  const resolved = path.resolve(root)
  return serialized(() => generate(resolved))
}
