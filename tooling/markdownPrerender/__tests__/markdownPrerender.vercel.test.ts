import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it, type TestContext } from 'node:test'

import { createNitro } from 'nitro/builder'
import type { NitroConfig } from 'nitro/types'
import * as v from 'valibot'

import {
  LLMS_DESCRIBEDBY_LINK,
  LLMS_FULL_PATH
} from '../../../src/constants/llms.ts'
import { MARKDOWN_PRERENDER_PATH } from '../../../src/middleware/markdownContent/constants.ts'
import { SITEMAP_INVENTORY_PATH } from '../../publicationArtifacts/constants.ts'
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
const OverridesSchema = v.record(v.string(), v.looseObject({}))
const ConfigSchema = v.looseObject({
  routes: v.array(RouteSchema),
  overrides: v.optional(OverridesSchema)
})
const BUILD_ID = 'build-under-test'
const SITE_URL = 'https://example.com/'
const MARKDOWN_TYPE = 'text/markdown; charset=utf-8'

type FixtureOptions = {
  context: TestContext
  config?: NitroConfig
  paths?: string[]
  llms?: string
}
type Route = v.InferOutput<typeof RouteSchema>
type MatchOptions = { routes: Route[]; pathname: string }

async function fixture({
  context,
  config,
  paths = ['/pt/index.md'],
  llms
}: FixtureOptions) {
  const root = await mkdtemp(path.join(tmpdir(), 'markdown-vercel-'))
  const creation = createNitro({
    rootDir: root,
    preset: 'vercel',
    compatibilityDate: '2026-10-20',
    logLevel: 0,
    modules: [markdownPrerender({ buildId: BUILD_ID })],
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
  const list = JSON.stringify({
    siteUrl: SITE_URL,
    baseLocale: 'pt',
    paths,
    baseLocalePaths: paths,
    mismatches: []
  })
  await nitro.hooks.callHook(
    'prerender:generate',
    { route: MARKDOWN_PRERENDER_PATH, contents: list },
    nitro
  )
  await nitro.hooks.callHook(
    'prerender:generate',
    {
      route: SITEMAP_INVENTORY_PATH,
      contents: JSON.stringify({
        version: 1,
        buildId: BUILD_ID,
        siteUrl: SITE_URL,
        byteBudget: 4_194_304,
        pagePartCount: 0,
        hasArraySources: false,
        hasPartitionSources: false,
        identities: null
      })
    },
    nitro
  )
  // Com o índice, o fixture percorre também a gravação e a conferência dos
  // arquivos estáticos, como o prerender real.
  if (llms !== undefined) {
    const { publicDir } = nitro.options.output
    const listFile = path.join(publicDir, MARKDOWN_PRERENDER_PATH)
    await mkdir(path.dirname(listFile), { recursive: true })
    await writeFile(listFile, list)
    await writeFile(path.join(publicDir, 'llms.txt'), llms)
    for (const route of paths) {
      const file = path.join(publicDir, decodeURI(route))
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, `# ${route}`)
      await nitro.hooks.callHook(
        'prerender:generate',
        {
          route: decodeURI(route),
          fileName: decodeURI(route),
          contentType: MARKDOWN_TYPE,
          contents: `# ${route}`
        },
        nitro
      )
    }
    await nitro.hooks.callHook(
      'prerender:generate',
      { route: '/llms.txt', contents: llms },
      nitro
    )
    await nitro.hooks.callHook('prerender:done', {
      prerenderedRoutes: paths.map(route => ({
        route: decodeURI(route),
        fileName: decodeURI(route)
      })),
      failedRoutes: []
    })
  }
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

it('grava o manifesto ao lado do bundle da função do preset real', async context => {
  const { nitro } = await fixture({ context, llms: '# Site\n' })
  const contents = await readFile(
    path.join(
      nitro.options.output.dir,
      'functions/__server.func/publication/sitemap-manifest.json'
    ),
    'utf8'
  )
  assert.match(contents, /"pagePartCount":0/u)
  assert.match(contents, new RegExp(`"buildId":"${BUILD_ID}"`, 'u'))
  assert.equal(path.basename(nitro.options.output.serverDir), '__server.func')
})

it('anexa o Link aos .md e tipa o llms-full.txt no config.json do preset real', async context => {
  const full = new URL(LLMS_FULL_PATH, SITE_URL).href
  const { nitro, routes } = await fixture({
    context,
    paths: ['/pt/index.md', '/pt/about.md'],
    llms: `# Site\n\n## Pages\n\n- [Home](${SITE_URL}pt/index.md)\n- [Full](${full})\n`,
    config: { routeRules: { '/assets/**': { headers: { 'x-asset': 'yes' } } } }
  })
  const initial = initialRoutes(routes)
  const describedby = initial.filter(
    route => route.headers?.link === LLMS_DESCRIBEDBY_LINK
  )
  assert.equal(describedby.length, 1)
  const [route] = describedby
  assert.ok(route?.src)
  assert.equal(route.continue, true)
  const pattern = new RegExp(route.src, 'u')
  for (const pathname of ['/pt/index.md', '/pt/about.md', LLMS_FULL_PATH]) {
    assert.equal(pattern.test(pathname), true, pathname)
  }
  for (const pathname of ['/pt', '/pt/about', '/llms.txt', '/assets/a.js']) {
    assert.equal(pattern.test(pathname), false, pathname)
  }
  const file = path.join(nitro.options.output.dir, 'config.json')
  const output = v.parse(ConfigSchema, JSON.parse(await readFile(file, 'utf8')))
  assert.deepEqual(output.overrides?.['llms-full.txt'], {
    contentType: MARKDOWN_TYPE
  })
  const body = await readFile(
    path.join(nitro.options.output.publicDir, 'llms-full.txt'),
    'utf8'
  )
  assert.ok(
    body.includes(
      `\nSource: ${SITE_URL}pt/index.md\nBytes: 14\n\n# /pt/index.md\n`
    )
  )
  assert.equal(body.includes('/pt/about.md'), false)
  // O Link não chega às páginas HTML protegidas.
  assert.equal(destination({ routes, pathname: '/pt' })?.dest, '/__server')
})
