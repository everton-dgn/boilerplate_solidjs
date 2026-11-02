import { constants } from 'node:fs'
import {
  type FileHandle,
  lstat,
  mkdtemp,
  open,
  realpath,
  rename,
  rm
} from 'node:fs/promises'
import nodePath from 'node:path'

import { LLMS_FULL_PATH } from '../../constants.ts'
import type { LlmsFullDocument, LlmsFullOmission } from '../../types.ts'
import { writeAll } from '../writeAll/index.ts'

type LlmsIndexHeader = { title: string; description: string; url: string }
type LlmsFullOptions = {
  outputDir: string
  publicDir: string
  maxBytes: number
  index: LlmsIndexHeader
  baseLocale: string
  documents: readonly LlmsFullDocument[]
  omitted: readonly LlmsFullOmission[]
  signal?: AbortSignal
}
type ResolvedArtifact = { file: string; size: number }
type Artifact = LlmsFullDocument & ResolvedArtifact
type ResolveOptions = { root: string; path: string }
type CopyOptions = {
  artifact: Artifact
  output: FileHandle
  signal?: AbortSignal
}
type AssembleOptions = {
  output: FileHandle
  header: Uint8Array
  artifacts: readonly Artifact[]
  signal?: AbortSignal
}
type HeaderOptions = Omit<
  LlmsFullOptions,
  'outputDir' | 'publicDir' | 'maxBytes' | 'signal'
>

const CHUNK_BYTES = 65_536
const FILE_NAME = LLMS_FULL_PATH.slice(1)
// No Windows, O_NOFOLLOW não existe e não altera os flags; o realpath anterior
// continua recusando links.
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW
const encoder = new TextEncoder()
const SEPARATOR = encoder.encode('\n')

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file)
    return true
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

// O caminho vem do inventário decodificado do prerender. O realpath igual ao
// caminho montado recusa symlinks no arquivo e nos diretórios acima dele.
async function resolveArtifact({
  root,
  path
}: ResolveOptions): Promise<ResolvedArtifact> {
  const segments = path.slice(1).split('/')
  if (
    !path.startsWith('/') ||
    path.includes('\0') ||
    segments.some(
      segment =>
        segment === '' ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('\\')
    )
  ) {
    throw new Error(`Static Markdown path escapes the output: ${path}`)
  }
  const file = nodePath.join(root, ...segments)
  let real: string
  try {
    real = await realpath(file)
  } catch (error) {
    if (isMissing(error)) {
      throw new Error(`Static Markdown missing: ${path}`, { cause: error })
    }
    throw error
  }
  const stats = await lstat(file)
  if (real !== file || !stats.isFile()) {
    throw new Error(`Static Markdown is not a regular file: ${path}`)
  }
  return { file, size: stats.size }
}

function formatHeader({
  index,
  baseLocale,
  documents,
  omitted
}: HeaderOptions): string {
  const noun = documents.length === 1 ? 'page' : 'pages'
  const lines = [`# ${index.title}`, '']
  if (index.description) lines.push(`> ${index.description}`, '')
  lines.push(
    `Complete Markdown of ${documents.length} static ${noun} linked from ${index.url}, in the base language (${baseLocale}) and in index order. Each document starts with a Source line, the URL of its Markdown file, and a Bytes line with the exact UTF-8 length of the body that follows.`,
    '',
    '## Documents',
    '',
    ...documents.map(({ url }) => `- ${url}`),
    ''
  )
  if (omitted.length > 0) {
    lines.push(
      '## Not included',
      '',
      'Linked from the index, but outside this file:',
      '',
      ...omitted.map(({ url, reason }) => `- ${url}: ${reason}`),
      ''
    )
  }
  return lines.join('\n')
}

function formatSource({ url, size }: Artifact): string {
  return `\nSource: ${url}\nBytes: ${size}\n\n`
}

// Lê em blocos e confere bytes e UTF-8 contra o arquivo aprovado no prerender.
async function copyArtifact({
  artifact,
  output,
  signal
}: CopyOptions): Promise<void> {
  const changed = new Error(
    `Static Markdown changed while reading: ${artifact.path}`
  )
  const source = await open(artifact.file, READ_FLAGS)
  try {
    const stats = await source.stat()
    if (!stats.isFile() || stats.size !== artifact.size) throw changed
    const decoder = new TextDecoder('utf-8', { fatal: true })
    const buffer = new Uint8Array(CHUNK_BYTES)
    let total = 0
    let read = await source.read(buffer, 0, CHUNK_BYTES, null)
    while (read.bytesRead > 0) {
      total += read.bytesRead
      if (total > artifact.size) throw changed
      const chunk = buffer.subarray(0, read.bytesRead)
      decoder.decode(chunk, { stream: true })
      await writeAll({ output, bytes: chunk, signal })
      read = await source.read(buffer, 0, CHUNK_BYTES, null)
    }
    decoder.decode()
    if (total !== artifact.size) throw changed
  } finally {
    await source.close()
  }
}

async function assemble({
  output,
  header,
  artifacts,
  signal
}: AssembleOptions): Promise<void> {
  await writeAll({ output, bytes: header, signal })
  for (const artifact of artifacts) {
    const source = encoder.encode(formatSource(artifact))
    await writeAll({ output, bytes: source, signal })
    await copyArtifact({ artifact, output, signal })
    await writeAll({ output, bytes: SEPARATOR, signal })
  }
}

// Monta o agregado num diretório temporário ao lado da saída estática e só o
// promove completo, com o tamanho previsto; qualquer falha ou cancelamento
// remove o temporário e interrompe o build.
export async function writeLlmsFull(options: LlmsFullOptions): Promise<void> {
  const { outputDir, publicDir, maxBytes, documents, signal } = options
  signal?.throwIfAborted()
  const root = await realpath(publicDir)
  const target = nodePath.join(root, FILE_NAME)
  if (await exists(target)) {
    throw new Error(`${LLMS_FULL_PATH} already exists in the static output`)
  }
  if (documents.length === 0) return
  const artifacts: Artifact[] = []
  for (const document of documents) {
    artifacts.push({
      ...document,
      ...(await resolveArtifact({ root, path: document.path }))
    })
  }
  const header = encoder.encode(formatHeader(options))
  const total = artifacts.reduce(
    (sum, artifact) =>
      sum +
      encoder.encode(formatSource(artifact)).byteLength +
      artifact.size +
      SEPARATOR.byteLength,
    header.byteLength
  )
  if (total > maxBytes) {
    throw new Error(
      `${LLMS_FULL_PATH} would have ${total} bytes, above the ${maxBytes} byte budget`
    )
  }
  const workDir = await mkdtemp(nodePath.join(outputDir, '.llms-full-'))
  try {
    const temporary = nodePath.join(workDir, FILE_NAME)
    const output = await open(temporary, 'wx')
    try {
      await assemble({ output, header, artifacts, signal })
      await output.sync()
      const { size } = await output.stat()
      if (size !== total) {
        throw new Error(
          `${LLMS_FULL_PATH} has ${size} bytes instead of the expected ${total}`
        )
      }
    } finally {
      await output.close()
    }
    signal?.throwIfAborted()
    await rename(temporary, target)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
