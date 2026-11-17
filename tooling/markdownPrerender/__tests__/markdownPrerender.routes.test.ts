import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, it } from 'node:test'

import type { PrerenderRoute } from 'nitro/types'
import * as v from 'valibot'

import { LLMS_DESCRIBEDBY_LINK } from '../../../src/constants/llms.ts'
import { MARKDOWN_PRERENDER_PATH } from '../../../src/middleware/markdownContent/constants.ts'
import { SITEMAP_INVENTORY_PATH } from '../../publicationArtifacts/constants.ts'
import { markdownPrerender } from '../index.ts'

type PrerenderResult = {
  prerenderedRoutes: PrerenderRoute[]
  failedRoutes: PrerenderRoute[]
}
type Handlers = {
  'prerender:init'?: () => void
  'prerender:routes'?: (routes: Set<string>) => void
  'prerender:generate'?: (route: PrerenderRoute) => void
  'prerender:done'?: (result: PrerenderResult) => Promise<void>
  compiled?: () => Promise<void>
}
type Config = v.InferOutput<typeof ConfigSchema>
type Route = Config['routes'][number]
type Setup = {
  handlers: Handlers
  config: Config
  finish: () => Promise<Config>
}
type Listing = { handlers: Handlers; paths: string[] }

const NOT_FOUND = -1
const VERCEL_CONFIG_VERSION = 3
const SITE_URL = 'https://example.com/'
// The Link rule and the folder protection take the start of the initial phase.
const ADDED_ROUTES = 2
const BUILD_ID = 'build-under-test'
const EMPTY_INVENTORY = JSON.stringify({
  version: 1,
  buildId: BUILD_ID,
  siteUrl: SITE_URL,
  byteBudget: 4_194_304,
  pagePartCount: 0,
  hasArraySources: false,
  hasPartitionSources: false,
  identities: null
})
const HeaderSchema = v.record(v.string(), v.string())
const OverridesSchema = v.record(v.string(), v.looseObject({}))
const RouteSchema = v.looseObject({
  src: v.optional(v.string()),
  dest: v.optional(v.string()),
  handle: v.optional(v.string()),
  continue: v.optional(v.boolean()),
  headers: v.optional(HeaderSchema)
})
const ConfigSchema = v.looseObject({
  version: v.literal(VERCEL_CONFIG_VERSION),
  routes: v.array(RouteSchema),
  overrides: v.optional(OverridesSchema)
})

// These scenarios only reach `config.json`: they neither write public files nor
// go through the end of the prerender, which the main suite covers.
async function setup(): Promise<Setup> {
  const dir = await mkdtemp(path.join(tmpdir(), 'markdown-routes-'))
  after(() => rm(dir, { recursive: true, force: true }))
  const handlers: Handlers = {}
  const config: Config = {
    version: 3,
    routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/__server' }]
  }
  markdownPrerender({ buildId: BUILD_ID })({
    options: {
      prerender: {},
      output: {
        dir,
        publicDir: path.join(dir, 'static'),
        serverDir: path.join(dir, 'functions', '__server.func')
      }
    },
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
    contents: JSON.stringify({
      siteUrl: SITE_URL,
      baseLocale: 'en',
      paths,
      baseLocalePaths: paths,
      mismatches: []
    })
  })
  handlers['prerender:generate']?.({
    route: SITEMAP_INVENTORY_PATH,
    contents: EMPTY_INVENTORY
  })
}

function guardRoutes(routes: Route[]): Route[] {
  return routes.filter(
    route => route.dest === '/__server' && route.src?.startsWith('^(?=')
  )
}

function isDescribedby(route: Route): boolean {
  return route.headers?.link === LLMS_DESCRIBEDBY_LINK
}

it('forwards pages with index.md to the SSR before the Vercel filesystem', async () => {
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
          route.src !== undefined &&
          route.continue !== true &&
          new RegExp(route.src, 'u').test(pathname)
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
            route.src !== undefined &&
            route.continue !== true &&
            new RegExp(route.src, 'u').test(pathname)
        ),
      false,
      pathname
    )
  }
  // Before the filesystem, only the Link header rule reaches the `.md` files.
  const headerRoutes = routes
    .slice(0, filesystem)
    .filter(
      route =>
        route.continue === true &&
        new RegExp(route.src ?? '', 'u').test('/pt/index.md')
    )
  assert.equal(headerRoutes.length, 1)
  assert.ok(headerRoutes[0] && isDescribedby(headerRoutes[0]))
})

it('protects the root without accepting two slashes', async () => {
  const { handlers, finish } = await setup()
  prerenderList({ handlers, paths: ['/index.md'] })
  const { routes } = await finish()
  const [route] = guardRoutes(routes)
  assert.ok(route?.src)
  const pattern = new RegExp(route.src, 'u')
  assert.equal(pattern.test('/'), true)
  assert.equal(pattern.test('//'), false)
  assert.equal(pattern.test('/index.md'), false)
})

it('protects nested indexes without treating the path as a regular expression', async () => {
  const { handlers, finish } = await setup()
  prerenderList({ handlers, paths: ['/pt/v1.0/index/index.md'] })
  const { routes } = await finish()
  const [route] = guardRoutes(routes)
  assert.ok(route?.src)
  const pattern = new RegExp(route.src, 'u')
  assert.equal(pattern.test('/pt/v1.0/index'), true)
  assert.equal(pattern.test('/pt/v1.0/index/'), true)
  assert.equal(pattern.test('/pt/v1x0/index'), false)
  assert.equal(pattern.test('/pt/v1.0/index/index.md'), false)
})

it('keeps the URL encoding when protecting folders', async () => {
  for (const pathname of ['/pt/caf%C3%A9', '/pt/my%20page', '/pt/50%25']) {
    const { handlers, finish } = await setup()
    prerenderList({ handlers, paths: [`${pathname}/index.md`] })
    const { routes } = await finish()
    const [route] = guardRoutes(routes)
    assert.ok(route?.src)
    const pattern = new RegExp(route.src, 'u')
    assert.equal(pattern.test(pathname), true, pathname)
    assert.equal(pattern.test(`${pathname}/`), true, pathname)
    assert.equal(pattern.test(`${pathname}/index.md`), false, pathname)
  }
})

it('keeps headers, redirects and rewrites before the filesystem', async () => {
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
  const describedby = routes[filesystemIndex]
  assert.ok(describedby && isDescribedby(describedby))
  assert.deepEqual(
    routes.slice(filesystemIndex + ADDED_ROUTES),
    existing.slice(filesystemIndex)
  )
  const guard = routes[filesystemIndex + 1]
  assert.ok(guard?.src)
  assert.equal(guard.dest, '/__server')
  assert.match('/pt', new RegExp(guard.src, 'u'))
  assert.deepEqual(config.routes, existing)
})

it('refuses an artifact without a filesystem phase instead of making up a target', async () => {
  const { handlers, config, finish } = await setup()
  config.routes = [
    { src: '^/pt$', headers: { 'x-page': 'home' }, continue: true }
  ]
  prerenderList({ handlers, paths: ['/pt/index.md'] })
  await assert.rejects(finish, {
    message: 'Vercel output has no filesystem routes for Markdown pages'
  })
})

it('keeps the protection in the initial phase when there is an error phase', async () => {
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
  assert.ok(routes[1] && isDescribedby(routes[1]))
  assert.equal(routes[firstPhase]?.dest, '/__server')
  assert.deepEqual(routes.slice(firstPhase + 1), existing.slice(1))
})

it('keeps the captures and conditions of the native route without copying the error phase', async () => {
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
  const [describedby, guard] = routes
  assert.ok(describedby && isDescribedby(describedby))
  assert.ok(guard?.src)
  assert.deepEqual({ ...guard, src: native.src }, native)
  assert.deepEqual(routes.slice(ADDED_ROUTES), config.routes)
  const match = new RegExp(guard.src, 'u').exec('/pt/docs')
  assert.deepEqual(match?.slice(1), ['pt', 'docs'])
  assert.equal(match.groups?.section, 'pt')
  assert.equal(new RegExp(guard.src, 'u').test('/pt/docs/index.md'), false)
})

it('keeps the artifact when there is no index.md, only with the Link of the .md files', async () => {
  const { handlers, config, finish } = await setup()
  config.framework = { version: 'test' }
  prerenderList({ handlers, paths: ['/pt/about.md'] })
  const output = await finish()
  const [describedby, ...routes] = output.routes
  assert.deepEqual({ ...output, routes }, config)
  assert.deepEqual(describedby, {
    src: String.raw`^/(?:.+\.md)$`,
    headers: { link: LLMS_DESCRIBEDBY_LINK },
    continue: true
  })
})

it('attaches the Link to every .md URL before the filesystem, without touching pages', async () => {
  const { handlers, finish } = await setup()
  prerenderList({ handlers, paths: ['/pt/about.md'] })
  const { routes } = await finish()
  const filesystem = routes.findIndex(route => route.handle === 'filesystem')
  const index = routes.findIndex(route => isDescribedby(route))
  assert.ok(index !== NOT_FOUND && index < filesystem)
  const pattern = new RegExp(routes[index]?.src ?? '', 'u')
  for (const pathname of ['/pt/about.md', '/pt/index.md', '/pt/blog/x.md']) {
    assert.equal(pattern.test(pathname), true, pathname)
  }
  for (const pathname of ['/pt/about', '/llms-full.txt', '/x.md/y', '/.md']) {
    assert.equal(pattern.test(pathname), false, pathname)
  }
})

it('does not change the artifact when there is neither static Markdown nor an aggregate', async () => {
  const { handlers, config, finish } = await setup()
  prerenderList({ handlers, paths: [] })
  assert.deepEqual(await finish(), config)
})
