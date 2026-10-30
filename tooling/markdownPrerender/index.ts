import { readFile, writeFile } from 'node:fs/promises'
import nodePath from 'node:path'

import type { PrerenderRoute } from 'nitro/types'
import * as v from 'valibot'

import { MARKDOWN_PRERENDER_PATH } from '../../src/middleware/markdownContent/constants.ts'

type PrerenderResult = {
  prerenderedRoutes: PrerenderRoute[]
  failedRoutes: PrerenderRoute[]
}
type RoutesHook = (routes: Set<string>) => void
type GenerateHook = (route: PrerenderRoute) => void
type DoneHook = (result: PrerenderResult) => void
type CompiledHook = () => Promise<void>
type PrerenderOptions = {
  routes?: string[]
  failOnError?: boolean
}
type Options = {
  prerender: PrerenderOptions
  output: { dir: string }
}
type PrerenderNitro = {
  options: Options
  hooks: {
    hook: ((name: 'prerender:routes', handler: RoutesHook) => unknown) &
      ((name: 'prerender:generate', handler: GenerateHook) => unknown) &
      ((name: 'prerender:done', handler: DoneHook) => unknown) &
      ((name: 'compiled', handler: CompiledHook) => unknown)
  }
}
type RoutingOptions = { outputDir: string; paths: string[] }
type InitialRoutes = {
  routes: v.InferOutput<typeof RouteSchema>[]
  directories: string[]
}

const MARKDOWN_FILE = /^\/[^?#]+\.md$/u
const INDEX_FILE = '/index.md'
const NOT_FOUND = -1
const VERCEL_CONFIG_VERSION = 3
const JSON_INDENT = 2
const RouteSchema = v.looseObject({
  src: v.optional(v.string()),
  handle: v.optional(v.string())
})
const BuildConfigSchema = v.looseObject({
  version: v.literal(VERCEL_CONFIG_VERSION),
  routes: v.array(RouteSchema)
})

function readPaths(contents: string | undefined): string[] | undefined {
  try {
    const paths: unknown = JSON.parse(contents ?? '')
    return Array.isArray(paths) &&
      paths.every(path => typeof path === 'string' && MARKDOWN_FILE.test(path))
      ? paths
      : undefined
  } catch {
    return undefined
  }
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

async function protectDirectoryPages({
  outputDir,
  paths
}: RoutingOptions): Promise<void> {
  const directories = paths
    .filter(path => path.endsWith(INDEX_FILE))
    .map(path => path.slice(0, -INDEX_FILE.length))
  if (directories.length === 0) return
  const file = nodePath.join(outputDir, 'config.json')
  const config = v.parse(
    BuildConfigSchema,
    JSON.parse(await readFile(file, 'utf8'))
  )
  const patterns = directories.map(directory =>
    directory
      ? `${directory.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)}/?`
      : '/'
  )
  const prefix = `^(?=(?:${patterns.join('|')})$)`
  let phase: string | undefined
  const routes = config.routes.flatMap(route => {
    if (route.handle !== undefined) {
      phase = route.handle
      return []
    }
    if (phase !== 'filesystem' || route.src === undefined) return []
    // Grupos sem captura preservam os parâmetros das rotas geradas pelo Nitro.
    return [{ ...route, src: `${prefix}(?:${route.src})$` }]
  })
  const boundary = config.routes.findIndex(route => 'handle' in route)
  if (boundary === NOT_FOUND || routes.length === 0) {
    throw new Error('Vercel output has no filesystem routes for Markdown pages')
  }
  assertInitialRoutes({
    routes: config.routes.slice(0, boundary),
    directories
  })
  config.routes.splice(boundary, 0, ...routes)
  await writeFile(file, `${JSON.stringify(config, null, JSON_INDENT)}\n`)
}

// O build pede ao middleware a lista de páginas estáticas e prerenderiza cada
// `.md` pela mesma conversão da requisição. Uma falha em qualquer uma delas,
// inclusive na própria lista, interrompe o build.
export function markdownPrerender(nitro: PrerenderNitro): void {
  let queue: Set<string> | undefined
  let expected: string[] | undefined
  nitro.options.prerender.failOnError = true
  nitro.options.prerender.routes = [
    ...(nitro.options.prerender.routes ?? []),
    MARKDOWN_PRERENDER_PATH
  ]
  nitro.hooks.hook('prerender:routes', routes => {
    queue = routes
  })
  nitro.hooks.hook('prerender:generate', route => {
    if (route.route !== MARKDOWN_PRERENDER_PATH) return
    route.skip = true
    if (route.error) return
    const paths = readPaths(route.contents)
    if (!queue || !paths) {
      route.error = new Error('Invalid static Markdown list')
      return
    }
    expected = paths
    for (const path of paths) queue.add(path)
  })
  nitro.hooks.hook('compiled', () =>
    protectDirectoryPages({
      outputDir: nitro.options.output.dir,
      paths: expected ?? []
    })
  )
  // O Nitro só falha o build por rota com `error`. Uma exceção no fetch, na
  // gravação ou no hook de geração, ou uma rota ignorada, termina sem arquivo e
  // sem erro registrado.
  nitro.hooks.hook('prerender:done', ({ prerenderedRoutes, failedRoutes }) => {
    // Com `failOnError`, o Nitro interrompe o build em seguida e lista as rotas.
    if (failedRoutes.length > 0 && nitro.options.prerender.failOnError) return
    if (!expected) throw new Error('Static Markdown list was not prerendered')
    // O Nitro registra a rota já decodificada.
    const written = new Set(prerenderedRoutes.map(route => route.route))
    const missing = expected.filter(path => !written.has(decodeURI(path)))
    if (missing.length > 0) {
      throw new Error(`Static Markdown not generated: ${missing.join(', ')}`)
    }
  })
}
