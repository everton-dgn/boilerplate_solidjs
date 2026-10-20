import type { NitroConfig, PrerenderRoute } from 'nitro/types'

import { MARKDOWN_PRERENDER_PATH } from '../../src/middleware/markdownContent/constants.ts'

type PrerenderResult = {
  prerenderedRoutes: PrerenderRoute[]
  failedRoutes: PrerenderRoute[]
}
type RoutesHook = (routes: Set<string>) => void
type GenerateHook = (route: PrerenderRoute) => void
type DoneHook = (result: PrerenderResult) => void
type PrerenderOptions = {
  routes?: string[]
  failOnError?: boolean
}
type Options = {
  prerender: PrerenderOptions
  vercel?: NitroConfig['vercel']
}
type PrerenderNitro = {
  options: Options
  hooks: {
    hook: ((name: 'prerender:routes', handler: RoutesHook) => unknown) &
      ((name: 'prerender:generate', handler: GenerateHook) => unknown) &
      ((name: 'prerender:done', handler: DoneHook) => unknown)
  }
}
type RoutingOptions = { options: Options; paths: string[] }

const MARKDOWN_FILE = /^\/[^?#]+\.md$/u
const INDEX_FILE = '/index.md'

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

function protectDirectoryPages({ options, paths }: RoutingOptions): void {
  const routes = paths
    .filter(path => path.endsWith(INDEX_FILE))
    .map(path => {
      const directory = decodeURI(path.slice(0, -INDEX_FILE.length))
      const pattern = directory.replaceAll(
        /[.*+?^${}()|[\]\\]/gu,
        String.raw`\$&`
      )
      return { src: directory ? `^${pattern}/?$` : '^/$', dest: '/__server' }
    })
  if (routes.length === 0) return
  options.vercel ??= {}
  options.vercel.config ??= { version: 3 }
  const { config } = options.vercel
  // A Vercel também usa index.md como índice de diretório, antes do SSR.
  config.routes = [...routes, ...(config.routes ?? [])]
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
    protectDirectoryPages({ options: nitro.options, paths })
    for (const path of paths) queue.add(path)
  })
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
