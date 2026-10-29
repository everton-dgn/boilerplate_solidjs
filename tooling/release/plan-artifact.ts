import { readFile } from 'node:fs/promises'

import { releaseDay, type ReleaseContext } from './context.ts'
import { parseVersion, type ReleasePlan } from './versioning.ts'

type ReleaseFile = {
  path: string
  content: string
}
type FormattedFiles = {
  packageJson: string
  changelog: string
}
type ArtifactInput = FormattedFiles & {
  ctx: ReleaseContext
  expected: ReleasePlan
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
// jobs com escrita, que só usam Git, gh e módulos nativos.
type PlanArtifact = {
  format: number
  source: string
  version: string
  tag: string
  notes: string
  packageJson: string
  changelog: string
}

const ARTIFACT_FORMAT = 1
const JSON_INDENT = 2
const MAX_ARTIFACT_LENGTH = 4_194_304
const ARTIFACT_KEYS = [
  'changelog',
  'format',
  'notes',
  'packageJson',
  'source',
  'tag',
  'version'
]

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

export type ValidatedRelease = {
  plan: ReleasePlan
  files: ReleaseFile[]
}

export function manifestContent({ ctx, version }: VersionedContext): string {
  return `${JSON.stringify({ ...ctx.manifest, version }, null, JSON_INDENT)}\n`
}

export function createPlanArtifact({
  ctx,
  expected,
  packageJson,
  changelog
}: ArtifactInput): PlanArtifact {
  const title = heading({ ctx, version: expected.version })
  return {
    format: ARTIFACT_FORMAT,
    source: ctx.source,
    version: expected.version,
    tag: expected.tag,
    notes: extractNotes({ changelog, heading: title }),
    packageJson,
    changelog
  }
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
  const { format, source, version, tag, notes, packageJson, changelog } =
    artifact
  if (
    typeof version !== 'string' ||
    typeof tag !== 'string' ||
    typeof notes !== 'string' ||
    typeof packageJson !== 'string' ||
    typeof changelog !== 'string'
  ) {
    throw new TypeError('Release plan artifact has an unexpected structure.')
  }
  parseVersion(version)
  if (
    format !== ARTIFACT_FORMAT ||
    source !== ctx.source ||
    version !== expected.version ||
    tag !== expected.tag
  ) {
    throw new Error('Release plan artifact does not match the source plan.')
  }
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
  const title = heading({ ctx, version })
  if (!notes || notes !== extractNotes({ changelog, heading: title })) {
    throw new Error('Release plan notes differ from the changelog section.')
  }
  return {
    plan: { version, tag, notes, changelog },
    files: [
      { path: 'package.json', content: packageJson },
      { path: 'CHANGELOG.md', content: changelog }
    ]
  }
}
