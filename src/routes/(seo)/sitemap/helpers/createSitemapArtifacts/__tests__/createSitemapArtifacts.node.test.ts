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
const SCHEMA_FAILURE = /^Invalid |^Inconsistent manifest$/u
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
    hasArraySources: false,
    hasPartitionSources: false,
    identities: null,
    ...overrides
  }
}

function arrayManifest(
  identities: Partial<NonNullable<Manifest['identities']>> = {}
): Manifest {
  return manifest({
    isRootStatic: false,
    hasArraySources: true,
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

// The stat declares a size, and the read delivers what the file holds afterwards.
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

describe('bounded read of the sitemap artifacts', () => {
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

  it('returns a valid manifest and identities, once per instance', async () => {
    const directory = await writeManifest(JSON.stringify(arrayManifest()))
    await writeFile(path.join(directory, SITEMAP_IDENTITIES_FILE), IDENTITIES)
    const artifacts = createSitemapArtifacts()
    const { urls } = await artifacts.readIdentities()
    expect([...urls]).toStrictEqual(['https://a.test/en'])
    await artifacts.readIdentities()
    await artifacts.readManifest()
    expect(open).toHaveBeenCalledTimes(['manifest', 'identities'].length)
  })

  it('refuses a manifest above the limit without reading the content', async () => {
    const directory = await writeManifest('')
    await truncate(
      path.join(directory, SITEMAP_MANIFEST_FILE),
      SITEMAP_MANIFEST_MAX_BYTES + 1
    )
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      'Artifact over the limit'
    )
  })

  it('does not allocate beyond the stat when the file grows during the read', async () => {
    const { handle, read } = await useChangingFile([STATED_SIZE, 1])
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      'Artifact changed on read'
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

  it('refuses a file that shrinks during the read', async () => {
    const { handle } = await useChangingFile([STATED_SIZE - 1])
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      'Artifact changed on read'
    )
    expect(handle.fd).toBe(-1)
  })

  it('refuses a symbolic link in place of the manifest', async () => {
    const directory = await artifactDirectory()
    const target = path.join(directory, 'target.json')
    await writeFile(target, JSON.stringify(manifest()))
    await symlink(target, path.join(directory, SITEMAP_MANIFEST_FILE))
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      /ELOOP|EMLINK/u
    )
  })

  it.each([
    { name: 'invalid JSON', contents: '{', failure: /JSON/u },
    {
      name: 'invalid UTF-8',
      contents: Buffer.from('7bff7d', 'hex'),
      failure: /encoded data was not valid/u
    }
  ])('refuses a manifest with $name', async ({ contents, failure }) => {
    const directory = await artifactDirectory()
    await writeFile(path.join(directory, SITEMAP_MANIFEST_FILE), contents)
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      failure
    )
  })

  it.each([
    { name: 'unsafe count', edit: { pagePartCount: UNSAFE_INTEGER } },
    { name: 'negative count', edit: { pagePartCount: -1 } },
    { name: 'fractional count', edit: { pagePartCount: FRACTION } },
    {
      name: 'more parts than the index accepts',
      edit: { pagePartCount: SITEMAP_URL_LIMIT + 1 }
    },
    { name: 'zero budget', edit: { byteBudget: 0 } },
    {
      name: 'budget above the protocol',
      edit: { byteBudget: SITEMAP_BYTE_LIMIT + 1 }
    },
    { name: 'missing parts', edit: { partBytes: [PART_BYTES] } },
    { name: 'empty part', edit: { partBytes: [PART_BYTES, 0] } },
    {
      name: 'part above the budget',
      edit: { partBytes: [PART_BYTES, BYTE_BUDGET + 1] }
    },
    {
      name: 'static root with an array source',
      edit: { hasArraySources: true }
    },
    { name: 'dynamic root without sources', edit: { isRootStatic: false } },
    { name: 'missing build', edit: { buildId: '' } },
    { name: 'long build', edit: { buildId: 'x'.repeat(BUILD_ID_LIMIT + 1) } }
  ])('refuses a manifest with $name', async ({ edit }) => {
    await writeManifest(JSON.stringify(manifest(edit)))
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      SCHEMA_FAILURE
    )
  })

  it.each([
    { name: 'arbitrary path', edit: { file: '../../secret.json' } },
    { name: 'another name', edit: { file: 'other.json' } },
    {
      name: 'size above the budget',
      edit: { bytes: SITEMAP_IDENTITIES_MAX_BYTES + 1 }
    },
    { name: 'unsafe size', edit: { bytes: UNSAFE_INTEGER } },
    { name: 'zero size', edit: { bytes: 0 } },
    { name: 'malformed hash', edit: { sha256: 'x' } }
  ])('refuses identities with $name without opening them', async ({ edit }) => {
    await writeManifest(JSON.stringify(arrayManifest(edit)))
    await expect(createSitemapArtifacts().readIdentities()).rejects.toThrow(
      SCHEMA_FAILURE
    )
    expect(open).toHaveBeenCalledOnce()
  })

  it('refuses an array source without a reference to the identities', async () => {
    await writeManifest(
      JSON.stringify({ ...arrayManifest(), identities: null })
    )
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      'Inconsistent manifest'
    )
  })

  it('refuses identities larger than declared before loading them', async () => {
    const directory = await writeManifest(JSON.stringify(arrayManifest()))
    const file = path.join(directory, SITEMAP_IDENTITIES_FILE)
    await writeFile(file, IDENTITIES)
    await truncate(file, SITEMAP_IDENTITIES_MAX_BYTES + 1)
    await expect(createSitemapArtifacts().readIdentities()).rejects.toThrow(
      'Artifact over the limit'
    )
  })

  it('refuses smaller, swapped or corrupted identities', async () => {
    const corrupted = 'not json'
    const cases = [
      {
        contents: IDENTITIES.slice(1),
        edit: {},
        failure: 'Identities from another generation'
      },
      {
        contents: IDENTITIES.replace('/en', '/pt'),
        edit: {},
        failure: 'Identities from another generation'
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
      const directory = await writeManifest(JSON.stringify(arrayManifest(edit)))
      await writeFile(path.join(directory, SITEMAP_IDENTITIES_FILE), contents)
      await expect(createSitemapArtifacts().readIdentities()).rejects.toThrow(
        failure
      )
    }
  })

  it('compares the build with the value of the bundle, never with the one of the manifest', async () => {
    await writeManifest(JSON.stringify(manifest({ buildId: 'other-build' })))
    await expect(createSitemapArtifacts().readManifest()).rejects.toThrow(
      'Manifest from another build'
    )
    vi.stubEnv('PUBLICATION_BUILD_ID', 'other-build')
    await expect(
      createSitemapArtifacts().readManifest()
    ).resolves.toMatchObject({ buildId: 'other-build' })
  })

  it('does not keep the failure: a later request reads again', async () => {
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
