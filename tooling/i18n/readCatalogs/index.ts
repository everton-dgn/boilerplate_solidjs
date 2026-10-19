import { glob, readFile } from 'node:fs/promises'
import path from 'node:path'

import messageFormat from '@inlang/plugin-message-format'
import { checkBundle } from '@inlang/sdk'
import * as v from 'valibot'

type CatalogOptions = {
  root: string
  locales: readonly string[]
  baseLocale: string
}

type ParseOptions = { file: string; source: string }
type ValidationOptions = {
  directory: string
  catalogs: Record<string, Catalog>
  baseLocale: string
}
type ImportResult = Awaited<
  ReturnType<NonNullable<typeof messageFormat.importFiles>>
>
type Catalog = Record<string, v.InferOutput<typeof MessageSchema>>
type ClaimOptions = {
  keys: Iterable<string>
  directory: string
  owners: Map<string, string>
}
type CatalogFileOptions = { root: string; file: string }

// O glob da leitura e o filtro do watcher descrevem o mesmo conjunto: os
// agregados em .paraglide/ e a saída em paraglide/ nunca são catálogos.
const CATALOG_GLOB = 'src/**/i18n/*.json'
const CATALOG_EXCLUDES = ['src/tests/**', 'src/**/__tests__/**']
const CATALOG_PATH = /^src\/(?:[^/]+\/)*i18n\/[^/]+\.json$/u
const EXCLUDED_PATH = /^src\/tests\/|\/__tests__\//u

function claimMessages({ keys, directory, owners }: ClaimOptions): void {
  for (const key of keys) {
    const owner = owners.get(key)
    if (owner) {
      throw new Error(
        `[i18n] Duplicate message "${key}" in ${directory} and ${owner}`
      )
    }
    owners.set(key, directory)
  }
}

const TextSchema = v.string()
const LAST_ITEM = -1
const StringsSchema = v.array(v.string())
const VariantsSchema = v.pipe(v.record(v.string(), TextSchema), v.minEntries(1))
const ComplexSchema = v.strictObject({
  declarations: v.optional(StringsSchema),
  selectors: v.optional(StringsSchema),
  match: VariantsSchema
})
const MessageSchema = v.union([
  TextSchema,
  v.pipe(v.array(ComplexSchema), v.length(1))
])
const CatalogSchema = v.record(
  v.pipe(v.string(), v.regex(/^[a-z][a-zA-Z0-9]*_[a-zA-Z0-9_]+$/u)),
  MessageSchema
)

// JSON.parse aceita silenciosamente propriedades repetidas. Os tokens de
// string são consumidos inteiros, inclusive escapes, antes de procurar ':'.
function assertUniqueProperties({ file, source }: ParseOptions): void {
  const scopes: Set<string>[] = []
  const tokens = source.match(/"(?:\\.|[^"\\])*"|[{}:[\],]/gu) ?? []
  for (const [index, token] of tokens.entries()) {
    if (token === '{') scopes.push(new Set())
    else if (token === '}') scopes.pop()
    else if (token.startsWith('"') && tokens[index + 1] === ':') {
      const key = v.parse(v.string(), JSON.parse(token))
      const scope = scopes.at(LAST_ITEM)
      if (scope?.has(key)) {
        throw new Error(`[i18n] ${file}: duplicate key "${key}"`)
      }
      scope?.add(key)
    }
  }
}

function parseCatalog({ file, source }: ParseOptions): Catalog {
  try {
    const json: unknown = JSON.parse(source)
    assertUniqueProperties({ file, source })
    const catalog = v.parse(CatalogSchema, json)
    if (Object.keys(catalog).length === 0) throw new Error('Empty catalog')
    return catalog
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`[i18n] Invalid catalog ${file}: ${detail}`, {
      cause: error
    })
  }
}

async function validateMessages({
  directory,
  catalogs,
  baseLocale
}: ValidationOptions): Promise<void> {
  if (!messageFormat.importFiles) {
    throw new Error('Message format parser unavailable')
  }
  let parsed: ImportResult
  try {
    parsed = await messageFormat.importFiles({
      files: Object.entries(catalogs).map(([locale, catalog]) => ({
        locale,
        content: new TextEncoder().encode(JSON.stringify(catalog))
      })),
      settings: { baseLocale, locales: Object.keys(catalogs), modules: [] }
    })
  } catch (error) {
    throw new Error(`[i18n] Invalid message syntax in ${directory}`, {
      cause: error
    })
  }
  const messagesByBundle = Map.groupBy(
    parsed.messages,
    message => message.bundleId
  )
  const variantsByBundle = Map.groupBy(
    parsed.variants,
    variant => variant.messageBundleId
  )
  const locales = Object.keys(catalogs)
  for (const bundle of parsed.bundles) {
    if (!bundle.id) throw new Error(`[i18n] Message without ID in ${directory}`)
    // O parser retorna tabelas separadas; o SDK recebe cada mensagem com suas variantes.
    const messages = (messagesByBundle.get(bundle.id) ?? []).map(message => ({
      locale: message.locale,
      id: message.locale,
      selectors: message.selectors ?? [],
      variants: (variantsByBundle.get(bundle.id) ?? [])
        .filter(variant => variant.messageLocale === message.locale)
        .map((variant, index) => ({
          id: String(index),
          matches: variant.matches ?? [],
          pattern: variant.pattern ?? []
        }))
    }))
    const diagnostics = checkBundle({
      bundle: {
        id: bundle.id,
        declarations: bundle.declarations ?? [],
        messages
      },
      locales,
      referenceLocale: baseLocale
    })
    if (diagnostics.length > 0) {
      throw new Error(
        diagnostics
          .map(
            diagnostic =>
              `[i18n] ${directory}/${diagnostic.locale}.json: ${diagnostic.checkId}: ${diagnostic.message}`
          )
          .join('\n')
      )
    }
  }
}

export async function readCatalogs({
  root,
  locales,
  baseLocale
}: CatalogOptions): Promise<Record<string, Catalog>> {
  if (
    !locales.includes(baseLocale) ||
    new Set(locales).size !== locales.length
  ) {
    throw new Error('[i18n] Invalid locale configuration')
  }
  const discovered: string[] = []
  for await (const file of glob(CATALOG_GLOB, {
    cwd: root,
    exclude: CATALOG_EXCLUDES
  })) {
    discovered.push(file)
  }
  const files = discovered.toSorted()
  if (files.length === 0) throw new Error('[i18n] No colocated catalogs found')
  const directories = new Set(files.map(file => path.dirname(file)))
  const catalogs: Record<string, Catalog> = Object.fromEntries(
    locales.map(locale => [locale, {}])
  )
  const owners = new Map<string, string>()

  for (const directory of directories) {
    const present = files
      .filter(file => path.dirname(file) === directory)
      .map(file => path.basename(file, '.json'))
    const missing = locales.filter(locale => !present.includes(locale))
    const extra = present.filter(locale => !locales.includes(locale))
    if (missing.length > 0 || extra.length > 0) {
      throw new Error(
        `[i18n] ${directory}: missing locales [${missing.join(', ')}], unexpected [${extra.join(', ')}]`
      )
    }
    const current: Record<string, Catalog> = {}
    for (const locale of [
      baseLocale,
      ...locales.filter(item => item !== baseLocale)
    ]) {
      const file = path.join(directory, `${locale}.json`)
      const catalog = parseCatalog({
        file,
        source: await readFile(path.join(root, file), 'utf8')
      })
      current[locale] = catalog
      Object.assign(catalogs[locale] ?? {}, catalog)
    }
    await validateMessages({ directory, catalogs: current, baseLocale })
    claimMessages({
      keys: Object.keys(current[baseLocale] ?? {}),
      directory,
      owners
    })
  }
  return catalogs
}

export function isCatalogFile({ root, file }: CatalogFileOptions): boolean {
  const relative = path.relative(root, file).split(path.sep).join('/')
  return CATALOG_PATH.test(relative) && !EXCLUDED_PATH.test(relative)
}

export function canContainCatalogs({
  root,
  file
}: CatalogFileOptions): boolean {
  const relative = `${path.relative(root, file).split(path.sep).join('/')}/`
  return relative.startsWith('src/') && !EXCLUDED_PATH.test(relative)
}
