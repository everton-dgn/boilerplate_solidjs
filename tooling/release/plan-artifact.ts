import { readFile } from 'node:fs/promises'

import { releaseDay } from './context.ts'
import type { ReleaseContext, ReleasePlan, ValidatedRelease } from './types.ts'

type FormattedFiles = {
  packageJson: string
  changelog: string
}
type ArtifactInput = FormattedFiles & {
  ctx: ReleaseContext
}
type ArtifactCheck = {
  artifact: unknown
  ctx: ReleaseContext
  expected: ReleasePlan
}
type NotesSource = {
  changelog: string
  heading: string
}
type VersionedContext = {
  ctx: ReleaseContext
  version: string
}

// Contrato entre o job de leitura, que formata os arquivos com o Vite+, e os
// jobs com escrita, que só usam Git, gh e módulos nativos. Versão, tag e notas
// saem do plano recalculado e do changelog conferido.
type PlanArtifact = FormattedFiles & {
  format: number
  source: string
}

const ARTIFACT_FORMAT = 2
const JSON_INDENT = 2
const MAX_ARTIFACT_LENGTH = 4_194_304
const ARTIFACT_KEYS = ['changelog', 'format', 'packageJson', 'source']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function words(value: string): string {
  return value.trim().split(/\s+/u).join(' ')
}

function heading({ ctx, version }: VersionedContext): string {
  return `## ${version} - ${releaseDay(ctx)}`
}

function extractNotes({ changelog, heading: title }: NotesSource): string {
  if (!changelog.includes(title)) {
    throw new Error('Release heading is missing from CHANGELOG.md.')
  }
  const section = changelog.slice(changelog.indexOf(title) + title.length)
  const next = section.search(/^## /mu)
  return section.slice(0, next < 0 ? undefined : next).trim()
}

export function manifestContent({ ctx, version }: VersionedContext): string {
  return `${JSON.stringify({ ...ctx.manifest, version }, null, JSON_INDENT)}\n`
}

export function createPlanArtifact({
  ctx,
  packageJson,
  changelog
}: ArtifactInput): PlanArtifact {
  return { format: ARTIFACT_FORMAT, source: ctx.source, packageJson, changelog }
}

export async function readPlanArtifact(file: string): Promise<unknown> {
  const content = await readFile(file, 'utf8')
  if (content.length > MAX_ARTIFACT_LENGTH) {
    throw new Error('Release plan artifact is too large.')
  }
  return JSON.parse(content)
}

// O job com escrita não formata nada: confere que o artifact só difere do
// plano recalculado em espaços e que o package.json muda apenas a versão.
export function assertPlanArtifact({
  artifact,
  ctx,
  expected
}: ArtifactCheck): ValidatedRelease {
  if (
    !isRecord(artifact) ||
    Object.keys(artifact).toSorted().join(',') !== ARTIFACT_KEYS.join(',')
  ) {
    throw new Error('Release plan artifact has an unexpected structure.')
  }
  const { format, source, packageJson, changelog } = artifact
  if (typeof packageJson !== 'string' || typeof changelog !== 'string') {
    throw new TypeError('Release plan artifact has an unexpected structure.')
  }
  if (format !== ARTIFACT_FORMAT || source !== ctx.source) {
    throw new Error('Release plan artifact does not match the source plan.')
  }
  const { version, tag } = expected
  if (
    !packageJson.endsWith('\n') ||
    JSON.stringify(JSON.parse(packageJson)) !==
      JSON.stringify(JSON.parse(manifestContent({ ctx, version })))
  ) {
    throw new Error('Release plan artifact changes package.json content.')
  }
  if (
    !changelog.endsWith('\n') ||
    words(changelog) !== words(expected.changelog)
  ) {
    throw new Error('Release plan artifact changes CHANGELOG.md content.')
  }
  const notes = extractNotes({ changelog, heading: heading({ ctx, version }) })
  if (!notes) throw new Error('Release notes are empty in CHANGELOG.md.')
  return {
    plan: { version, tag, notes, changelog },
    files: [
      { path: 'package.json', content: packageJson },
      { path: 'CHANGELOG.md', content: changelog }
    ]
  }
}
