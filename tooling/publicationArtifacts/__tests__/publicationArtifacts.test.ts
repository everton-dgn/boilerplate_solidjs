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
  PUBLICATION_ARTIFACT_DIR,
  SITEMAP_IDENTITIES_FILE,
  SITEMAP_IDENTITIES_MAX_BYTES,
  SITEMAP_MANIFEST_FILE,
  SITEMAP_MANIFEST_MAX_BYTES
} from '../../../src/constants/publication.ts'
import { SITEMAP_INVENTORY_PATH } from '../constants.ts'
import { createPublicationBuild } from '../helpers/createPublicationBuild/index.ts'
import { writeServerArtifacts } from '../helpers/writeServerArtifacts/index.ts'
import { publicationArtifacts } from '../index.ts'
import type { SitemapInventory } from '../types.ts'

type Paths = { publicDir: string; serverDir: string }
type Publication = ReturnType<typeof publicationArtifacts>
type Published = { publication: Publication; queue: Set<string> } & Paths
type PublicFile = { publicDir: string; route: string }
type GenerateOptions = {
  publication: Publication
  route: PrerenderRoute
  queue?: Set<string>
}

const SITE_URL = 'https://example.com/'
const XML = '<?xml version="1.0"?><urlset/>\n'
const XML_TYPE = 'application/xml; charset=utf-8'
const BYTE_BUDGET = 1024
const BUILD_ID = 'build-under-test'
const SHA256_LENGTH = 64
const ManifestSchema = v.looseObject({ generation: v.string() })
const InventorySchema = v.object({
  version: v.number(),
  buildId: v.string(),
  siteUrl: v.string(),
  byteBudget: v.number(),
  pagePartCount: v.number(),
  hasArraySources: v.boolean(),
  hasPartitionSources: v.boolean(),
  identities: v.null()
})

function inventory(overrides: Partial<SitemapInventory> = {}): string {
  return JSON.stringify({
    version: 1,
    buildId: BUILD_ID,
    siteUrl: SITE_URL,
    byteBudget: BYTE_BUDGET,
    pagePartCount: 2,
    hasArraySources: false,
    hasPartitionSources: false,
    identities: null,
    ...overrides
  } satisfies SitemapInventory)
}

function xmlRoute(route: string, contents = XML): PrerenderRoute {
  return { route, fileName: route, contentType: XML_TYPE, contents }
}

async function paths(): Promise<Paths> {
  const dir = await mkdtemp(path.join(tmpdir(), 'publication-artifacts-'))
  after(() => rm(dir, { recursive: true, force: true }))
  const publicDir = path.join(dir, 'static')
  const serverDir = path.join(dir, 'functions', '__server.func')
  await mkdir(publicDir)
  return { publicDir, serverDir }
}

function generate({ publication, route, queue }: GenerateOptions): boolean {
  return publication.inspect({ route, queue })
}

async function writePublic({ publicDir, route }: PublicFile): Promise<void> {
  const file = path.join(publicDir, route)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, XML)
}

// Prerender completo: inventário, XML aprovado e arquivos no diretório público.
async function publish(
  overrides: Partial<SitemapInventory> = {}
): Promise<Published> {
  const { publicDir, serverDir } = await paths()
  const publication = publicationArtifacts({ buildId: BUILD_ID })
  const queue = new Set<string>()
  const route: PrerenderRoute = {
    route: SITEMAP_INVENTORY_PATH,
    contents: inventory(overrides)
  }
  generate({ publication, route, queue })
  assert.equal(route.error, undefined)
  for (const xml of queue) {
    generate({ publication, route: xmlRoute(xml), queue })
    await writePublic({ publicDir, route: xml })
  }
  return { publication, queue, publicDir, serverDir }
}

function registered({ queue }: Pick<Published, 'queue'>): PrerenderRoute[] {
  return [...queue].map(route => ({ route, fileName: route }))
}

function readManifest({ serverDir }: Pick<Paths, 'serverDir'>) {
  return readFile(
    path.join(serverDir, PUBLICATION_ARTIFACT_DIR, SITEMAP_MANIFEST_FILE),
    'utf8'
  )
}

it('publica partes e raiz estática sem fonte em array nem particionada', async () => {
  const published = await publish()
  assert.deepEqual(
    [...published.queue],
    ['/sitemaps/pages/1.xml', '/sitemaps/pages/2.xml', '/sitemap.xml']
  )
  await published.publication.assertPublished({
    publicDir: published.publicDir,
    prerenderedRoutes: registered(published)
  })
  await published.publication.writeServer(published.serverDir)
  const { generation, ...manifest } = v.parse(
    ManifestSchema,
    JSON.parse(await readManifest(published))
  )
  assert.match(generation, /^[a-f0-9]{64}$/u)
  assert.deepEqual(manifest, {
    version: 1,
    buildId: BUILD_ID,
    siteUrl: SITE_URL,
    byteBudget: BYTE_BUDGET,
    pagePartCount: 2,
    partBytes: [XML.length, XML.length],
    isRootStatic: true,
    hasArraySources: false,
    hasPartitionSources: false,
    identities: null
  })
  const files = await readdir(
    path.join(published.serverDir, PUBLICATION_ARTIFACT_DIR)
  )
  assert.deepEqual(files, [SITEMAP_MANIFEST_FILE])
})

for (const dynamic of [
  { hasArraySources: true, identities: { urls: ['u'], entries: [] } },
  { hasPartitionSources: true }
]) {
  it(`mantém a raiz na função com ${Object.keys(dynamic)[0]}`, async () => {
    const { queue } = await publish(dynamic)
    assert.deepEqual(
      [...queue],
      ['/sitemaps/pages/1.xml', '/sitemaps/pages/2.xml']
    )
  })
}

it('não publica raiz nem partes sem páginas', async () => {
  const { queue } = await publish({ pagePartCount: 0 })
  assert.equal(queue.size, 0)
})

it('não grava o inventário e recusa formas inválidas', () => {
  const route: PrerenderRoute = {
    route: SITEMAP_INVENTORY_PATH,
    contents: inventory()
  }
  const queue = new Set<string>()
  assert.equal(
    generate({
      publication: publicationArtifacts({ buildId: BUILD_ID }),
      route,
      queue
    }),
    true
  )
  assert.equal(route.skip, true)
  for (const contents of [
    'not json',
    inventory({ version: 2 }),
    inventory({ hasArraySources: true }),
    inventory({ identities: { urls: [], entries: [] } })
  ]) {
    const invalid: PrerenderRoute = { route: SITEMAP_INVENTORY_PATH, contents }
    generate({
      publication: publicationArtifacts({ buildId: BUILD_ID }),
      route: invalid,
      queue
    })
    assert.equal(invalid.error?.message, 'Invalid sitemap inventory')
  }
})

it('reprova o build quando o SSR carrega outro identificador', () => {
  for (const [contents, message] of [
    [inventory({ buildId: 'other-build' }), 'another build'],
    [inventory({ buildId: '' }), 'Invalid sitemap inventory']
  ] as const) {
    const route: PrerenderRoute = { route: SITEMAP_INVENTORY_PATH, contents }
    const queue = new Set<string>()
    generate({
      publication: publicationArtifacts({ buildId: BUILD_ID }),
      route,
      queue
    })
    assert.match(route.error?.message ?? '', new RegExp(message, 'u'))
    assert.equal(queue.size, 0)
  }
})

it('reprova o build sem SSR identificado', () => {
  const contents = JSON.stringify({
    version: 1,
    siteUrl: SITE_URL,
    byteBudget: BYTE_BUDGET,
    pagePartCount: 0,
    hasArraySources: false,
    hasPartitionSources: false,
    identities: null
  })
  const route: PrerenderRoute = { route: SITEMAP_INVENTORY_PATH, contents }
  generate({
    publication: publicationArtifacts({ buildId: BUILD_ID }),
    route,
    queue: new Set()
  })
  assert.equal(route.error?.message, 'Invalid sitemap inventory')
})

it('gera identificador distinto por build e o entrega ao SSR pelo define', () => {
  const first = createPublicationBuild()
  const second = createPublicationBuild()
  assert.notEqual(first.buildId, second.buildId)
  assert.deepEqual(first.plugin.config().define, {
    'import.meta.env.PUBLICATION_BUILD_ID': JSON.stringify(first.buildId)
  })
})

it('falha no build quando as identidades excedem o orçamento', () => {
  const route: PrerenderRoute = {
    route: SITEMAP_INVENTORY_PATH,
    contents: inventory({
      hasArraySources: true,
      identities: {
        urls: ['x'.repeat(SITEMAP_IDENTITIES_MAX_BYTES)],
        entries: []
      }
    })
  }
  const queue = new Set<string>()
  generate({
    publication: publicationArtifacts({ buildId: BUILD_ID }),
    route,
    queue
  })
  assert.match(route.error?.message ?? '', /above the \d+ byte budget/u)
  assert.equal(queue.size, 0)
})

it('recusa XML no caminho, tipo, tamanho ou formato errados', async () => {
  const { publication, queue } = await publish()
  const part = '/sitemaps/pages/1.xml'
  const cases: [PrerenderRoute, RegExp][] = [
    [{ ...xmlRoute(part), fileName: `${part}.html` }, /written as/u],
    [{ ...xmlRoute(part), contentType: 'text/html' }, /content type/u],
    [xmlRoute(part, `<?xml${'x'.repeat(BYTE_BUDGET)}`), /byte budget/u],
    [xmlRoute(part, '<html></html>'), /not an XML document/u]
  ]
  for (const [route, problem] of cases) {
    generate({ publication, route, queue })
    assert.match(route.error?.message ?? '', problem)
  }
})

it('não interfere em rotas fora do inventário', async () => {
  const { publication, queue } = await publish({ pagePartCount: 1 })
  const route = xmlRoute('/sitemaps/array.xml')
  const original = { ...route }
  assert.equal(generate({ publication, route, queue }), false)
  assert.deepEqual(route, original)
})

it('falha sem inventário, sem reconstruir nada', async () => {
  const { publicDir } = await paths()
  await assert.rejects(
    publicationArtifacts({ buildId: BUILD_ID }).assertPublished({
      publicDir,
      prerenderedRoutes: []
    }),
    { message: 'Sitemap inventory was not prerendered' }
  )
})

it('confronta o diretório publicado com os bytes aprovados', async () => {
  const published = await publish()
  const { publication, publicDir } = published
  const prerenderedRoutes = registered(published)
  const assertOutput = () =>
    publication.assertPublished({ publicDir, prerenderedRoutes })
  await writeFile(path.join(publicDir, 'sitemaps/pages/1.xml'), `${XML} `)
  await assert.rejects(assertOutput, /content differs/u)
  await writeFile(path.join(publicDir, 'sitemaps/pages/1.xml'), XML)
  await rm(path.join(publicDir, 'sitemaps/pages/2.xml'))
  await assert.rejects(assertOutput, /sitemaps\/pages\/2\.xml \(not generated/u)
  await writePublic({ publicDir, route: '/sitemaps/pages/2.xml' })
  await writePublic({ publicDir, route: '/sitemaps/array.xml' })
  await assert.rejects(assertOutput, /array\.xml \(would shadow/u)
  await rm(path.join(publicDir, 'sitemaps/array.xml'))
  await assert.doesNotReject(assertOutput)
})

it('recusa arquivo do diretório público que sombreia a raiz dinâmica', async () => {
  const published = await publish({ hasPartitionSources: true })
  await writePublic({ publicDir: published.publicDir, route: '/sitemap.xml' })
  await assert.rejects(
    published.publication.assertPublished({
      publicDir: published.publicDir,
      prerenderedRoutes: registered(published)
    }),
    /\/sitemap\.xml \(would shadow/u
  )
})

it('recusa link simbólico entre as partes', async () => {
  const published = await publish({ pagePartCount: 1 })
  const { publicDir } = published
  await symlink(
    path.join(publicDir, 'sitemaps/pages/1.xml'),
    path.join(publicDir, 'sitemaps/pages/2.xml')
  )
  await assert.rejects(
    published.publication.assertPublished({
      publicDir,
      prerenderedRoutes: registered(published)
    }),
    /2\.xml \(not a regular file\)/u
  )
})

it('exige o registro do Nitro além do arquivo', async () => {
  const published = await publish()
  await assert.rejects(
    published.publication.assertPublished({
      publicDir: published.publicDir,
      prerenderedRoutes: []
    }),
    /not generated by the prerender/u
  )
})

it('aprova conteúdo arbitrário pelo digest e aplica o teto quando pedido', async () => {
  const { publication, publicDir, queue } = await publish({ pagePartCount: 0 })
  const route: PrerenderRoute = { route: '/llms.txt', contents: '# Site' }
  publication.approve({ route, maxBytes: '# Site'.length })
  assert.equal(route.error, undefined)
  await assert.rejects(
    publication.assertPublished({
      publicDir,
      prerenderedRoutes: registered({ queue })
    }),
    /\/llms\.txt \(missing/u
  )
  const oversized: PrerenderRoute = { route: '/llms.txt', contents: '# Site' }
  publication.approve({ route: oversized, maxBytes: 1 })
  assert.match(oversized.error?.message ?? '', /above the 1 byte budget/u)
})

it('referencia as identidades pelo hash e não deixa temporários', async () => {
  const identities = { urls: ['https://example.com/en/a'], entries: [] }
  const published = await publish({ hasArraySources: true, identities })
  await published.publication.assertPublished({
    publicDir: published.publicDir,
    prerenderedRoutes: registered(published)
  })
  await published.publication.writeServer(published.serverDir)
  const directory = path.join(published.serverDir, PUBLICATION_ARTIFACT_DIR)
  const files = await readdir(directory)
  assert.deepEqual(files.toSorted(), [
    SITEMAP_IDENTITIES_FILE,
    SITEMAP_MANIFEST_FILE
  ])
  const text = await readManifest(published)
  assert.equal(
    await readFile(path.join(directory, SITEMAP_IDENTITIES_FILE), 'utf8'),
    JSON.stringify(identities)
  )
  assert.match(text, /"isRootStatic":false/u)
  assert.match(text, /"sha256":"[a-f0-9]{64}"/u)
})

it('falha no build quando o manifesto excede o orçamento', async () => {
  const { serverDir } = await paths()
  const digest = { size: 1, hash: 'a'.repeat(SHA256_LENGTH) }
  const inventoryData = v.parse(InventorySchema, JSON.parse(inventory()))
  const partDigests = Array.from(
    { length: SITEMAP_MANIFEST_MAX_BYTES },
    () => digest
  )
  await assert.rejects(
    writeServerArtifacts({
      serverDir,
      inventory: inventoryData,
      partDigests
    }),
    /Sitemap manifest has \d+ bytes/u
  )
  await assert.rejects(readManifest({ serverDir }), { code: 'ENOENT' })
})

it('não grava artefatos da função sem a conferência do diretório público', async () => {
  const published = await publish()
  await published.publication.writeServer(published.serverDir)
  await assert.rejects(readManifest(published), { code: 'ENOENT' })
})

it('a instância do prerender não tem artefatos para gravar', async () => {
  const { serverDir } = await paths()
  await publicationArtifacts({ buildId: BUILD_ID }).writeServer(serverDir)
  await assert.rejects(readManifest({ serverDir }), { code: 'ENOENT' })
})
