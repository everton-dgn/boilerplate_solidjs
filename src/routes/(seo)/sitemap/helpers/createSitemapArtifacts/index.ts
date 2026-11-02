/* oxlint-disable import/no-nodejs-modules -- Lê arquivos ao lado do bundle da função, sem alcance do cliente. */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import nodePath from 'node:path'
import { fileURLToPath } from 'node:url'

import * as v from 'valibot'

import {
  PUBLICATION_ARTIFACT_DIR,
  SITEMAP_ARTIFACT_VERSION,
  SITEMAP_IDENTITIES_FILE,
  SITEMAP_IDENTITIES_MAX_BYTES,
  SITEMAP_MANIFEST_FILE,
  SITEMAP_MANIFEST_MAX_BYTES
} from '@/constants/publication.ts'

import { SITEMAP_BYTE_LIMIT, SITEMAP_URL_LIMIT } from '../../constants.ts'
import type {
  SitemapArtifactManifest,
  SitemapArtifacts,
  SitemapIdentities
} from '../../types.ts'

type BoundedReadOptions = { file: string; maxBytes: number }

const BUILD_ID_MAX_LENGTH = 64
// No Windows, O_NOFOLLOW não existe e não altera os flags.
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW
const decoder = new TextDecoder('utf-8', { fatal: true })
const Sha256Schema = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u))
const SafeCountSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const PositiveCountSchema = v.pipe(SafeCountSchema, v.minValue(1))
const IdentityFileSchema = v.object({
  file: v.literal(SITEMAP_IDENTITIES_FILE),
  bytes: v.pipe(PositiveCountSchema, v.maxValue(SITEMAP_IDENTITIES_MAX_BYTES)),
  sha256: Sha256Schema
})
const ManifestSchema = v.object({
  version: v.literal(SITEMAP_ARTIFACT_VERSION),
  buildId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(BUILD_ID_MAX_LENGTH)),
  generation: Sha256Schema,
  siteUrl: v.string(),
  byteBudget: v.pipe(PositiveCountSchema, v.maxValue(SITEMAP_BYTE_LIMIT)),
  pagePartCount: v.pipe(SafeCountSchema, v.maxValue(SITEMAP_URL_LIMIT)),
  partBytes: v.array(PositiveCountSchema),
  isRootStatic: v.boolean(),
  hasArraySources: v.boolean(),
  hasPartitionSources: v.boolean(),
  identities: v.nullable(IdentityFileSchema)
})
const EntrySchema = v.object({
  path: v.string(),
  lastmod: v.optional(v.string())
})
const IdentitiesSchema = v.object({
  urls: v.array(v.string()),
  entries: v.array(EntrySchema)
})

// Sem cache de falha: um artefato ausente continua pequeno e explícito a cada
// pedido, e a instância se recupera se a leitura voltar a funcionar.
function readOnce<T>(read: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined
  const start = async (): Promise<T> => {
    try {
      return await read()
    } catch (error) {
      pending = undefined
      throw error
    }
  }
  return () => {
    pending ??= start()
    return pending
  }
}

// Mesmo critério do Nitro para localizar arquivos ao lado do bundle da função.
function artifactPath(file: string): string {
  const main: unknown = Reflect.get(globalThis, '__nitro_main__')
  if (typeof main !== 'string') {
    throw new TypeError('Diretório da função desconhecido')
  }
  return nodePath.join(
    nodePath.dirname(fileURLToPath(main)),
    PUBLICATION_ARTIFACT_DIR,
    file
  )
}

// O buffer nasce do tamanho conferido, com um byte a mais para notar crescimento:
// o limite vale mesmo se o arquivo mudar entre o stat e a leitura.
async function readBounded({
  file,
  maxBytes
}: BoundedReadOptions): Promise<Uint8Array> {
  const handle = await open(file, READ_FLAGS)
  try {
    const stats = await handle.stat()
    if (!stats.isFile() || stats.size > maxBytes) {
      throw new Error('Artefato acima do limite')
    }
    const bytes = new Uint8Array(stats.size + 1)
    let total = 0
    let read = await handle.read(bytes, 0, bytes.byteLength, null)
    while (read.bytesRead > 0) {
      total += read.bytesRead
      if (total > stats.size) throw new Error('Artefato alterado na leitura')
      read = await handle.read(bytes, total, bytes.byteLength - total, null)
    }
    if (total !== stats.size) throw new Error('Artefato alterado na leitura')
    return bytes.subarray(0, total)
  } finally {
    await handle.close()
  }
}

// O hash das identidades só prova que elas combinam com o manifesto. O vínculo
// com este bundle vem do identificador gravado no SSR antes do prerender.
function assertManifest(manifest: SitemapArtifactManifest): void {
  const {
    buildId,
    byteBudget,
    pagePartCount,
    partBytes,
    isRootStatic,
    hasArraySources,
    hasPartitionSources,
    identities
  } = manifest
  const isCoherent =
    partBytes.length === pagePartCount &&
    partBytes.every(bytes => bytes <= byteBudget) &&
    isRootStatic ===
      (!hasArraySources && !hasPartitionSources && pagePartCount > 0) &&
    hasArraySources === (identities !== null)
  if (!isCoherent) throw new Error('Manifesto incoerente')
  const expected = import.meta.env.PUBLICATION_BUILD_ID
  if (!expected || buildId !== expected) {
    throw new Error('Manifesto de outro build')
  }
}

export function createSitemapArtifacts(): SitemapArtifacts {
  const readManifest = readOnce(async () => {
    const bytes = await readBounded({
      file: artifactPath(SITEMAP_MANIFEST_FILE),
      maxBytes: SITEMAP_MANIFEST_MAX_BYTES
    })
    const manifest = v.parse(ManifestSchema, JSON.parse(decoder.decode(bytes)))
    assertManifest(manifest)
    return manifest
  })
  const readIdentities = readOnce(async (): Promise<SitemapIdentities> => {
    const { identities } = await readManifest()
    if (!identities) throw new Error('Manifesto sem identidades')
    const bytes = await readBounded({
      file: artifactPath(identities.file),
      maxBytes: identities.bytes
    })
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (bytes.byteLength !== identities.bytes || hash !== identities.sha256) {
      throw new Error('Identidades de outra geração')
    }
    const { urls, entries } = v.parse(
      IdentitiesSchema,
      JSON.parse(decoder.decode(bytes))
    )
    return { urls: new Set(urls), entries }
  })
  return { readManifest, readIdentities }
}
