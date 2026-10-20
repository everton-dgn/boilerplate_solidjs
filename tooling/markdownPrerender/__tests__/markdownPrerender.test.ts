/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { it } from 'node:test'

import type { NitroConfig, PrerenderRoute } from 'nitro/types'

import { MARKDOWN_PRERENDER_PATH } from '../../../src/middleware/markdownContent/constants.ts'
import { markdownPrerender } from '../index.ts'

type PrerenderResult = {
  prerenderedRoutes: PrerenderRoute[]
  failedRoutes: PrerenderRoute[]
}
type Handlers = {
  'prerender:routes'?: (routes: Set<string>) => void
  'prerender:generate'?: (route: PrerenderRoute) => void
  'prerender:done'?: (result: PrerenderResult) => void
}
type Prerender = { routes?: string[]; failOnError?: boolean }
type Options = {
  prerender: Prerender
  vercel: NonNullable<NitroConfig['vercel']>
}
type Setup = { prerender: Prerender; handlers: Handlers; options: Options }
type Listing = { handlers: Handlers; paths: string[] }

const NOT_FOUND = -1

function setup(): Setup {
  const prerender: Prerender = { routes: ['/existing'] }
  const handlers: Handlers = {}
  const options: Options = {
    prerender,
    vercel: {
      config: {
        version: 3,
        routes: [{ handle: 'filesystem' }]
      }
    }
  }
  markdownPrerender({
    options,
    hooks: {
      hook<Name extends keyof Handlers>(
        name: Name,
        handler: NonNullable<Handlers[Name]>
      ) {
        handlers[name] = handler
      }
    }
  })
  return { prerender, handlers, options }
}

function prerenderList({ handlers, paths }: Listing): void {
  handlers['prerender:routes']?.(new Set())
  handlers['prerender:generate']?.({
    route: MARKDOWN_PRERENDER_PATH,
    contents: JSON.stringify(paths)
  })
}

function written(routes: string[]): PrerenderResult {
  return {
    prerenderedRoutes: routes.map(route => ({ route })),
    failedRoutes: []
  }
}

it('registra a lista estática e falha o build em erro de prerender', () => {
  const { prerender } = setup()
  assert.deepEqual(prerender, {
    routes: ['/existing', MARKDOWN_PRERENDER_PATH],
    failOnError: true
  })
})

it('enfileira os arquivos listados sem gravar a lista', () => {
  const { handlers } = setup()
  const routes = new Set<string>()
  handlers['prerender:routes']?.(routes)
  const route: PrerenderRoute = {
    route: MARKDOWN_PRERENDER_PATH,
    contents: JSON.stringify(['/en/about.md', '/pt/index.md'])
  }
  handlers['prerender:generate']?.(route)
  assert.deepEqual([...routes], ['/en/about.md', '/pt/index.md'])
  assert.equal(route.skip, true)
  assert.equal(route.error, undefined)
})

it('encaminha páginas com index.md ao SSR antes do filesystem da Vercel', () => {
  const { handlers, options } = setup()
  prerenderList({
    handlers,
    paths: ['/pt/index.md', '/en/index.md', '/es/index.md', '/pt/about.md']
  })
  const routes = options.vercel.config?.routes ?? []
  const filesystem = routes.findIndex(route => 'handle' in route)
  for (const locale of ['pt', 'en', 'es']) {
    for (const pathname of [`/${locale}`, `/${locale}/`]) {
      const index = routes.findIndex(
        route => 'src' in route && new RegExp(route.src, 'u').test(pathname)
      )
      assert.ok(index !== NOT_FOUND && index < filesystem, pathname)
      const route = routes[index]
      assert.ok(route && 'src' in route)
      assert.equal(route.dest, '/__server')
    }
  }
  assert.deepEqual(routes[filesystem], { handle: 'filesystem' })
  for (const pathname of [
    '/pt/index.md',
    '/pt/about',
    '/pt/about.md',
    '/ptx'
  ]) {
    assert.equal(
      routes.some(
        route => 'src' in route && new RegExp(route.src, 'u').test(pathname)
      ),
      false,
      pathname
    )
  }
})

it('protege a raiz sem aceitar duas barras', () => {
  const { handlers, options } = setup()
  prerenderList({ handlers, paths: ['/index.md'] })
  const route = options.vercel.config?.routes?.[0]
  assert.ok(route && 'src' in route)
  const pattern = new RegExp(route.src, 'u')
  assert.equal(pattern.test('/'), true)
  assert.equal(pattern.test('//'), false)
  assert.equal(pattern.test('/index.md'), false)
})

it('protege índices aninhados sem tratar o caminho como expressão regular', () => {
  const { handlers, options } = setup()
  prerenderList({ handlers, paths: ['/pt/v1.0/index/index.md'] })
  const route = options.vercel.config?.routes?.[0]
  assert.ok(route && 'src' in route)
  const pattern = new RegExp(route.src, 'u')
  assert.equal(pattern.test('/pt/v1.0/index'), true)
  assert.equal(pattern.test('/pt/v1.0/index/'), true)
  assert.equal(pattern.test('/pt/v1x0/index'), false)
  assert.equal(pattern.test('/pt/v1.0/index/index.md'), false)
})

it('marca erro quando a lista não traz só arquivos .md', () => {
  for (const contents of ['not json', '["/en/about"]', '{}']) {
    const { handlers } = setup()
    const routes = new Set<string>()
    handlers['prerender:routes']?.(routes)
    const route: PrerenderRoute = { route: MARKDOWN_PRERENDER_PATH, contents }
    handlers['prerender:generate']?.(route)
    assert.equal(routes.size, 0)
    assert.equal(route.skip, true)
    assert.ok(route.error)
  }
})

it('não altera as demais rotas do prerender', () => {
  const { handlers } = setup()
  handlers['prerender:routes']?.(new Set())
  const route: PrerenderRoute = { route: '/en/about.md', contents: '# About' }
  handlers['prerender:generate']?.(route)
  assert.deepEqual(route, { route: '/en/about.md', contents: '# About' })
})

it('falha o build quando a lista não passa pelo prerender', () => {
  const { handlers } = setup()
  handlers['prerender:routes']?.(new Set())
  assert.throws(() => handlers['prerender:done']?.(written([])), {
    message: 'Static Markdown list was not prerendered'
  })
})

it('falha o build quando um .md listado não foi gravado', () => {
  const { handlers } = setup()
  prerenderList({ handlers, paths: ['/en/about.md', '/pt/index.md'] })
  assert.throws(() => handlers['prerender:done']?.(written(['/en/about.md'])), {
    message: 'Static Markdown not generated: /pt/index.md'
  })
})

it('aceita os .md gravados com o caminho decodificado pelo Nitro', () => {
  const { handlers } = setup()
  prerenderList({ handlers, paths: ['/en/about.md', '/pt/caf%C3%A9.md'] })
  assert.ok(handlers['prerender:done'])
  assert.doesNotThrow(() =>
    handlers['prerender:done']?.(written(['/en/about.md', '/pt/café.md']))
  )
})

it('deixa o failOnError do Nitro relatar as rotas com erro', () => {
  const { prerender, handlers } = setup()
  prerenderList({ handlers, paths: ['/en/about.md'] })
  const result: PrerenderResult = {
    prerenderedRoutes: [],
    failedRoutes: [{ route: '/en/about.md', error: { message: '[500]' } }]
  }
  assert.doesNotThrow(() => handlers['prerender:done']?.(result))
  prerender.failOnError = false
  assert.throws(() => handlers['prerender:done']?.(result), {
    message: 'Static Markdown not generated: /en/about.md'
  })
})
