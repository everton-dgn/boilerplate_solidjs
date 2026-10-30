import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it, type TestContext } from 'node:test'

import { createNitro } from 'nitro/builder'
import type { NitroConfig } from 'nitro/types'
import * as v from 'valibot'

import { MARKDOWN_PRERENDER_PATH } from '../../../src/middleware/markdownContent/constants.ts'
import { markdownPrerender } from '../index.ts'

const ISR_ROUTE = '__isr_route'
const NOT_FOUND = -1
const HeaderSchema = v.record(v.string(), v.string())
const RouteSchema = v.looseObject({
  src: v.optional(v.string()),
  dest: v.optional(v.string()),
  handle: v.optional(v.string()),
  continue: v.optional(v.boolean()),
  status: v.optional(v.number()),
  headers: v.optional(HeaderSchema)
})
const ConfigSchema = v.looseObject({ routes: v.array(RouteSchema) })

type FixtureOptions = {
  context: TestContext
  config?: NitroConfig
  paths?: string[]
}
type Route = v.InferOutput<typeof RouteSchema>
type MatchOptions = { routes: Route[]; pathname: string }

async function fixture({
  context,
  config,
  paths = ['/pt/index.md']
}: FixtureOptions) {
  const root = await mkdtemp(path.join(tmpdir(), 'markdown-vercel-'))
  const creation = createNitro({
    rootDir: root,
    preset: 'vercel',
    compatibilityDate: '2026-10-20',
    logLevel: 0,
    modules: [markdownPrerender],
    ...config
  })
  context.after(async () => {
    try {
      const instance = await creation
      await instance.close()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
  const nitro = await creation
  await nitro.hooks.callHook('prerender:routes', new Set())
  await nitro.hooks.callHook(
    'prerender:generate',
    {
      route: MARKDOWN_PRERENDER_PATH,
      contents: JSON.stringify(paths)
    },
    nitro
  )
  await nitro.hooks.callHook('compiled', nitro)
  const file = path.join(nitro.options.output.dir, 'config.json')
  const contents = await readFile(file, 'utf8')
  const output = v.parse(ConfigSchema, JSON.parse(contents))
  return { nitro, routes: output.routes }
}

function initialRoutes(routes: Route[]): Route[] {
  return routes.slice(
    0,
    routes.findIndex(route => route.handle !== undefined)
  )
}

function destination({ routes, pathname }: MatchOptions): Route | undefined {
  return initialRoutes(routes).find(
    route =>
      route.src !== undefined &&
      !route.continue &&
      new RegExp(`^(?:${route.src})$`, 'u').test(pathname)
  )
}

it('gera proteção com o preset real sem configurar rotas da Vercel', async context => {
  const variants: NitroConfig[] = [
    {},
    { vercel: { functions: { memory: 1024 } } },
    { vercel: { config: { version: 3 } } }
  ]
  for (const config of variants) {
    const { nitro, routes } = await fixture({ context, config })
    assert.deepEqual(nitro.options.vercel?.config, config.vercel?.config)
    assert.equal(destination({ routes, pathname: '/pt' })?.dest, '/__server')
    assert.equal(destination({ routes, pathname: '/pt/' })?.dest, '/__server')
    assert.equal(destination({ routes, pathname: '/pt/index.md' }), undefined)
  }
})

it('mantém headers, redirects, proxy, skew protection, ISR e functionRules do Nitro', async context => {
  const { routes } = await fixture({
    context,
    paths: ['/pt/index.md', '/en/index.md', '/es/index.md', '/proxy/index.md'],
    config: {
      manifest: { deploymentId: 'test-deployment' },
      vercel: {
        skewProtection: true,
        functionRules: { '/en': { memory: 1024 } },
        config: {
          version: 3,
          routes: [
            { src: '/pt', headers: { 'x-page': 'home' }, continue: true }
          ]
        }
      },
      routeRules: {
        '/pt': { isr: 60 },
        '/es': { redirect: '/en' },
        '/proxy': { proxy: 'https://example.test/proxy' },
        '/assets/**': { headers: { 'cache-control': 'max-age=3600' } }
      }
    }
  })
  const initial = initialRoutes(routes)
  const isr = destination({ routes, pathname: '/pt' })
  assert.equal(isr?.dest, '/pt-isr?__isr_route=$__isr_route')
  assert.ok(isr.src)
  assert.equal(new RegExp(isr.src, 'u').exec('/pt')?.groups?.[ISR_ROUTE], '/pt')
  assert.equal(destination({ routes, pathname: '/en' })?.dest, '/en')
  assert.equal(
    destination({ routes, pathname: '/es' })?.headers?.Location,
    '/en'
  )
  assert.equal(
    destination({ routes, pathname: '/proxy' })?.dest,
    'https://example.test/proxy'
  )
  const guarded = initial.indexOf(isr)
  const header = initial.findIndex(
    route => route.headers?.['x-page'] === 'home'
  )
  const skew = initial.findIndex(route =>
    route.headers?.['Set-Cookie']?.startsWith('__vdpl=')
  )
  assert.ok(header !== NOT_FOUND && skew !== NOT_FOUND)
  assert.ok(guarded > header && guarded > skew)
  for (const pathname of ['/pt/index.md', '/en/index.md', '/outside']) {
    assert.equal(destination({ routes, pathname }), undefined, pathname)
  }
})

it('recusa rotas terminais que impedem a proteção de páginas no preset real', async context => {
  for (const src of ['/pt', '/pt/', '/(.*)']) {
    await assert.rejects(
      fixture({
        context,
        config: {
          vercel: {
            config: {
              version: 3,
              routes: [{ src, headers: { 'x-page': 'home' } }]
            }
          }
        }
      }),
      /Vercel route ends before Markdown page protection/u
    )
  }
})

it('mantém os headers de routeRules antes da proteção sem encerrar o roteamento', async context => {
  for (const pattern of ['/pt', '/pt/', '/**']) {
    const { routes } = await fixture({
      context,
      config: { routeRules: { [pattern]: { headers: { 'x-page': 'home' } } } }
    })
    const header = initialRoutes(routes).find(
      route => route.headers?.['x-page'] === 'home'
    )
    assert.equal(header?.continue, true, pattern)
    assert.equal(
      destination({ routes, pathname: '/pt' })?.dest,
      '/__server',
      pattern
    )
  }
})

it('preserva a raiz e capturas de ISR para diretórios codificados e aninhados', async context => {
  const { routes } = await fixture({
    context,
    paths: [
      '/index.md',
      '/pt/caf%C3%A9/index.md',
      '/pt/50%25/index.md',
      '/pt/v1.0/index/index.md'
    ],
    config: { routeRules: { '/': { isr: 30 }, '/pt/**': { isr: 60 } } }
  })
  assert.equal(
    destination({ routes, pathname: '/' })?.dest,
    '/index-isr?__isr_route=$__isr_route'
  )
  assert.equal(destination({ routes, pathname: '//' }), undefined)
  for (const pathname of ['/pt/caf%C3%A9', '/pt/50%25', '/pt/v1.0/index']) {
    for (const requestPath of [pathname, `${pathname}/`]) {
      const route = destination({ routes, pathname: requestPath })
      assert.equal(route?.dest, '/pt/[...]-isr?__isr_route=$__isr_route')
      assert.ok(route.src)
      assert.equal(
        new RegExp(route.src, 'u').exec(requestPath)?.groups?.[ISR_ROUTE],
        requestPath
      )
    }
    assert.equal(
      destination({ routes, pathname: `${pathname}/index.md` }),
      undefined
    )
  }
  assert.equal(destination({ routes, pathname: '/pt/v1x0/index' }), undefined)
})
