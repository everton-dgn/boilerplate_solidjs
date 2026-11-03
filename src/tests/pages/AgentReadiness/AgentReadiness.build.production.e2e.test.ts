import { access, readdir, readFile } from 'node:fs/promises'
import nodePath from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test, type APIRequestContext } from '@playwright/test'
import * as v from 'valibot'

import { readLlmsIndex } from '@/../tooling/markdownPrerender/helpers/readLlmsIndex/index.ts'
import { LLMS_DESCRIBEDBY_LINK, LLMS_FULL_PATH } from '@/constants/llms.ts'
import {
  PUBLICATION_ARTIFACT_DIR,
  SITEMAP_MANIFEST_FILE
} from '@/constants/publication.ts'
import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'

type Destination = { url: URL; fragments: Set<string> }
type CheckOptions = {
  request: APIRequestContext
  destination: Destination
  staticFiles: Set<string>
}

const HTTP_OK = 200
const HTTP_NOT_FOUND = 404
const SITEMAP_INVENTORY_PATH = '/sitemaps/static.json'
const FETCH_CONCURRENCY = 4
const PRERENDER_HEADERS = { 'x-nitro-prerender': '/_markdown/static.json' }

const LOCALES = ['pt', 'en', 'es']
const PAGES = ['', '/about', '/contact', '/privacy']
const STATIC_OUTPUT = new URL(
  '../../../../.vercel/output/static/',
  import.meta.url
)
const VERCEL_CONFIG = new URL('../../../../vercel.json', import.meta.url)
const BUILD_CONFIG = new URL(
  '../../../../.vercel/output/config.json',
  import.meta.url
)

const SITEMAP_MANIFEST = new URL(
  `../../../../.vercel/output/functions/__server.func/${PUBLICATION_ARTIFACT_DIR}/${SITEMAP_MANIFEST_FILE}`,
  import.meta.url
)
const STATIC_FILES = [
  '/assets/entry.js',
  '/images/og.png',
  '/favicon/favicon.ico',
  '/pt/index.md',
  '/en/about.md',
  '/llms.txt',
  '/llms-full.txt',
  '/sitemap.xml',
  '/sitemaps/pages/1.xml',
  '/_markdown/static.json'
]

const SSR_BUNDLE = new URL(
  '../../../../.vercel/output/functions/__server.func/_ssr/',
  import.meta.url
)

const sitemapManifestSchema = v.looseObject({
  buildId: v.pipe(v.string(), v.nonEmpty()),
  pagePartCount: v.number(),
  partBytes: v.array(v.number()),
  isRootStatic: v.boolean(),
  hasArraySources: v.boolean(),
  hasPartitionSources: v.boolean(),
  identities: v.null()
})
const headerSchema = v.object({ key: v.string(), value: v.string() })
const ruleSchema = v.object({
  source: v.string(),
  headers: v.array(headerSchema)
})
const configSchema = v.object({ headers: v.array(ruleSchema) })
const buildRouteSchema = v.object({
  src: v.optional(v.string()),
  dest: v.optional(v.string()),
  handle: v.optional(v.string()),
  continue: v.optional(v.boolean())
})
const buildConfigSchema = v.object({ routes: v.array(buildRouteSchema) })
const headerRecordSchema = v.record(v.string(), v.string())
const overridesSchema = v.record(v.string(), v.looseObject({}))
const linkRouteSchema = v.looseObject({
  src: v.optional(v.string()),
  handle: v.optional(v.string()),
  continue: v.optional(v.boolean()),
  headers: v.optional(headerRecordSchema)
})
const artifactSchema = v.looseObject({
  routes: v.array(linkRouteSchema),
  overrides: v.optional(overridesSchema)
})
const manifestSchema = v.object({
  siteUrl: v.string(),
  baseLocale: v.string(),
  paths: v.array(v.string()),
  baseLocalePaths: v.array(v.string()),
  mismatches: v.array(v.string())
})
const STATIC_ROOT = fileURLToPath(STATIC_OUTPUT)

// Inventário do diretório publicado, sem depender da lista do build.
async function readStaticFiles(extension: string): Promise<Set<string>> {
  const entries = await readdir(STATIC_ROOT, {
    recursive: true,
    withFileTypes: true
  })
  return new Set(
    entries
      .filter(entry => entry.name.endsWith(extension))
      .map(entry => {
        const file = nodePath.join(entry.parentPath, entry.name)
        const relative = nodePath.relative(STATIC_ROOT, file)
        return `/${relative.split(nodePath.sep).join('/')}`
      })
  )
}

async function hasStaticFile(path: string): Promise<boolean> {
  try {
    await access(new URL(path.slice(1), STATIC_OUTPUT))
    return true
  } catch {
    return false
  }
}

async function readManifest(request: APIRequestContext) {
  const response = await request.get('/_markdown/static.json', {
    headers: PRERENDER_HEADERS,
    maxRedirects: 0
  })
  expect(response.status()).toBe(HTTP_OK)
  return v.parse(manifestSchema, await response.json())
}

async function mapLimit<T>(
  items: readonly T[],
  run: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: FETCH_CONCURRENCY }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await run(item)
    }
  })
  await Promise.all(workers)
}

function pageOf(markdown: string): string {
  const page = markdown.slice(0, -'.md'.length)
  return page.endsWith('/index') ? page.slice(0, -'/index'.length) || '/' : page
}

function decodeUtf8(body: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(body)
}

async function checkDestination({
  request,
  destination,
  staticFiles
}: CheckOptions): Promise<void> {
  const { url, fragments } = destination
  const target = `${url.pathname}${url.search}`
  const response = await request.get(target, { maxRedirects: 0 })
  expect(response.status(), target).toBe(HTTP_OK)
  const body = await response.body()
  const path = decodeURI(url.pathname)
  if (staticFiles.has(path)) {
    const file = await readFile(new URL(path.slice(1), STATIC_OUTPUT))
    expect(body.equals(file), target).toBe(true)
    return
  }
  if (path.endsWith('.md')) {
    expect(response.headers()['content-type'], target).toBe(
      'text/markdown; charset=utf-8'
    )
    expect(decodeUtf8(body).trim(), target).not.toBe('')
    return
  }
  expect(response.headers()['content-type'], target).toContain('text/html')
  const html = body.toString('utf8')
  for (const fragment of fragments) {
    expect(html, `${target}#${fragment}`).toContain(
      `id="${decodeURIComponent(fragment)}"`
    )
  }
}

test.use({ javaScriptEnabled: false })

test('routes HTML home pages before static Markdown directory indexes', async () => {
  const config = v.parse(
    buildConfigSchema,
    JSON.parse(await readFile(BUILD_CONFIG, 'utf8'))
  )
  const filesystem = config.routes.findIndex(
    route => route.handle === 'filesystem'
  )
  expect(filesystem).toBeGreaterThanOrEqual(0)
  const firstPhase = config.routes.findIndex(
    route => route.handle !== undefined
  )
  const routes = config.routes.slice(0, firstPhase)
  for (const locale of LOCALES) {
    for (const pathname of [`/${locale}`, `/${locale}/`]) {
      const route = routes.find(
        candidate =>
          candidate.src !== undefined &&
          !candidate.continue &&
          new RegExp(candidate.src, 'u').test(pathname)
      )
      expect(route?.dest, pathname).toBe('/__server')
    }
    const markdown = `/${locale}/index.md`
    expect(
      routes.some(
        route =>
          route.src !== undefined &&
          !route.continue &&
          new RegExp(route.src, 'u').test(markdown)
      ),
      markdown
    ).toBe(false)
  }
})

test('declares the headers of the static Markdown files', async () => {
  const config = v.parse(
    configSchema,
    JSON.parse(await readFile(VERCEL_CONFIG, 'utf8'))
  )
  const rule = config.headers.find(({ source }) => source === '/(.*).md')
  expect(
    Object.fromEntries(
      rule?.headers.map(({ key, value }) => [key, value]) ?? []
    )
  ).toStrictEqual({ 'Content-Type': 'text/markdown; charset=utf-8' })
  // O tipo do agregado vem do overrides do artefato, que só vale para o
  // arquivo estático; um Content-Type aqui chegaria também ao 404 da função.
  expect(
    config.headers.find(({ source }) => source === LLMS_FULL_PATH)
  ).toBeUndefined()
})

for (const locale of LOCALES) {
  for (const path of PAGES) {
    test(`serves ${locale}${path || '/'} Markdown generated at build time`, async ({
      request,
      page
    }) => {
      const pathname = `/${locale}${path}`
      const href = path ? `${pathname}.md` : `${pathname}/index.md`
      const markdown = await readFile(
        new URL(href.slice(1), STATIC_OUTPUT),
        'utf8'
      )
      const response = await request.get(href, { maxRedirects: 0 })
      expect(await response.text()).toBe(markdown)
      const negotiated = await request.get(pathname, {
        headers: { accept: 'text/markdown' },
        maxRedirects: 0
      })
      expect(negotiated.status()).toBe(HTTP_OK)
      expect(negotiated.headers()['cache-control']).toBe('private, no-store')
      expect(await negotiated.text()).toBe(markdown)
      await page.goto(pathname)
      const main = page.getByRole('main')
      const headings = await main.locator('h1, h2, h3').allTextContents()
      expect(headings.length).toBeGreaterThan(0)
      for (const heading of headings) {
        expect(markdown).toContain(heading.trim())
      }
      const fragments = await main.locator('p').evaluateAll(paragraphs =>
        paragraphs.flatMap(paragraph => {
          const walker = document.createTreeWalker(
            paragraph,
            NodeFilter.SHOW_TEXT
          )
          const texts: string[] = []
          while (walker.nextNode()) {
            const text = walker.currentNode.textContent?.trim()
            if (text) texts.push(text)
          }
          return texts
        })
      )
      expect(fragments.length).toBeGreaterThan(0)
      for (const fragment of fragments) {
        expect(markdown).toContain(fragment)
      }
    })
  }
}

test('publishes exactly the static Markdown files listed by the build', async ({
  request
}) => {
  const manifest = await readManifest(request)
  expect(manifest.mismatches).toStrictEqual([])
  const listed = manifest.paths.map(path => decodeURI(path))
  expect(new Set(listed).size).toBe(listed.length)
  expect([...(await readStaticFiles('.md'))].toSorted()).toStrictEqual(
    listed.toSorted()
  )
  expect([...(await readStaticFiles('.md.html'))]).toStrictEqual([])
  const origin = readSiteOrigin()
  await mapLimit(manifest.paths, async path => {
    const file = await readFile(
      new URL(decodeURI(path).slice(1), STATIC_OUTPUT)
    )
    expect(decodeUtf8(file).trim(), path).not.toBe('')
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(HTTP_OK)
    const served = await response.body()
    expect(served.equals(file), path).toBe(true)
    // O HTML da página anuncia o mesmo arquivo, por outro caminho do código.
    const page = await request.get(pageOf(path), {
      headers: { accept: 'text/html' },
      maxRedirects: 0
    })
    expect(page.status(), path).toBe(HTTP_OK)
    const html = await page.text()
    const links = html.match(/<link\b[^>]*>/giu) ?? []
    expect(
      links.some(
        link =>
          link.includes('rel="alternate"') &&
          link.includes('type="text/markdown"') &&
          link.includes(`href="${origin}${path}"`)
      ),
      path
    ).toBe(true)
  })
})

test('publishes sitemap, llms.txt and the Markdown list as build artifacts', async ({
  request
}) => {
  for (const path of [
    '/sitemap.xml',
    '/sitemaps/pages/1.xml',
    '/llms.txt',
    '/_markdown/static.json'
  ]) {
    expect(await hasStaticFile(path), path).toBe(true)
  }
  expect(await hasStaticFile(SITEMAP_INVENTORY_PATH)).toBe(false)
  expect(await hasStaticFile('/sitemaps/array.xml')).toBe(false)
  const inventory = await request.get(SITEMAP_INVENTORY_PATH, {
    headers: { 'x-nitro-prerender': SITEMAP_INVENTORY_PATH },
    maxRedirects: 0
  })
  expect(inventory.status()).toBe(HTTP_NOT_FOUND)
  const root = await request.get('/sitemap.xml')
  const part = await request.get('/sitemaps/pages/1.xml')
  const body = await part.body()
  expect(await root.body()).toStrictEqual(body)
  const manifest = v.parse(
    sitemapManifestSchema,
    JSON.parse(await readFile(SITEMAP_MANIFEST, 'utf8'))
  )
  expect(manifest).toMatchObject({
    pagePartCount: 1,
    partBytes: [body.byteLength],
    isRootStatic: true,
    hasArraySources: false,
    hasPartitionSources: false,
    identities: null
  })
  // O manifesto só vale para o bundle que carrega o mesmo identificador.
  const chunks = await readdir(SSR_BUNDLE)
  const sources = await Promise.all(
    chunks.map(chunk => readFile(new URL(chunk, SSR_BUNDLE), 'utf8'))
  )
  expect(sources.some(source => source.includes(manifest.buildId))).toBe(true)
  const config = v.parse(
    artifactSchema,
    JSON.parse(await readFile(BUILD_CONFIG, 'utf8'))
  )
  expect(config.overrides?.['llms.txt']).toStrictEqual({
    contentType: 'text/markdown; charset=utf-8'
  })
})

// A Vercel aplica todas as rotas com continue que casam antes do filesystem.
test('declares the security headers of the static files in the Vercel artifact', async () => {
  const config = v.parse(
    artifactSchema,
    JSON.parse(await readFile(BUILD_CONFIG, 'utf8'))
  )
  const filesystem = config.routes.findIndex(
    route => route.handle === 'filesystem'
  )
  const routes = config.routes
    .slice(0, filesystem)
    .filter(route => route.continue && route.src !== undefined)
  const headersOf = (path: string) =>
    Object.fromEntries(
      routes
        .filter(route => new RegExp(route.src ?? '', 'u').test(path))
        .flatMap(route => Object.entries(route.headers ?? {}))
    )
  for (const path of STATIC_FILES) {
    expect(headersOf(path), path).toMatchObject({
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin'
    })
  }
  expect(headersOf('/images/og.png')).toMatchObject({
    'cache-control': 'public, max-age=31536000, immutable'
  })
  expect(headersOf('/pt/about')).not.toHaveProperty('x-content-type-options')
})

test('serves every internal destination of llms.txt without redirects', async ({
  request
}) => {
  const response = await request.get('/llms.txt', { maxRedirects: 0 })
  expect(response.status()).toBe(HTTP_OK)
  const { links } = readLlmsIndex(await response.text())
  expect(links.length).toBeGreaterThan(0)
  const origin = readSiteOrigin()
  const destinations = new Map<string, Destination>()
  for (const { href } of links) {
    const url = new URL(href)
    // Links externos ficam fora: o teste não depende de outros hosts.
    if (url.origin !== origin) continue
    const fragment = url.hash.slice(1)
    url.hash = ''
    const destination = destinations.get(url.href) ?? {
      url,
      fragments: new Set<string>()
    }
    if (fragment) destination.fragments.add(fragment)
    destinations.set(url.href, destination)
  }
  expect(destinations.size).toBeGreaterThan(0)
  const staticFiles = await readStaticFiles('.md')
  if (await hasStaticFile(LLMS_FULL_PATH)) staticFiles.add(LLMS_FULL_PATH)
  await mapLimit([...destinations.values()], destination =>
    checkDestination({ request, destination, staticFiles })
  )
})

test('aggregates in llms-full.txt the static Markdown linked by llms.txt', async ({
  request
}) => {
  const index = await request.get('/llms.txt')
  const { links } = readLlmsIndex(await index.text())
  const origin = readSiteOrigin()
  // Só os arquivos do idioma base entram, pela lista do build e pelo disco.
  const { baseLocalePaths } = await readManifest(request)
  const staticFiles = await readStaticFiles('.md')
  const selectable = new Set(
    baseLocalePaths
      .map(path => decodeURI(path))
      .filter(path => staticFiles.has(path))
  )
  const expected = new Map<string, string>()
  for (const { href } of links) {
    const url = new URL(href)
    url.hash = ''
    const path = decodeURI(url.pathname)
    if (
      url.origin === origin &&
      !url.search &&
      selectable.has(path) &&
      !expected.has(path)
    ) {
      expected.set(path, url.href)
    }
  }
  const announced = links.filter(
    ({ href }) => href === `${origin}${LLMS_FULL_PATH}`
  )
  const file = new URL(LLMS_FULL_PATH.slice(1), STATIC_OUTPUT)
  if (expected.size === 0) {
    expect(announced).toStrictEqual([])
    await expect(readFile(file)).rejects.toThrow()
    return
  }
  expect(announced).toHaveLength(1)
  const aggregate = await readFile(file)
  const served = await request.get(LLMS_FULL_PATH, { maxRedirects: 0 })
  expect(served.status()).toBe(HTTP_OK)
  const servedAggregate = await served.body()
  expect(servedAggregate.equals(aggregate)).toBe(true)
  const text = aggregate.toString('utf8')
  const listed = text
    .slice(text.indexOf('## Documents\n\n'), text.indexOf('\nSource: '))
    .split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => line.slice('- '.length))
  expect(listed).toStrictEqual([...expected.values()])
  // Cada corpo é lido pelo tamanho declarado e comparado byte a byte.
  let offset = Buffer.byteLength(text.slice(0, text.indexOf('\nSource: ')))
  for (const [path, url] of expected) {
    const body = await readFile(new URL(path.slice(1), STATIC_OUTPUT))
    const header = Buffer.from(
      `\nSource: ${url}\nBytes: ${body.byteLength}\n\n`
    )
    expect(
      aggregate.subarray(offset, offset + header.byteLength).equals(header),
      url
    ).toBe(true)
    offset += header.byteLength
    expect(
      aggregate.subarray(offset, offset + body.byteLength).equals(body),
      url
    ).toBe(true)
    offset += body.byteLength
    expect(aggregate.subarray(offset, offset + 1).toString(), url).toBe('\n')
    offset += 1
  }
  expect(offset).toBe(aggregate.byteLength)
})

test('declares the describedby Link for static Markdown in the Vercel artifact', async ({
  request
}) => {
  const config = v.parse(
    artifactSchema,
    JSON.parse(await readFile(BUILD_CONFIG, 'utf8'))
  )
  const filesystem = config.routes.findIndex(
    route => route.handle === 'filesystem'
  )
  const routes = config.routes
    .slice(0, filesystem)
    .filter(route => route.headers?.link === LLMS_DESCRIBEDBY_LINK)
  expect(routes).toHaveLength(1)
  const [route] = routes
  expect(route?.continue).toBe(true)
  const pattern = new RegExp(route?.src ?? '', 'u')
  const { paths } = await readManifest(request)
  for (const path of paths) expect(pattern.test(path), path).toBe(true)
  for (const page of PAGES) {
    expect(pattern.test(`/pt${page}`), page).toBe(false)
  }
  const hasAggregate = await hasStaticFile(LLMS_FULL_PATH)
  expect(pattern.test(LLMS_FULL_PATH)).toBe(hasAggregate)
  expect(config.overrides?.[LLMS_FULL_PATH.slice(1)]).toStrictEqual(
    hasAggregate ? { contentType: 'text/markdown; charset=utf-8' } : undefined
  )
})
