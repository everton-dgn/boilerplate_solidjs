/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, it } from 'node:test'

import type { PrerenderRoute } from 'nitro/types'
import * as v from 'valibot'

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
  compiled?: () => Promise<void>
}
type Prerender = { routes?: string[]; failOnError?: boolean }
type Config = v.InferOutput<typeof ConfigSchema>
type Setup = {
  prerender: Prerender
  handlers: Handlers
  config: Config
  finish: () => Promise<v.InferOutput<typeof ConfigSchema>>
}
type Listing = { handlers: Handlers; paths: string[] }

const NOT_FOUND = -1
const VERCEL_CONFIG_VERSION = 3
const RouteSchema = v.looseObject({
  src: v.optional(v.string()),
  dest: v.optional(v.string()),
  handle: v.optional(v.string())
})
const ConfigSchema = v.looseObject({
  version: v.literal(VERCEL_CONFIG_VERSION),
  routes: v.array(RouteSchema)
})

async function setup(): Promise<Setup> {
  const dir = await mkdtemp(path.join(tmpdir(), 'markdown-routing-'))
  after(() => rm(dir, { recursive: true, force: true }))
  const prerender: Prerender = { routes: ['/existing'] }
  const handlers: Handlers = {}
  const config: Config = {
    version: 3,
    routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/__server' }]
  }
  markdownPrerender({
    options: { prerender, output: { dir } },
    hooks: {
      hook<Name extends keyof Handlers>(
        name: Name,
        handler: NonNullable<Handlers[Name]>
      ) {
        handlers[name] = handler
      }
    }
  })
  return {
    prerender,
    handlers,
    config,
    async finish() {
      const file = path.join(dir, 'config.json')
      await writeFile(file, JSON.stringify(config))
      await handlers.compiled?.()
      return v.parse(ConfigSchema, JSON.parse(await readFile(file, 'utf8')))
    }
  }
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

it('registra a lista estática e falha o build em erro de prerender', async () => {
  const { prerender } = await setup()
  assert.deepEqual(prerender, {
    routes: ['/existing', MARKDOWN_PRERENDER_PATH],
    failOnError: true
  })
})

it('enfileira os arquivos listados sem gravar a lista', async () => {
  const { handlers } = await setup()
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

it('encaminha páginas com index.md ao SSR antes do filesystem da Vercel', async () => {
  const { handlers, finish } = await setup()
  prerenderList({
    handlers,
    paths: ['/pt/index.md', '/en/index.md', '/es/index.md', '/pt/about.md']
  })
  const { routes } = await finish()
  const filesystem = routes.findIndex(route => 'handle' in route)
  for (const locale of ['pt', 'en', 'es']) {
    for (const pathname of [`/${locale}`, `/${locale}/`]) {
      const index = routes.findIndex(
        route =>
          route.src !== undefined && new RegExp(route.src, 'u').test(pathname)
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
      routes
        .slice(0, filesystem)
        .some(
          route =>
            route.src !== undefined && new RegExp(route.src, 'u').test(pathname)
        ),
      false,
      pathname
    )
  }
})

it('protege a raiz sem aceitar duas barras', async () => {
  const { handlers, finish } = await setup()
  prerenderList({ handlers, paths: ['/index.md'] })
  const { routes } = await finish()
  const [route] = routes
  assert.ok(route?.src)
  const pattern = new RegExp(route.src, 'u')
  assert.equal(pattern.test('/'), true)
  assert.equal(pattern.test('//'), false)
  assert.equal(pattern.test('/index.md'), false)
})

it('protege índices aninhados sem tratar o caminho como expressão regular', async () => {
  const { handlers, finish } = await setup()
  prerenderList({ handlers, paths: ['/pt/v1.0/index/index.md'] })
  const { routes } = await finish()
  const [route] = routes
  assert.ok(route?.src)
  const pattern = new RegExp(route.src, 'u')
  assert.equal(pattern.test('/pt/v1.0/index'), true)
  assert.equal(pattern.test('/pt/v1.0/index/'), true)
  assert.equal(pattern.test('/pt/v1x0/index'), false)
  assert.equal(pattern.test('/pt/v1.0/index/index.md'), false)
})

it('preserva a codificação das URLs ao proteger diretórios', async () => {
  for (const pathname of ['/pt/caf%C3%A9', '/pt/my%20page', '/pt/50%25']) {
    const { handlers, finish } = await setup()
    prerenderList({ handlers, paths: [`${pathname}/index.md`] })
    const { routes } = await finish()
    const [route] = routes
    assert.ok(route?.src)
    const pattern = new RegExp(route.src, 'u')
    assert.equal(pattern.test(pathname), true, pathname)
    assert.equal(pattern.test(`${pathname}/`), true, pathname)
    assert.equal(pattern.test(`${pathname}/index.md`), false, pathname)
  }
})

it('preserva cabeçalhos, redirects e rewrites anteriores ao filesystem', async () => {
  const filesystemIndex = 3
  const { handlers, config, finish } = await setup()
  config.routes = [
    { src: '^/pt$', headers: { 'x-page': 'home' }, continue: true },
    { src: '^/en$', status: 307, headers: { Location: '/pt' } },
    { src: '^/es$', dest: '/maintenance.html' },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/__server' }
  ]
  const existing = [...config.routes]
  prerenderList({ handlers, paths: ['/pt/index.md'] })
  const { routes } = await finish()
  assert.deepEqual(
    routes.slice(0, filesystemIndex),
    existing.slice(0, filesystemIndex)
  )
  assert.deepEqual(
    routes.slice(filesystemIndex + 1),
    existing.slice(filesystemIndex)
  )
  const guard = routes[filesystemIndex]
  assert.ok(guard?.src)
  assert.equal(guard.dest, '/__server')
  assert.match('/pt', new RegExp(guard.src, 'u'))
  assert.deepEqual(config.routes, existing)
})

it('recusa um artefato sem fase de filesystem em vez de inventar um destino', async () => {
  const { handlers, config, finish } = await setup()
  config.routes = [
    { src: '^/pt$', headers: { 'x-page': 'home' }, continue: true }
  ]
  prerenderList({ handlers, paths: ['/pt/index.md'] })
  await assert.rejects(finish, {
    message: 'Vercel output has no filesystem routes for Markdown pages'
  })
})

it('mantém a proteção na fase inicial quando há uma fase de erro', async () => {
  const firstPhase = 2
  const { handlers, config, finish } = await setup()
  config.routes = [
    { src: '^/pt$', headers: { 'x-page': 'home' }, continue: true },
    { handle: 'error' },
    { src: '/(.*)', dest: '/404', status: 404 },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/__server' }
  ]
  const existing = [...config.routes]
  prerenderList({ handlers, paths: ['/pt/index.md'] })
  const { routes } = await finish()
  assert.deepEqual(routes[0], existing[0])
  assert.equal(routes[1]?.dest, '/__server')
  assert.deepEqual(routes.slice(firstPhase), existing.slice(1))
})

it('preserva capturas e condições da rota nativa sem copiar a fase de erro', async () => {
  const { handlers, config, finish } = await setup()
  const native = {
    src: '/(?<section>pt)/(.*)',
    dest: '/worker?section=$section&rest=$2',
    methods: ['GET'],
    has: [{ type: 'header', key: 'x-route', value: 'yes' }],
    missing: [{ type: 'cookie', key: 'disabled' }],
    caseSensitive: true
  } satisfies NonNullable<Config['routes']>[number]
  config.routes = [
    { handle: 'filesystem' },
    native,
    { handle: 'error' },
    { src: '/(.*)', dest: '/error', status: 500 }
  ]
  prerenderList({ handlers, paths: ['/pt/docs/index.md'] })
  const { routes } = await finish()
  const [guard] = routes
  assert.ok(guard?.src)
  assert.deepEqual({ ...guard, src: native.src }, native)
  assert.deepEqual(routes.slice(1), config.routes)
  const match = new RegExp(guard.src, 'u').exec('/pt/docs')
  assert.deepEqual(match?.slice(1), ['pt', 'docs'])
  assert.equal(match.groups?.section, 'pt')
  assert.equal(new RegExp(guard.src, 'u').test('/pt/docs/index.md'), false)
})

it('preserva o artefato inteiro quando não há index.md na lista', async () => {
  const { handlers, config, finish } = await setup()
  config.framework = { version: 'test' }
  prerenderList({ handlers, paths: ['/pt/about.md'] })
  assert.deepEqual(await finish(), config)
})

it('marca erro quando a lista não traz só arquivos .md', async () => {
  for (const contents of ['not json', '["/en/about"]', '{}']) {
    const { handlers } = await setup()
    const routes = new Set<string>()
    handlers['prerender:routes']?.(routes)
    const route: PrerenderRoute = { route: MARKDOWN_PRERENDER_PATH, contents }
    handlers['prerender:generate']?.(route)
    assert.equal(routes.size, 0)
    assert.equal(route.skip, true)
    assert.ok(route.error)
  }
})

it('não altera as demais rotas do prerender', async () => {
  const { handlers } = await setup()
  handlers['prerender:routes']?.(new Set())
  const route: PrerenderRoute = { route: '/en/about.md', contents: '# About' }
  handlers['prerender:generate']?.(route)
  assert.deepEqual(route, { route: '/en/about.md', contents: '# About' })
})

it('falha o build quando a lista não passa pelo prerender', async () => {
  const { handlers } = await setup()
  handlers['prerender:routes']?.(new Set())
  assert.throws(() => handlers['prerender:done']?.(written([])), {
    message: 'Static Markdown list was not prerendered'
  })
})

it('falha o build quando um .md listado não foi gravado', async () => {
  const { handlers } = await setup()
  prerenderList({ handlers, paths: ['/en/about.md', '/pt/index.md'] })
  assert.throws(() => handlers['prerender:done']?.(written(['/en/about.md'])), {
    message: 'Static Markdown not generated: /pt/index.md'
  })
})

it('aceita os .md gravados com o caminho decodificado pelo Nitro', async () => {
  const { handlers } = await setup()
  prerenderList({ handlers, paths: ['/en/about.md', '/pt/caf%C3%A9.md'] })
  assert.ok(handlers['prerender:done'])
  assert.doesNotThrow(() =>
    handlers['prerender:done']?.(written(['/en/about.md', '/pt/café.md']))
  )
})

it('deixa o failOnError do Nitro relatar as rotas com erro', async () => {
  const { prerender, handlers } = await setup()
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
