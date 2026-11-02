import { readFile, writeFile } from 'node:fs/promises'
import nodePath from 'node:path'

import * as v from 'valibot'

import { LLMS_DESCRIBEDBY_LINK, LLMS_FULL_PATH } from '../../constants.ts'

type VercelRoutesOptions = {
  outputDir: string
  paths: readonly string[]
  hasLlmsFull: boolean
}
type Route = v.InferOutput<typeof RouteSchema>
type InitialRoutes = { routes: Route[]; directories: string[] }
type GuardOptions = { routes: Route[]; directories: string[] }

const INDEX_FILE = '/index.md'
const NOT_FOUND = -1
const VERCEL_CONFIG_VERSION = 3
const JSON_INDENT = 2
const LLMS_FULL_TYPE = 'text/markdown; charset=utf-8'
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/gu
const RouteSchema = v.looseObject({
  src: v.optional(v.string()),
  handle: v.optional(v.string())
})
const OverridesSchema = v.record(v.string(), v.looseObject({}))
const BuildConfigSchema = v.looseObject({
  version: v.literal(VERCEL_CONFIG_VERSION),
  routes: v.array(RouteSchema),
  overrides: v.optional(OverridesSchema)
})

function escapeRegex(text: string): string {
  return text.replaceAll(REGEX_SPECIALS, String.raw`\$&`)
}

function assertInitialRoutes({ routes, directories }: InitialRoutes): void {
  const pages = directories.flatMap(directory =>
    directory ? [directory, `${directory}/`] : ['/']
  )
  for (const route of routes) {
    if (
      route.src === undefined ||
      route.continue === true ||
      route.dest !== undefined ||
      route.status !== undefined
    ) {
      continue
    }
    const pattern = new RegExp(
      `^(?:${route.src})$`,
      route.caseSensitive === true ? 'u' : 'iu'
    )
    if (pages.some(page => pattern.test(page))) {
      throw new Error(
        `Vercel route ends before Markdown page protection: ${route.src}`
      )
    }
  }
}

// Na Vercel, um `index.md` estático também pode atender à URL do diretório.
// As cópias das regras de filesystem restritas a esses diretórios mantêm a
// página HTML na função.
function guardDirectoryPages({ routes, directories }: GuardOptions): Route[] {
  if (directories.length === 0) return []
  const patterns = directories.map(directory =>
    directory ? `${escapeRegex(directory)}/?` : '/'
  )
  const prefix = `^(?=(?:${patterns.join('|')})$)`
  let phase: string | undefined
  const guards = routes.flatMap(route => {
    if (route.handle !== undefined) {
      phase = route.handle
      return []
    }
    if (phase !== 'filesystem' || route.src === undefined) return []
    // Grupos sem captura preservam os parâmetros das rotas geradas pelo Nitro.
    return [{ ...route, src: `${prefix}(?:${route.src})$` }]
  })
  const boundary = routes.findIndex(route => 'handle' in route)
  if (boundary === NOT_FOUND || guards.length === 0) {
    throw new Error('Vercel output has no filesystem routes for Markdown pages')
  }
  assertInitialRoutes({ routes: routes.slice(0, boundary), directories })
  return guards
}

// Uma regra por extensão, sem uma regra por URL: ela também alcança os `.md`
// respondidos pela função, inclusive erros, e só acrescenta o cabeçalho, sem
// mudar status, tipo ou cache.
function describedbyRoute(hasLlmsFull: boolean): Route {
  const targets = hasLlmsFull
    ? `.+\\.md|${escapeRegex(LLMS_FULL_PATH.slice(1))}`
    : String.raw`.+\.md`
  return {
    src: `^/(?:${targets})$`,
    headers: { link: LLMS_DESCRIBEDBY_LINK },
    continue: true
  }
}

// Ajusta o `config.json` gerado pelo preset da Vercel numa única gravação:
// proteção de diretórios com `index.md`, `Link` dos arquivos estáticos e tipo
// do llms-full.txt, que o filesystem serviria como texto simples.
export async function writeVercelRoutes({
  outputDir,
  paths,
  hasLlmsFull
}: VercelRoutesOptions): Promise<void> {
  if (paths.length === 0 && !hasLlmsFull) return
  const file = nodePath.join(outputDir, 'config.json')
  const config = v.parse(
    BuildConfigSchema,
    JSON.parse(await readFile(file, 'utf8'))
  )
  const directories = paths
    .filter(path => path.endsWith(INDEX_FILE))
    .map(path => path.slice(0, -INDEX_FILE.length))
  const guards = guardDirectoryPages({ routes: config.routes, directories })
  const boundary = config.routes.findIndex(
    route => route.handle === 'filesystem'
  )
  if (boundary === NOT_FOUND) {
    throw new Error('Vercel output has no filesystem phase for static Markdown')
  }
  const initial = config.routes.findIndex(route => 'handle' in route)
  config.routes.splice(initial, 0, describedbyRoute(hasLlmsFull), ...guards)
  if (hasLlmsFull) {
    const name = LLMS_FULL_PATH.slice(1)
    config.overrides = {
      ...config.overrides,
      [name]: { ...config.overrides?.[name], contentType: LLMS_FULL_TYPE }
    }
  }
  await writeFile(file, `${JSON.stringify(config, null, JSON_INDENT)}\n`)
}
