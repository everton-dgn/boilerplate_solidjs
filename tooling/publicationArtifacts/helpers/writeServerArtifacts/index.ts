import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import nodePath from 'node:path'

import {
  digestBytes,
  digestFile
} from '../../../markdownPrerender/helpers/artifactDigest/index.ts'
import type { ArtifactDigest } from '../../../markdownPrerender/types.ts'
import {
  PUBLICATION_ARTIFACT_DIR,
  SITEMAP_ARTIFACT_VERSION,
  SITEMAP_IDENTITIES_FILE,
  SITEMAP_MANIFEST_FILE,
  SITEMAP_MANIFEST_MAX_BYTES
} from '../../constants.ts'
import type { SitemapInventory } from '../../types.ts'

type ServerArtifactsOptions = {
  serverDir: string
  inventory: SitemapInventory
  identities?: Uint8Array
  partDigests: readonly ArtifactDigest[]
}
type ManifestOptions = Omit<ServerArtifactsOptions, 'serverDir'>
type PublishOptions = { directory: string; name: string; bytes: Uint8Array }

const encoder = new TextEncoder()

function buildManifest({
  inventory,
  identities,
  partDigests
}: ManifestOptions): string {
  const {
    buildId,
    siteUrl,
    byteBudget,
    hasLegacySources,
    hasPartitionSources
  } = inventory
  const identityDigest = identities && digestBytes(identities)
  const generation = createHash('sha256')
    .update(
      JSON.stringify({
        version: SITEMAP_ARTIFACT_VERSION,
        buildId,
        siteUrl,
        byteBudget,
        hasLegacySources,
        hasPartitionSources,
        parts: partDigests.map(({ hash }) => hash),
        identities: identityDigest?.hash
      })
    )
    .digest('hex')
  return JSON.stringify({
    version: SITEMAP_ARTIFACT_VERSION,
    buildId,
    generation,
    siteUrl,
    byteBudget,
    pagePartCount: partDigests.length,
    partBytes: partDigests.map(({ size }) => size),
    isRootStatic:
      !hasLegacySources && !hasPartitionSources && partDigests.length > 0,
    hasLegacySources,
    hasPartitionSources,
    identities: identityDigest
      ? {
          file: SITEMAP_IDENTITIES_FILE,
          bytes: identityDigest.size,
          sha256: identityDigest.hash
        }
      : null
  })
}

// Promove o arquivo completo e confere o que ficou no diretório final.
async function publishFile({
  directory,
  name,
  bytes
}: PublishOptions): Promise<void> {
  const workDir = await mkdtemp(nodePath.join(directory, '.artifact-'))
  try {
    const temporary = nodePath.join(workDir, name)
    await writeFile(temporary, bytes, { flag: 'wx' })
    await rename(temporary, nodePath.join(directory, name))
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
  const expected = digestBytes(bytes)
  const actual = await digestFile(nodePath.join(directory, name))
  if (actual.size !== expected.size || actual.hash !== expected.hash) {
    throw new Error(`Server artifact differs after writing: ${name}`)
  }
}

// O manifesto entra por último: ele referencia as identidades pelo hash, e a
// função recusa o conjunto se qualquer metade faltar ou divergir.
export async function writeServerArtifacts({
  serverDir,
  ...options
}: ServerArtifactsOptions): Promise<void> {
  const manifest = encoder.encode(buildManifest(options))
  if (manifest.byteLength > SITEMAP_MANIFEST_MAX_BYTES) {
    throw new Error(
      `Sitemap manifest has ${manifest.byteLength} bytes, above the ${SITEMAP_MANIFEST_MAX_BYTES} byte budget`
    )
  }
  const directory = nodePath.join(serverDir, PUBLICATION_ARTIFACT_DIR)
  await mkdir(directory, { recursive: true })
  const { identities } = options
  if (identities) {
    await publishFile({
      directory,
      name: SITEMAP_IDENTITIES_FILE,
      bytes: identities
    })
  }
  await publishFile({
    directory,
    name: SITEMAP_MANIFEST_FILE,
    bytes: manifest
  })
}
