import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { locales } from '@paraglide/runtime.js'

import type { SitemapEntry, SitemapPartitionSource } from '@/@types/sitemap.ts'
import { HTTP_NOT_FOUND, HTTP_OK } from '@/constants/http.ts'
import {
  PUBLICATION_ARTIFACT_DIR,
  SITEMAP_IDENTITIES_FILE,
  SITEMAP_MANIFEST_FILE
} from '@/constants/publication.ts'
import type { PublicationOptions } from '@/infra/server/publication/types.ts'

// oxlint-disable-next-line eslint/no-restricted-imports -- Contrato real entre o escritor do build e o leitor da função.
import { writeServerArtifacts } from '../../../../../../../tooling/publicationArtifacts/helpers/writeServerArtifacts/index.ts'
import { SITEMAP_BYTE_LIMIT, SITEMAP_URL_LIMIT } from '../../../constants.ts'
import type { SitemapManifest, SitemapRouteContext } from '../../../types.ts'
import { buildSitemap } from '../../buildSitemap/index.ts'
import { createSitemapArtifacts } from '../../createSitemapArtifacts/index.ts'
import { matchSitemapRoute } from '../../matchSitemapRoute/index.ts'
import { sitemapUrl } from '../../normalizeSitemapEntries/index.ts'
import {
  buildSitemapIndexResponse,
  buildSitemapPartResponse
} from '../index.ts'
import type { ServiceOptions } from '../types.ts'

vi.mock(import('@/infra/server/publication/index.ts'), async importOriginal => {
  const actual = await importOriginal()
  const limits = {
    total: 1,
    sitemap: 1,
    markdown: 1,
    sources: 4,
    perSource: 4,
    outputs: 1,
    reservedBytes: 52_428_800
  }
  return {
    ...actual,
    runPublication: (options: PublicationOptions) =>
      actual.createPublicationController(limits).runPublication(options)
  }
})

type ArtifactOptions = {
  buildId?: string
  parts?: number
  hasArraySources?: boolean
  hasPartitionSources?: boolean
  pages?: readonly SitemapEntry[]
  byteBudget?: number
}
type IdentityBytesOptions = {
  pages: readonly SitemapEntry[]
  hasUnion: boolean
}
type RuntimeOptions = {
  manifest?: Partial<SitemapManifest>
  sources?: readonly SitemapPartitionSource[]
  byteBudget?: number
}

const HTTP_SERVICE_UNAVAILABLE = 503
const siteUrl = 'https://example.com/'
const { signal } = new AbortController()
const BYTE_BUDGET = 4_194_304
const BUILD_ID = 'build-under-test'
const SHA256_LENGTH = 64
const DIGEST = { size: 100, hash: 'a'.repeat(SHA256_LENGTH) }
const staticEntry = { path: '/blog/static', lastmod: '2026-01-01' }
const arrayEntry = { path: '/blog/array' }
const matchRoute = matchSitemapRoute([
  { path: '/blog/:slug', page: true },
  { path: '/blog/static', page: true }
])
const encoder = new TextEncoder()
const directories: string[] = []

async function artifactDirectory(): Promise<string> {
  const serverDir = await mkdtemp(path.join(tmpdir(), 'sitemap-artifacts-'))
  directories.push(serverDir)
  vi.stubGlobal(
    '__nitro_main__',
    pathToFileURL(path.join(serverDir, 'index.mjs')).href
  )
  return serverDir
}

function identityBytes({ pages, hasUnion }: IdentityBytesOptions): Uint8Array {
  const urls = pages.map(({ path: page }) =>
    sitemapUrl({ path: page, siteUrl })
  )
  const entries = hasUnion ? pages : []
  return encoder.encode(JSON.stringify({ urls, entries }))
}

async function writeArtifacts({
  buildId = BUILD_ID,
  parts = 2,
  hasArraySources = false,
  hasPartitionSources = false,
  pages = [staticEntry],
  byteBudget = BYTE_BUDGET
}: ArtifactOptions = {}): Promise<string> {
  const serverDir = await artifactDirectory()
  await writeServerArtifacts({
    serverDir,
    inventory: {
      version: 1,
      buildId,
      siteUrl,
      byteBudget,
      pagePartCount: parts,
      hasArraySources,
      hasPartitionSources,
      identities: null
    },
    identities: hasArraySources
      ? identityBytes({ pages, hasUnion: parts <= 1 })
      : undefined,
    partDigests: Array.from({ length: parts }, () => DIGEST)
  })
  return path.join(serverDir, PUBLICATION_ARTIFACT_DIR)
}

function runtime({
  manifest = {},
  sources = [],
  byteBudget = BYTE_BUDGET
}: RuntimeOptions = {}) {
  const readRoutes = vi.fn<() => SitemapRouteContext>(() => ({
    manifest: {
      entries: [],
      sources: [],
      dynamicRoutes: [{ path: '/blog/:slug', isIndexable: true }],
      ...manifest
    },
    matchRoute
  }))
  return {
    artifacts: createSitemapArtifacts(),
    readRoutes,
    sources,
    siteUrl,
    signal,
    byteBudget
  }
}

async function readIndex(options: ServiceOptions): Promise<string> {
  const response = await buildSitemapIndexResponse(options)
  return response.text()
}

function withArraySource(read: () => SitemapEntry[]): Partial<SitemapManifest> {
  return { sources: [read], sourceRoutes: ['/blog/:slug'] }
}

function source(
  overrides: Partial<SitemapPartitionSource> = {}
): SitemapPartitionSource {
  return {
    id: 'catalog',
    routePath: '/blog/:slug',
    listPartitions: () => Promise.resolve(['a']),
    readPartition: () => Promise.resolve([{ path: '/blog/a' }]),
    ...overrides
  }
}

function prepare(): void {
  vi.stubEnv('DEV', false)
  vi.stubEnv('PUBLICATION_BUILD_ID', BUILD_ID)
  vi.spyOn(console, 'error').mockReturnValue()
}

async function restore(): Promise<void> {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await Promise.all(
    directories
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true }))
  )
}

describe('sitemap servido por artefatos', () => {
  beforeEach(prepare)
  afterEach(restore)

  it('leitura estática usa só o manifesto, sem rotas nem identidades', async () => {
    await writeArtifacts()
    const options = runtime()
    const part = { ...options, kind: 'pages' as const }
    const absent = await buildSitemapPartResponse({ ...part, part: '3' })
    expect({
      status: absent.status,
      cacheControl: absent.headers.get('cache-control')
    }).toStrictEqual({ status: HTTP_NOT_FOUND, cacheControl: 'no-store' })
    const reached = await buildSitemapPartResponse({ ...part, part: '1' })
    expect(reached.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    const root = await buildSitemapIndexResponse(options)
    expect(root.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    const missingArray = await buildSitemapPartResponse({
      ...options,
      kind: 'array',
      part: 'array'
    })
    expect(missingArray.status).toBe(HTTP_NOT_FOUND)
    expect(options.readRoutes).not.toHaveBeenCalled()
  })

  it('mantém 404 sem páginas e sem fontes', async () => {
    await writeArtifacts({ parts: 0 })
    const options = runtime()
    const response = await buildSitemapIndexResponse(options)
    expect(response.status).toBe(HTTP_NOT_FOUND)
    expect(options.readRoutes).not.toHaveBeenCalled()
  })

  it.each(['other-build', 'missing'])(
    'refuses a direct dynamic part with %s artifacts before loading routes or source data',
    async buildId => {
      const directory = await writeArtifacts({
        buildId,
        hasPartitionSources: true
      })
      if (buildId === 'missing') {
        await rm(path.join(directory, SITEMAP_MANIFEST_FILE))
      }
      const readPartition = vi.fn<SitemapPartitionSource['readPartition']>(() =>
        Promise.resolve([{ path: '/blog/a' }])
      )
      const options = runtime({ sources: [source({ readPartition })] })
      const response = await buildSitemapPartResponse({
        ...options,
        kind: 'source',
        source: 'catalog',
        part: 'a'
      })
      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
      expect(response.headers.get('cache-control')).toBe('no-store')
      await expect(response.text()).resolves.toBe('')
      expect(options.readRoutes).not.toHaveBeenCalled()
      expect(readPartition).not.toHaveBeenCalled()
    }
  )

  it('índice misto usa referências prontas e fontes por requisição', async () => {
    await writeArtifacts({ parts: 3, hasPartitionSources: true })
    let partitions = ['a']
    const selected = source({
      listPartitions: () => Promise.resolve(partitions)
    })
    const options = runtime({ sources: [selected] })
    const first = await readIndex(options)
    expect(first).toContain('/sitemaps/pages/3.xml')
    expect(first).toContain('/sitemaps/catalog/a.xml')
    expect(first).not.toContain('/sitemaps/pages/4.xml')
    partitions = ['b']
    const second = await readIndex(options)
    expect(second).toContain('/sitemaps/catalog/b.xml')
  })

  it('une uma parte à fonte em array, muda por pedido e carrega identidades uma vez', async () => {
    const directory = await writeArtifacts({
      parts: 1,
      hasArraySources: true
    })
    let current = [{ path: '/blog/array' }]
    const options = runtime({ manifest: withArraySource(() => current) })
    const first = await readIndex(options)
    expect(first).toContain('<urlset')
    expect(first).toContain('/blog/static</loc><lastmod>2026-01-01')
    expect(first).toContain('/blog/array')
    await rm(path.join(directory, SITEMAP_IDENTITIES_FILE))
    current = [{ path: '/blog/other' }]
    const second = await readIndex(options)
    expect(second).toContain('/blog/other')
    expect(second).not.toContain('/blog/array')
  })

  it('duplicata de fonte em array preserva os metadados estáticos', async () => {
    await writeArtifacts({ parts: 1, hasArraySources: true })
    const options = runtime({
      manifest: withArraySource(() => [
        { path: `/pt${staticEntry.path}`, lastmod: '2026-02-02' },
        arrayEntry
      ])
    })
    const xml = await readIndex(options)
    expect(xml.match(/<lastmod>[^<]*<\/lastmod>/gu)).toStrictEqual(
      locales.map(() => '<lastmod>2026-01-01</lastmod>')
    )
  })

  it('decide urlset ou índice pelos bytes exatos da união', async () => {
    const exact = encoder.encode(
      buildSitemap({ entries: [staticEntry, arrayEntry], siteUrl })
    ).byteLength
    for (const { byteBudget, expected, absent } of [
      { byteBudget: exact, expected: '<urlset', absent: '<sitemapindex' },
      { byteBudget: exact - 1, expected: '<sitemapindex', absent: '<urlset' }
    ]) {
      await writeArtifacts({
        parts: 1,
        hasArraySources: true,
        byteBudget
      })
      const options = runtime({
        manifest: withArraySource(() => [arrayEntry]),
        byteBudget
      })
      const response = await buildSitemapIndexResponse(options)
      expect(response.status).toBe(HTTP_OK)
      const xml = await response.text()
      expect(xml).toContain(expected)
      expect(xml).not.toContain(absent)
    }
  })

  it(
    'decide urlset ou índice pela contagem exata da união',
    { timeout: 30_000 },
    async () => {
      const limit = Math.floor(SITEMAP_URL_LIMIT / locales.length)
      const pages = Array.from({ length: limit - 1 }, (_, index) => ({
        path: `/page-${index}`
      }))
      const byteBudget = SITEMAP_BYTE_LIMIT
      await writeArtifacts({
        parts: 1,
        hasArraySources: true,
        pages,
        byteBudget
      })
      const within = await readIndex(
        runtime({ manifest: withArraySource(() => [arrayEntry]), byteBudget })
      )
      expect(within).toContain('<urlset')
      const above = await readIndex(
        runtime({
          manifest: withArraySource(() => [
            arrayEntry,
            { path: '/blog/other' }
          ]),
          byteBudget
        })
      )
      expect(above).toContain('<sitemapindex')
    }
  )

  it('fonte em array vazia não publica parte e omite a referência', async () => {
    await writeArtifacts({ parts: 2, hasArraySources: true })
    const options = runtime({ manifest: withArraySource(() => []) })
    const xml = await readIndex(options)
    expect(xml).toContain('/sitemaps/pages/2.xml')
    expect(xml).not.toContain('/sitemaps/array.xml')
    const part = await buildSitemapPartResponse({
      ...options,
      kind: 'array',
      part: 'array'
    })
    expect(part.status).toBe(HTTP_NOT_FOUND)
  })

  it('fonte em array vazia sem páginas continua 404', async () => {
    await writeArtifacts({ parts: 0, hasArraySources: true, pages: [] })
    const options = runtime({ manifest: withArraySource(() => []) })
    const response = await buildSitemapIndexResponse(options)
    expect(response.status).toBe(HTTP_NOT_FOUND)
  })
})

describe('artefatos ausentes ou de outra geração', () => {
  beforeEach(prepare)
  afterEach(restore)

  it('falha pequeno com manifesto ausente e se recupera sem cache de falha', async () => {
    const directory = await writeArtifacts()
    const manifestFile = path.join(directory, SITEMAP_MANIFEST_FILE)
    const contents = await readFile(manifestFile)
    await rm(manifestFile)
    const options = runtime()
    const part = { ...options, kind: 'pages' as const, part: '9' }
    const missing = await buildSitemapPartResponse(part)
    expect({
      status: missing.status,
      cacheControl: missing.headers.get('cache-control'),
      body: await missing.text()
    }).toStrictEqual({
      status: HTTP_SERVICE_UNAVAILABLE,
      cacheControl: 'no-store',
      body: ''
    })
    expect(options.readRoutes).not.toHaveBeenCalled()
    await writeFile(manifestFile, contents)
    const recovered = await buildSitemapPartResponse(part)
    expect(recovered.status).toBe(HTTP_NOT_FOUND)
  })

  it.each([
    { name: 'JSON inválido', edit: () => 'not json' },
    {
      name: 'contagem incompleta',
      edit: (text: string) =>
        text.replace('"pagePartCount":2', '"pagePartCount":3')
    },
    {
      name: 'outro site',
      edit: (text: string) => text.replace(siteUrl, 'https://other.example/')
    },
    {
      name: 'outro orçamento',
      edit: (text: string) =>
        text.replace(`"byteBudget":${BYTE_BUDGET}`, '"byteBudget":1')
    },
    {
      name: 'versão desconhecida',
      edit: (text: string) => text.replace('"version":1', '"version":2')
    }
  ])('recusa manifesto com $name', async ({ edit }) => {
    const directory = await writeArtifacts()
    const file = path.join(directory, SITEMAP_MANIFEST_FILE)
    await writeFile(file, edit(await readFile(file, 'utf8')))
    const options = runtime()
    const response = await buildSitemapPartResponse({
      ...options,
      kind: 'pages',
      part: '9'
    })
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    expect(options.readRoutes).not.toHaveBeenCalled()
  })

  it('recusa manifesto e identidades coerentes de outro build', async () => {
    const pages = [staticEntry]
    await writeArtifacts({
      buildId: 'other-build',
      parts: 1,
      hasArraySources: true,
      pages
    })
    const read = vi.fn<() => SitemapEntry[]>(() => [arrayEntry])
    const options = runtime({ manifest: withArraySource(read) })
    const response = await buildSitemapIndexResponse(options)
    expect({
      status: response.status,
      cacheControl: response.headers.get('cache-control'),
      body: await response.text()
    }).toStrictEqual({
      status: HTTP_SERVICE_UNAVAILABLE,
      cacheControl: 'no-store',
      body: ''
    })
    expect(read).not.toHaveBeenCalled()
    expect(options.readRoutes).not.toHaveBeenCalled()
  })

  it('recusa artefatos válidos num bundle sem identificador', async () => {
    await writeArtifacts()
    vi.stubEnv('PUBLICATION_BUILD_ID', '')
    const options = runtime()
    const response = await buildSitemapPartResponse({
      ...options,
      kind: 'pages',
      part: '9'
    })
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
  })

  it('não registra caminho nem detalhe da falha de leitura', async () => {
    const directory = await writeArtifacts()
    await rm(path.join(directory, SITEMAP_MANIFEST_FILE))
    await buildSitemapPartResponse({
      ...runtime(),
      kind: 'pages',
      part: '9'
    })
    const logged = vi.mocked(console.error).mock.calls.flat().join('\n')
    expect(logged).toContain('[sitemap] Unexpected failure')
    expect(logged).not.toContain(directory)
    expect(logged).not.toContain('ENOENT')
  })

  it('recusa raiz de um manifesto com outro registro de fontes', async () => {
    await writeArtifacts({ parts: 2 })
    const listPartitions = vi.fn<SitemapPartitionSource['listPartitions']>()
    const response = await buildSitemapIndexResponse(
      runtime({ sources: [source({ listPartitions })] })
    )
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    expect(listPartitions).not.toHaveBeenCalled()
  })

  it('recusa identidades alteradas, ausentes e sem referência', async () => {
    const directory = await writeArtifacts({
      parts: 1,
      hasArraySources: true
    })
    const file = path.join(directory, SITEMAP_IDENTITIES_FILE)
    const read = vi.fn<() => SitemapEntry[]>(() => [arrayEntry])
    await writeFile(file, '{"urls":[],"entries":[]}')
    const changed = await buildSitemapIndexResponse(
      runtime({ manifest: withArraySource(read) })
    )
    expect(changed.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    await rm(file)
    const missing = await buildSitemapIndexResponse(
      runtime({ manifest: withArraySource(read) })
    )
    expect(missing.status).toBe(HTTP_SERVICE_UNAVAILABLE)
    expect(read).not.toHaveBeenCalled()
    await writeArtifacts({ parts: 1 })
    const unreferenced = await buildSitemapPartResponse({
      ...runtime({ manifest: withArraySource(read) }),
      kind: 'array',
      part: 'array'
    })
    expect(unreferenced.status).toBe(HTTP_NOT_FOUND)
  })

  it('falha explicitamente sem o diretório da função', async () => {
    await writeArtifacts()
    vi.stubGlobal('__nitro_main__', null)
    const response = await buildSitemapPartResponse({
      ...runtime(),
      kind: 'pages',
      part: '9'
    })
    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE)
  })
})
