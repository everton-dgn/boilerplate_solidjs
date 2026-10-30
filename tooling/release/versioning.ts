import type { Commit, ReleasePlan } from './types.ts'

type Bump = 'major' | 'minor' | 'patch'
type Change = {
  bump: Bump
  section: string
  summary: string
  sha: string
}

type PlanInput = {
  currentVersion: string
  baselineTag: string | undefined
  commits: Commit[]
  changelog: string
  date: string
}

const SHORT_SHA_LENGTH = 7
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u

// O rodapé deveria vir depois de uma linha em branco, mas commits criados fora
// do hook podem omiti-la; qualquer linha do corpo fora de cercas conta.
function hasBreakingChange(lines: string[]): boolean {
  let fence = ''
  for (const line of lines.slice(1)) {
    const marker = /^\s*(?<fence>`{3,}|~{3,})/u.exec(line)?.groups?.fence
    if (marker) {
      const isClosing = marker.startsWith(fence) && line.trim() === marker
      fence = fence && isClosing ? '' : fence || marker
      continue
    }
    if (!fence && /^BREAKING[ -]CHANGE:\s+\S/u.test(line)) return true
  }
  return false
}

function parseCommit(commit: Commit): Change | undefined {
  const [subject = ''] = commit.message.split(/\r?\n/u)
  const match =
    /^(?<type>[a-z]+)(?:\((?<scope>[^\r\n)]+)\))?(?<breaking>!)?: (?<summary>.+)$/u.exec(
      subject
    )
  const groups = match?.groups
  if (!groups?.summary) return undefined
  const common = { summary: groups.summary, sha: commit.sha }
  if (groups.breaking || hasBreakingChange(commit.message.split(/\r?\n/u))) {
    return { ...common, bump: 'major', section: 'Changed' }
  }
  if (groups.type === 'feat') {
    return { ...common, bump: 'minor', section: 'Added' }
  }
  if (
    ['fix', 'perf', 'revert'].includes(groups.type ?? '') ||
    (['build', 'chore'].includes(groups.type ?? '') &&
      ['deps', 'deps-dev'].includes(groups.scope ?? ''))
  ) {
    return { ...common, bump: 'patch', section: 'Fixed' }
  }
  return undefined
}

function escapeSummary(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll(/[\\`*_[\]#]/gu, String.raw`\$&`)
    .replaceAll('@', '&#64;')
}

function parseVersion(version: string): number[] {
  if (!versionPattern.test(version)) {
    throw new Error(`Invalid stable version: ${version}`)
  }
  return version.split('.').map(Number)
}

export function isStableVersion(version: string): boolean {
  return versionPattern.test(version)
}

export function planRelease(input: PlanInput): ReleasePlan | undefined {
  const [major = 0, minor = 0, patch = 0] = parseVersion(input.currentVersion)
  if (input.baselineTag) {
    if (input.baselineTag !== `v${input.currentVersion}`) {
      throw new Error('Package version differs from the latest stable tag.')
    }
  } else if (input.currentVersion !== '0.0.0') {
    throw new Error('The first release must start from version 0.0.0.')
  }
  const changes = input.commits
    .map(parseCommit)
    .filter(value => value !== undefined)
  if (changes.length === 0) return undefined
  let version = `${major}.${minor}.${patch + 1}`
  if (changes.some(change => change.bump === 'minor')) {
    version = `${major}.${minor + 1}.0`
  }
  if (changes.some(change => change.bump === 'major')) {
    version = `${major + 1}.0.0`
  }
  if (!input.baselineTag) version = '1.0.0'
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.date)) {
    throw new Error('Invalid release date.')
  }
  const marker = /^## Unreleased\s*$/mu.exec(input.changelog)
  if (!marker) throw new Error('CHANGELOG.md must have an Unreleased section.')
  if (input.changelog.includes(`## ${version} - `)) {
    throw new Error('Release already exists in changelog.')
  }
  const start = marker.index + marker[0].length
  const remaining = input.changelog.slice(start)
  const nextHeading = remaining.search(/^## /mu)
  const end = nextHeading < 0 ? input.changelog.length : start + nextHeading
  const curated = input.changelog.slice(start, end).trim()
  const generated = ['Added', 'Changed', 'Fixed']
    .map(section => {
      const entries = changes.filter(change => change.section === section)
      if (entries.length === 0) return ''
      return `### ${section}\n\n${entries.map(change => `- ${escapeSummary(change.summary)} (${change.sha.slice(0, SHORT_SHA_LENGTH)})`).join('\n')}`
    })
    .filter(Boolean)
    .join('\n\n')
  const notes = curated || generated
  const changelog = [
    input.changelog.slice(0, start).trimEnd(),
    `## ${version} - ${input.date}\n\n${notes}`,
    input.changelog.slice(end).trim()
  ]
    .filter(Boolean)
    .join('\n\n')
    .concat('\n')
  return { version, tag: `v${version}`, notes, changelog }
}
