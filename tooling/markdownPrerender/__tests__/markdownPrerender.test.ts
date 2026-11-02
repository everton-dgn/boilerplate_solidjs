import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, it } from 'node:test'

import type { PrerenderRoute } from 'nitro/types'
import * as v from 'valibot'

import {
  LLMS_DESCRIBEDBY_LINK,
  LLMS_FULL_PATH
} from '../../../src/constants/llms.ts'
import { MARKDOWN_PRERENDER_PATH } from '../../../src/middleware/markdownContent/constants.ts'
import { markdownPrerender } from '../index.ts'

type PrerenderResult = {
  prerenderedRoutes: PrerenderRoute[]
  failedRoutes: PrerenderRoute[]
}
type Handlers = {
  'prerender:routes'?: (routes: Set<string>) => void
  'prerender:generate'?: (route: PrerenderRoute) => void
  'prerender:done'?: (result: PrerenderResult) => Promise<void>
  compiled?: () => Promise<void>
}
type Prerender = { routes?: string[]; failOnError?: boolean }
type Config = v.InferOutput<typeof ConfigSchema>
type Route = Config['routes'][number]
type Setup = {
  prerender: Prerender
  handlers: Handlers
  config: Config
  publicDir: string
  outputDir: string
  finish: () => Promise<v.InferOutput<typeof ConfigSchema>>
}
type Listing = {
  handlers: Handlers
  paths: string[]
  baseLocalePaths?: string[]
  mismatches?: string[]
}
type Manifest = Omit<Listing, 'handlers'>
type Publication = {
  setup: Setup
  files: Record<string, string>
  llms: string
}

const NOT_FOUND = -1
const VERCEL_CONFIG_VERSION = 3
const SITE_URL = 'https://example.com/'
const MARKDOWN_TYPE = 'text/markdown; charset=utf-8'
// A regra do Link e a proteção de diretórios ocupam o início da fase inicial.
const ADDED_ROUTES = 2
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

async function setup(): Promise<Setup> {
  const dir = await mkdtemp(path.join(tmpdir(), 'markdown-routing-'))
  after(() => rm(dir, { recursive: true, force: true }))
  const publicDir = path.join(dir, 'static')
  await mkdir(publicDir)
  const prerender: Prerender = { routes: ['/existing'] }
  const handlers: Handlers = {}
  const config: Config = {
    version: 3,
    routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/__server' }]
  }
  markdownPrerender({
    options: { prerender, output: { dir, publicDir } },
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
    publicDir,
    outputDir: dir,
    async finish() {
      const file = path.join(dir, 'config.json')
      await writeFile(file, JSON.stringify(config))
      await handlers.compiled?.()
      return v.parse(ConfigSchema, JSON.parse(await readFile(file, 'utf8')))
    }
  }
}

// Sem idioma explícito, todos os arquivos contam como do idioma base.
function manifest({
  paths,
  baseLocalePaths = paths,
  mismatches = []
}: Manifest): string {
  return JSON.stringify({
    siteUrl: SITE_URL,
    baseLocale: 'en',
    paths,
    baseLocalePaths,
    mismatches
  })
}

function prerenderList({ handlers, ...listing }: Listing): void {
  handlers['prerender:routes']?.(new Set())
  handlers['prerender:generate']?.({
    route: MARKDOWN_PRERENDER_PATH,
    contents: manifest(listing)
  })
}

// O Nitro grava a URL `.md` com o mesmo nome de arquivo da rota decodificada.
function written(routes: string[]): PrerenderResult {
  return {
    prerenderedRoutes: routes.map(route => ({ route, fileName: route })),
    failedRoutes: []
  }
}

function markdownRoute(route: string, contents: string): PrerenderRoute {
  return { route, fileName: route, contentType: MARKDOWN_TYPE, contents }
}

function llmsIndex(links: string[]): string {
  return [
    '# Site',
    '',
    '> Description',
    '',
    '## Pages',
    '',
    ...links.map(link => `- [Page](${new URL(link, SITE_URL).href})`),
    ''
  ].join('\n')
}

// Simula o prerender completo: lista, `.md` gravados no diretório estático e
// llms.txt lido pelo hook.
async function publish({ setup: target, files, llms }: Publication) {
  const paths = Object.keys(files)
  prerenderList({ handlers: target.handlers, paths })
  for (const [route, contents] of Object.entries(files)) {
    const file = path.join(target.publicDir, decodeURI(route))
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, contents)
    const generated = markdownRoute(decodeURI(route), contents)
    target.handlers['prerender:generate']?.(generated)
    assert.equal(generated.error, undefined, route)
  }
  target.handlers['prerender:generate']?.({
    route: '/llms.txt',
    fileName: '/llms.txt',
    contentType: MARKDOWN_TYPE,
    contents: llms
  })
  return target.handlers['prerender:done']?.(
    written(paths.map(route => decodeURI(route)))
  )
}

function guardRoutes(routes: Route[]): Route[] {
  return routes.filter(
    route => route.dest === '/__server' && route.src?.startsWith('^(?=')
  )
}

function isDescribedby(route: Route): boolean {
  return route.headers?.link === LLMS_DESCRIBEDBY_LINK
}

it('registra a lista estática e falha o build em erro de prerender', async () => {
  const { prerender } = await setup()
  assert.deepEqual(prerender, {
    routes: ['/existing', MARKDOWN_PRERENDER_PATH, '/llms.txt'],
    failOnError: true
  })
})

it('enfileira os arquivos listados sem gravar a lista', async () => {
  const { handlers } = await setup()
  const routes = new Set<string>()
  handlers['prerender:routes']?.(routes)
  const route: PrerenderRoute = {
    route: MARKDOWN_PRERENDER_PATH,
    contents: manifest({ paths: ['/en/about.md', '/pt/index.md'] })
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
  // Antes do filesystem, só a regra de cabeçalho do Link alcança os `.md`.
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

it('protege a raiz sem aceitar duas barras', async () => {
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

it('protege índices aninhados sem tratar o caminho como expressão regular', async () => {
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

it('preserva a codificação das URLs ao proteger diretórios', async () => {
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
  assert.ok(routes[1] && isDescribedby(routes[1]))
  assert.equal(routes[firstPhase]?.dest, '/__server')
  assert.deepEqual(routes.slice(firstPhase + 1), existing.slice(1))
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

it('preserva o artefato quando não há index.md, só com o Link dos .md', async () => {
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

it('anexa o Link a toda URL .md antes do filesystem, sem tocar em páginas', async () => {
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

it('não altera o artefato quando não há Markdown estático nem agregado', async () => {
  const { handlers, config, finish } = await setup()
  prerenderList({ handlers, paths: [] })
  assert.deepEqual(await finish(), config)
})

it('marca erro quando a lista não traz só arquivos .md', async () => {
  for (const contents of [
    'not json',
    '["/en/about.md"]',
    '{}',
    manifest({ paths: ['/en/about'] }),
    manifest({ paths: ['/pt/caf%C3%A9.md', '/pt/café.md'] }),
    JSON.stringify({
      siteUrl: 'not a url',
      baseLocale: 'en',
      paths: [],
      mismatches: []
    })
  ]) {
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

it('recusa a lista quando uma página com opt-in estático resolve para outra rota', async () => {
  const { handlers } = await setup()
  const routes = new Set<string>()
  handlers['prerender:routes']?.(routes)
  const route: PrerenderRoute = {
    route: MARKDOWN_PRERENDER_PATH,
    contents: manifest({ paths: ['/en/about.md'], mismatches: ['/en/docs'] })
  }
  handlers['prerender:generate']?.(route)
  assert.equal(routes.size, 0)
  assert.equal(
    route.error?.message,
    'Static Markdown pages resolve to another route: /en/docs'
  )
})

it('não altera as demais rotas nem um .md válido do prerender', async () => {
  const { handlers } = await setup()
  handlers['prerender:routes']?.(new Set())
  for (const route of [
    { route: '/sitemap.xml', contents: '<urlset/>' },
    markdownRoute('/en/about.md', '# About')
  ]) {
    const original = { ...route }
    handlers['prerender:generate']?.(route)
    assert.deepEqual(route, original)
  }
})

it('lê o llms.txt sem gravá-lo, salvo quando outra configuração já o prerenderiza', async () => {
  const { handlers } = await setup()
  const route: PrerenderRoute = { route: '/llms.txt', contents: '# Site' }
  handlers['prerender:generate']?.(route)
  assert.equal(route.skip, true)
  const prerender: Prerender = { routes: ['/llms.txt'] }
  markdownPrerender({
    options: { prerender, output: { dir: '/unused', publicDir: '/unused' } },
    hooks: { hook: () => null }
  })
  assert.deepEqual(prerender.routes, ['/llms.txt', MARKDOWN_PRERENDER_PATH])
})

it('falha o build quando a lista não passa pelo prerender', async () => {
  const { handlers } = await setup()
  handlers['prerender:routes']?.(new Set())
  await assert.rejects(async () => handlers['prerender:done']?.(written([])), {
    message: 'Static Markdown list was not prerendered'
  })
})

it('falha o build quando um .md listado não foi gravado', async () => {
  const { handlers } = await setup()
  prerenderList({ handlers, paths: ['/en/about.md', '/pt/index.md'] })
  await assert.rejects(
    async () => handlers['prerender:done']?.(written(['/en/about.md'])),
    { message: 'Static Markdown not generated: /pt/index.md' }
  )
})

it('aceita os .md gravados com o caminho decodificado pelo Nitro', async () => {
  const target = await setup()
  assert.ok(target.handlers['prerender:done'])
  await assert.doesNotReject(async () =>
    publish({
      setup: target,
      files: { '/en/about.md': '# About', '/pt/caf%C3%A9.md': '# Café' },
      llms: llmsIndex([])
    })
  )
})

it('deixa o failOnError do Nitro relatar as rotas com erro', async () => {
  const { prerender, handlers } = await setup()
  prerenderList({ handlers, paths: ['/en/about.md'] })
  const result: PrerenderResult = {
    prerenderedRoutes: [],
    failedRoutes: [{ route: '/en/about.md', error: { message: '[500]' } }]
  }
  await assert.doesNotReject(async () => handlers['prerender:done']?.(result))
  prerender.failOnError = false
  await assert.rejects(async () => handlers['prerender:done']?.(result), {
    message: 'Static Markdown not generated: /en/about.md'
  })
})

it('marca erro no .md cujo artefato não é Markdown gravado no próprio caminho', async () => {
  const { handlers } = await setup()
  prerenderList({ handlers, paths: ['/en/about.md'] })
  const html = '<!doctype html><html><body>Redirect</body></html>'
  for (const route of [
    { ...markdownRoute('/en/about.md', html), fileName: '/en/about.md.html' },
    { ...markdownRoute('/en/about.md', html), contentType: 'text/html' },
    { route: '/en/about.md', fileName: '/en/about.md', contents: '' }
  ] satisfies PrerenderRoute[]) {
    handlers['prerender:generate']?.(route)
    assert.match(
      route.error?.message ?? '',
      /^Invalid static Markdown \/en\/about\.md: /u
    )
  }
})

it('preserva o erro HTTP registrado pelo Nitro', async () => {
  const { handlers } = await setup()
  const error = { message: '[500] Server Error', status: 500 }
  const route: PrerenderRoute = { route: '/en/about.md', error }
  handlers['prerender:generate']?.(route)
  assert.equal(route.error, error)
})

it('aceita zero opt-in sem gerar o agregado nem regras', async () => {
  const target = await setup()
  await publish({ setup: target, files: {}, llms: llmsIndex(['/en']) })
  assert.deepEqual(await readdir(target.publicDir), [])
  assert.deepEqual(await target.finish(), target.config)
})

it('recusa um agregado residual mesmo sem páginas selecionadas', async () => {
  const target = await setup()
  const aggregate = path.join(target.publicDir, 'llms-full.txt')
  await writeFile(aggregate, 'stale-public-artifact')
  await assert.rejects(
    publish({ setup: target, files: {}, llms: llmsIndex(['/en']) }),
    { message: '/llms-full.txt already exists in the static output' }
  )
  assert.equal(await readFile(aggregate, 'utf8'), 'stale-public-artifact')
})

it('recusa .md fora da lista, .md.html, links simbólicos e arquivos ausentes no diretório publicado', async () => {
  const cases: [string, (publicDir: string) => Promise<void>][] = [
    [
      '/en/extra.md (not in the static Markdown list)',
      dir => writeFile(path.join(dir, 'en', 'extra.md'), '# Extra')
    ],
    [
      '/en/about.md.html (HTML written for a .md URL)',
      dir => writeFile(path.join(dir, 'en', 'about.md.html'), '<html></html>')
    ],
    [
      '/en/link.md (not a regular file)',
      dir =>
        symlink(
          path.join(dir, 'en', 'about.md'),
          path.join(dir, 'en', 'link.md')
        )
    ],
    [
      '/en/about.md (missing from the static output)',
      dir => rm(path.join(dir, 'en', 'about.md'))
    ]
  ]
  for (const [problem, change] of cases) {
    const target = await setup()
    const { handlers, publicDir } = target
    prerenderList({ handlers, paths: ['/en/about.md'] })
    await mkdir(path.join(publicDir, 'en'))
    await writeFile(path.join(publicDir, 'en', 'about.md'), '# About')
    await change(publicDir)
    handlers['prerender:generate']?.({
      route: '/llms.txt',
      contents: llmsIndex([])
    })
    await assert.rejects(
      async () => handlers['prerender:done']?.(written(['/en/about.md'])),
      { message: `Invalid static Markdown output: ${problem}` },
      problem
    )
  }
})

it('recusa um .md gravado pelo prerender fora da lista ou com outro nome de arquivo', async () => {
  const { handlers } = await setup()
  prerenderList({ handlers, paths: ['/en/about.md'] })
  await assert.rejects(
    async () =>
      handlers['prerender:done']?.(written(['/en/about.md', '/en/extra.md'])),
    { message: 'Static Markdown outside the list: /en/extra.md' }
  )
  const result: PrerenderResult = {
    prerenderedRoutes: [
      { route: '/en/about.md', fileName: '/en/about.md.html' }
    ],
    failedRoutes: []
  }
  await assert.rejects(async () => handlers['prerender:done']?.(result), {
    message: 'Static Markdown not generated: /en/about.md'
  })
})

it('falha quando o llms.txt não passa pelo prerender', async () => {
  const { handlers } = await setup()
  prerenderList({ handlers, paths: [] })
  await assert.rejects(async () => handlers['prerender:done']?.(written([])), {
    message: 'llms.txt was not prerendered'
  })
})

it('exige que o anúncio do llms-full.txt coincida com os documentos selecionados', async () => {
  const full = new URL(LLMS_FULL_PATH, SITE_URL).href
  await assert.rejects(
    publish({
      setup: await setup(),
      files: { '/en/about.md': '# About' },
      llms: llmsIndex(['/en/about.md'])
    }),
    {
      message: `llms.txt does not announce ${LLMS_FULL_PATH} for its static Markdown pages`
    }
  )
  await assert.rejects(
    publish({
      setup: await setup(),
      files: { '/en/about.md': '# About' },
      llms: llmsIndex(['/en/contact', full])
    }),
    {
      message: `llms.txt announces ${LLMS_FULL_PATH} without static Markdown pages`
    }
  )
})

it('publica o llms-full.txt com Link e tipo Markdown no artefato da Vercel', async () => {
  const target = await setup()
  const full = new URL(LLMS_FULL_PATH, SITE_URL).href
  await publish({
    setup: target,
    files: { '/en/index.md': '# Home', '/en/about.md': '# About' },
    llms: llmsIndex(['/en/about.md', '/en/index.md', '/en/about.md#team', full])
  })
  const body = await readFile(
    path.join(target.publicDir, 'llms-full.txt'),
    'utf8'
  )
  assert.equal(
    body,
    [
      '# Site',
      '',
      '> Description',
      '',
      `Complete Markdown of 2 static pages linked from ${SITE_URL}llms.txt, in the base language (en) and in index order. Each document starts with a Source line, the URL of its Markdown file, and a Bytes line with the exact UTF-8 length of the body that follows.`,
      '',
      '## Documents',
      '',
      `- ${SITE_URL}en/about.md`,
      `- ${SITE_URL}en/index.md`,
      '',
      `Source: ${SITE_URL}en/about.md`,
      'Bytes: 7',
      '',
      '# About',
      '',
      `Source: ${SITE_URL}en/index.md`,
      'Bytes: 6',
      '',
      '# Home',
      ''
    ].join('\n')
  )
  // O diretório temporário da montagem não sobra ao lado da saída estática.
  assert.deepEqual(await readdir(target.outputDir), ['static'])
  const { routes, overrides } = await target.finish()
  const describedby = routes.find(route => isDescribedby(route))
  const pattern = new RegExp(describedby?.src ?? '', 'u')
  assert.equal(pattern.test(LLMS_FULL_PATH), true)
  assert.equal(pattern.test('/en/about.md'), true)
  assert.equal(pattern.test('/llms.txt'), false)
  assert.deepEqual(overrides?.['llms-full.txt'], { contentType: MARKDOWN_TYPE })
})

it('recusa .md publicado vazio, corrompido ou trocado depois da validação', async () => {
  const approved = { '/en/a.md': '# Page A', '/en/b.md': '# Page B' }
  const cases: [string, Record<string, Uint8Array | string>][] = [
    ['/en/a.md', { '/en/a.md': '' }],
    ['/en/a.md', { '/en/a.md': Buffer.from('2320ff', 'hex') }],
    ['/en/a.md, /en/b.md', { '/en/a.md': '# Page B', '/en/b.md': '# Page A' }]
  ]
  for (const [paths, changes] of cases) {
    const target = await setup()
    const { handlers, publicDir } = target
    prerenderList({ handlers, paths: Object.keys(approved) })
    await mkdir(path.join(publicDir, 'en'))
    for (const [route, contents] of Object.entries(approved)) {
      await writeFile(path.join(publicDir, route), contents)
      const generated = markdownRoute(route, contents)
      handlers['prerender:generate']?.(generated)
      assert.equal(generated.error, undefined)
    }
    for (const [route, contents] of Object.entries(changes)) {
      await writeFile(path.join(publicDir, route), contents)
    }
    handlers['prerender:generate']?.({
      route: '/llms.txt',
      contents: llmsIndex([])
    })
    const problems = paths
      .split(', ')
      .map(route => `${route} (content differs from the approved artifact)`)
    await assert.rejects(
      async () => handlers['prerender:done']?.(written(Object.keys(approved))),
      { message: `Invalid static Markdown output: ${problems.join(', ')}` },
      paths
    )
  }
})

it('recusa .md registrado que não passou pela validação do prerender', async () => {
  const { handlers, publicDir } = await setup()
  prerenderList({ handlers, paths: ['/en/about.md'] })
  await mkdir(path.join(publicDir, 'en'))
  await writeFile(path.join(publicDir, 'en', 'about.md'), '# About')
  handlers['prerender:generate']?.({
    route: '/llms.txt',
    contents: llmsIndex([])
  })
  await assert.rejects(
    async () => handlers['prerender:done']?.(written(['/en/about.md'])),
    {
      message:
        'Invalid static Markdown output: /en/about.md (not validated by the prerender)'
    }
  )
})

it('deixa fora do agregado o .md estático de outro idioma citado pelo índice', async () => {
  const target = await setup()
  const { handlers, publicDir } = target
  const files = { '/en/about.md': '# About', '/pt/sobre.md': '# Sobre' }
  prerenderList({
    handlers,
    paths: Object.keys(files),
    baseLocalePaths: ['/en/about.md']
  })
  for (const [route, contents] of Object.entries(files)) {
    await mkdir(path.join(publicDir, path.dirname(route)), { recursive: true })
    await writeFile(path.join(publicDir, route), contents)
    handlers['prerender:generate']?.(markdownRoute(route, contents))
  }
  const full = new URL(LLMS_FULL_PATH, SITE_URL).href
  handlers['prerender:generate']?.({
    route: '/llms.txt',
    contents: llmsIndex(['/pt/sobre.md', '/en/about.md', full])
  })
  await handlers['prerender:done']?.(written(Object.keys(files)))
  const body = await readFile(path.join(publicDir, 'llms-full.txt'), 'utf8')
  assert.ok(body.includes(`- ${SITE_URL}pt/sobre.md: page in another language`))
  assert.ok(body.includes(`Source: ${SITE_URL}en/about.md\n`))
  assert.equal(body.includes('# Sobre'), false)
})

it('recusa caminhos do idioma base fora da lista', async () => {
  const { handlers } = await setup()
  const route: PrerenderRoute = {
    route: MARKDOWN_PRERENDER_PATH,
    contents: manifest({
      paths: ['/en/about.md'],
      baseLocalePaths: ['/en/x.md']
    })
  }
  handlers['prerender:routes']?.(new Set())
  handlers['prerender:generate']?.(route)
  assert.equal(route.error?.message, 'Invalid static Markdown list')
})
