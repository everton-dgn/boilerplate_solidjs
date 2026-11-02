import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  open,
  rm,
  symlink,
  truncate,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  PUBLICATION_ARTIFACT_DIR,
  SITEMAP_IDENTITIES_FILE,
  SITEMAP_IDENTITIES_MAX_BYTES,
  SITEMAP_MANIFEST_FILE,
  SITEMAP_MANIFEST_MAX_BYTES
} from '@/constants/publication.ts'

import { SITEMAP_BYTE_LIMIT, SITEMAP_URL_LIMIT } from '../../../constants.ts'
import type { SitemapArtifactManifest } from '../../../types.ts'
import { createSitemapArtifacts } from '../index.ts'

type Manifest = Omit<SitemapArtifactManifest, 'identities'> & {
  identities: Partial<NonNullable<SitemapArtifactManifest['identities']>> | null
}
type FileSystemModule = { open: typeof open }

vi.mock(import('node:fs/promises'), async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, open: vi.fn<typeof actual.open>(actual.open) }
})

const { open: actualOpen } =
  await vi.importActual<Pick<FileSystemModule, 'open'>>('node:fs/promises')

const BUILD_ID = 'build-under-test'
const SHA256_LENGTH = 64
const SHA256 = 'a'.repeat(SHA256_LENGTH)
const BYTE_BUDGET = 1024
const PART_BYTES = 100
const STATED_SIZE = 10
const UNSAFE_INTEGER = Number.MAX_SAFE_INTEGER + 1
const FRACTION = 1.5
const BUILD_ID_LIMIT = 64
const SCHEMA_FAILURE = /^Invalid |^Manifesto incoerente$/u
const IDENTITIES = JSON.stringify({ urls: ['https://a.test/en'], entries: [] })
const directories: string[] = []

function manifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    version: 1,
    buildId: BUILD_ID,
    generation: SHA256,
    siteUrl: 'https://a.test/',
    byteBudget: BYTE_BUDGET,
    pagePartCount: 2,
    partBytes: [PART_BYTES, PART_BYTES],
    isRootStatic: true,
    hasLegacySources: false,
    hasPartitionSources: false,
    identities: null,
    ...overrides
  }
}

function legacyManifest(
  identities: Partial<NonNullable<Manifest['identities']>> = {}
): Manifest {
  return manifest({
    isRootStatic: false,
    hasLegacySources: true,
    identities: {
      file: SITEMAP_IDENTITIES_FILE,
      bytes: new TextEncoder().encode(IDENTITIES).byteLength,
      sha256: createHash('sha256').update(IDENTITIES).digest('hex'),
      ...identities
    }
  })
}

async function artifactDirectory(): Promise<string> {
  const serverDir = await mkdtemp(path.join(tmpdir(), 'sitemap-reader-'))
  directories.push(serverDir)
  vi.stubGlobal(
    '__nitro_main__',
    pathToFileURL(path.join(serverDir, 'index.mjs')).href
  )
  const directory = path.join(serverDir, PUBLICATION_ARTIFACT_DIR)
  await mkdir(directory)
  return directory
}

async function writeManifest(contents: string): Promise<string> {
  const directory = await artifactDirectory()
  await writeFile(path.join(directory, SITEMAP_MANIFEST_FILE), contents)
  return directory
}

// O stat declara um tamanho, e a leitura entrega o que o arquivo tem depois.
async function useChangingFile(chunks: readonly number[]) {
  const directory = await artifactDirectory()
  const file = path.join(directory, SITEMAP_MANIFEST_FILE)
  await writeFile(file, '')
  const handle = await actualOpen(file)
  const stats = await handle.stat()
  vi.spyOn(handle, 'stat').mockResolvedValue(
    Object.assign(stats, { size: STATED_SIZE })
  )
  const read = vi.spyOn(handle, 'read')
  for (const bytesRead of chunks) {
    read.mockResolvedValueOnce({ bytesRead, buffer: new Uint8Array() })
  }
  read.mockResolvedValue({ bytesRead: 0, buffer: new Uint8Array() })
  vi.mocked(open).mockResolvedValueOnce(handle)
  return { handle, read }
}

describe('leitura limitada dos artefatos do sitemap', () => {
  beforeEach(() => {
    vi.stubEnv('PUBLICATION_BUILD_ID', BUILD_ID)
  })

  afterEach(async () => {
    vi.mocked(open).mockClear()
    vi.unstubAllGlobals()
    await Promise.all(
      directories
        .splice(0)
        .map(directory => rm(directory, { recursive: true, force: true }))
    )
  })

  it('devolve manifesto e identidades válidos, uma vez por instância', async () => {
    const directory = await writeManifest(JSON.stringify(legacyManifest()))
    await writeFile(path.join(directory, SITEMAP_IDENTITIES_FILE), IDENTITIES)
    const artifacts = createSitemapArtifacts()
    const { urls } = await artifacts.readIdentities()
    expect([...urls]).toStrictEqual(['https://a.test/en'])
    await artifacts.readIdentities()
    await artifacts.readManifest()
    expect(open).toHaveBeenCalledTimes(['manifest', 'identities'].length)
  })

  it('recusa manifesto acima do teto sem ler o conteúdo', async () => {
    const directory = await writeManifest('')
    await truncate(
      path.join(directory, SITEMAP_MANIFEST_FILE),
      SITEMAP_MANIFEST_MAX_BYTES + 1
    )
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      'Artefato acima do limite'
    )
  })

  it('não aloca além do stat quando o arquivo cresce durante a leitura', async () => {
    const { handle, read } = await useChangingFile([STATED_SIZE, 1])
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      'Artefato alterado na leitura'
    )
    expect(read.mock.calls[0]?.[0]).toHaveLength(STATED_SIZE + 1)
    expect(read).toHaveBeenLastCalledWith(
      expect.any(Uint8Array),
      STATED_SIZE,
      1,
      null
    )
    expect(handle.fd).toBe(-1)
  })

  it('recusa arquivo que encolhe durante a leitura', async () => {
    const { handle } = await useChangingFile([STATED_SIZE - 1])
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      'Artefato alterado na leitura'
    )
    expect(handle.fd).toBe(-1)
  })

  it('recusa link simbólico no lugar do manifesto', async () => {
    const directory = await artifactDirectory()
    const target = path.join(directory, 'target.json')
    await writeFile(target, JSON.stringify(manifest()))
    await symlink(target, path.join(directory, SITEMAP_MANIFEST_FILE))
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      /ELOOP|EMLINK/u
    )
  })

  it.each([
    { name: 'JSON inválido', contents: '{', failure: /JSON/u },
    {
      name: 'UTF-8 inválido',
      contents: Buffer.from('7bff7d', 'hex'),
      failure: /encoded data was not valid/u
    }
  ])('recusa manifesto com $name', async ({ contents, failure }) => {
    const directory = await artifactDirectory()
    await writeFile(path.join(directory, SITEMAP_MANIFEST_FILE), contents)
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      failure
    )
  })

  it.each([
    { name: 'contagem insegura', edit: { pagePartCount: UNSAFE_INTEGER } },
    { name: 'contagem negativa', edit: { pagePartCount: -1 } },
    { name: 'contagem fracionária', edit: { pagePartCount: FRACTION } },
    {
      name: 'mais partes que o índice aceita',
      edit: { pagePartCount: SITEMAP_URL_LIMIT + 1 }
    },
    { name: 'orçamento zero', edit: { byteBudget: 0 } },
    {
      name: 'orçamento acima do protocolo',
      edit: { byteBudget: SITEMAP_BYTE_LIMIT + 1 }
    },
    { name: 'partes faltando', edit: { partBytes: [PART_BYTES] } },
    { name: 'parte vazia', edit: { partBytes: [PART_BYTES, 0] } },
    {
      name: 'parte acima do orçamento',
      edit: { partBytes: [PART_BYTES, BYTE_BUDGET + 1] }
    },
    { name: 'raiz estática com legado', edit: { hasLegacySources: true } },
    { name: 'raiz dinâmica sem fontes', edit: { isRootStatic: false } },
    { name: 'build ausente', edit: { buildId: '' } },
    { name: 'build longo', edit: { buildId: 'x'.repeat(BUILD_ID_LIMIT + 1) } }
  ])('recusa manifesto com $name', async ({ edit }) => {
    await writeManifest(JSON.stringify(manifest(edit)))
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      SCHEMA_FAILURE
    )
  })

  it.each([
    { name: 'caminho arbitrário', edit: { file: '../../secret.json' } },
    { name: 'outro nome', edit: { file: 'other.json' } },
    {
      name: 'tamanho acima do orçamento',
      edit: { bytes: SITEMAP_IDENTITIES_MAX_BYTES + 1 }
    },
    { name: 'tamanho inseguro', edit: { bytes: UNSAFE_INTEGER } },
    { name: 'tamanho zero', edit: { bytes: 0 } },
    { name: 'hash malformado', edit: { sha256: 'x' } }
  ])('recusa identidades com $name sem abri-las', async ({ edit }) => {
    await writeManifest(JSON.stringify(legacyManifest(edit)))
    await expect(createSitemapArtifacts().readIdentities()).rejects.toThrow(
      SCHEMA_FAILURE
    )
    expect(open).toHaveBeenCalledOnce()
  })

  it('recusa legado sem referência às identidades', async () => {
    await writeManifest(
      JSON.stringify({ ...legacyManifest(), identities: null })
    )
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      'Manifesto incoerente'
    )
  })

  it('recusa identidades maiores que o declarado antes de carregá-las', async () => {
    const directory = await writeManifest(JSON.stringify(legacyManifest()))
    const file = path.join(directory, SITEMAP_IDENTITIES_FILE)
    await writeFile(file, IDENTITIES)
    await truncate(file, SITEMAP_IDENTITIES_MAX_BYTES + 1)
    await expect(createSitemapArtifacts().readIdentities()).rejects.toThrow(
      'Artefato acima do limite'
    )
  })

  it('recusa identidades menores, trocadas ou corrompidas', async () => {
    const corrupted = 'not json'
    const cases = [
      {
        contents: IDENTITIES.slice(1),
        edit: {},
        failure: 'Identidades de outra geração'
      },
      {
        contents: IDENTITIES.replace('/en', '/pt'),
        edit: {},
        failure: 'Identidades de outra geração'
      },
      {
        contents: corrupted,
        edit: {
          bytes: corrupted.length,
          sha256: createHash('sha256').update(corrupted).digest('hex')
        },
        failure: 'JSON'
      }
    ]
    for (const { contents, edit, failure } of cases) {
      const directory = await writeManifest(
        JSON.stringify(legacyManifest(edit))
      )
      await writeFile(path.join(directory, SITEMAP_IDENTITIES_FILE), contents)
      await expect(createSitemapArtifacts().readIdentities()).rejects.toThrow(
        failure
      )
    }
  })

  it('compara o build com o valor do bundle, nunca com o do manifesto', async () => {
    await writeManifest(JSON.stringify(manifest({ buildId: 'other-build' })))
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      'Manifesto de outro build'
    )
    vi.stubEnv('PUBLICATION_BUILD_ID', 'other-build')
    await expect(
      createSitemapArtifacts().readManifest()
    ).resolves.toMatchObject({ buildId: 'other-build' })
  })

  it('não guarda a falha: um pedido seguinte volta a ler', async () => {
    const directory = await writeManifest('{')
    const artifacts = createSitemapArtifacts()
    await expect(artifacts.readManifest()).rejects.toThrow('JSON')
    await writeFile(
      path.join(directory, SITEMAP_MANIFEST_FILE),
      JSON.stringify(manifest())
    )
    await expect(artifacts.readManifest()).resolves.toMatchObject({
      pagePartCount: 2
    })
  })
})
