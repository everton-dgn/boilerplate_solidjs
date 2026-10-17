import type { PrerenderRoute } from 'nitro/types'

import { MARKDOWN_PRERENDER_PATH } from '../../src/middleware/markdownContent/constants.ts'

type RoutesHook = (routes: Set<string>) => void
type GenerateHook = (route: PrerenderRoute) => void
type PrerenderNitro = {
  options: { prerender: { routes?: string[]; failOnError?: boolean } }
  hooks: {
    hook: ((name: 'prerender:routes', handler: RoutesHook) => unknown) &
      ((name: 'prerender:generate', handler: GenerateHook) => unknown)
  }
}

const MARKDOWN_FILE = /^\/[^?#]+\.md$/u

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

// O build pede ao middleware a lista de páginas estáticas e prerenderiza cada
// `.md` pela mesma conversão da requisição. Uma falha em qualquer uma delas,
// inclusive na própria lista, interrompe o build.
export function markdownPrerender(nitro: PrerenderNitro): void {
  let queue: Set<string> | undefined
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
    for (const path of paths) queue.add(path)
  })
}
