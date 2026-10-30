import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'

const RELEASE_DIRECTORY = path.resolve(import.meta.dirname, '..')
const WORKFLOW = await readFile(
  path.resolve(
    import.meta.dirname,
    '../../../.github/workflows/auto-release.yml'
  ),
  'utf8'
)
const LINES = WORKFLOW.split('\n')
const NOT_FOUND = -1
const IMPORT_PATTERN =
  /(?:^|\n)\s*(?:import|export)\b[^'"]*?\bfrom\s*['"](?<specifier>[^'"]+)['"]|(?:^|\n)\s*import\s*['"](?<bare>[^'"]+)['"]|\bimport\(\s*['"](?<dynamic>[^'"]+)['"]\s*\)/gu

function words(value: string): string {
  return value.replaceAll(/\s+/gu, ' ').trim()
}

function jobBlock(id: string): string {
  const start = LINES.indexOf(`  ${id}:`)
  assert.ok(start !== NOT_FOUND, `Job ausente: ${id}`)
  const end = LINES.findIndex(
    (line, index) => index > start && /^ {2}\S/u.test(line)
  )
  return LINES.slice(start, end === NOT_FOUND ? undefined : end).join('\n')
}

async function importsOf(file: string): Promise<string[]> {
  const source = await readFile(file, 'utf8')
  return [...source.matchAll(IMPORT_PATTERN)].map(
    match =>
      match.groups?.specifier ??
      match.groups?.bare ??
      match.groups?.dynamic ??
      ''
  )
}

// Percorre os imports relativos a partir da entrada e devolve os externos.
async function externalImports(entry: string): Promise<string[]> {
  const pending = [path.join(RELEASE_DIRECTORY, entry)]
  const visited = new Set<string>()
  const external = new Set<string>()
  while (pending.length > 0) {
    const file = pending.pop() ?? ''
    if (visited.has(file)) continue
    visited.add(file)
    for (const specifier of await importsOf(file)) {
      if (specifier.startsWith('.')) {
        pending.push(path.resolve(path.dirname(file), specifier))
      } else {
        external.add(specifier)
      }
    }
  }
  return [...external].toSorted()
}

describe('release jobs with write permissions', () => {
  it('load only native modules, while the read-only plan imports the formatter', async () => {
    const writeImports = await externalImports('automatic-release.ts')
    assert.ok(writeImports.length > 0)
    for (const specifier of writeImports) {
      assert.match(specifier, /^node:/u, specifier)
    }
    const planImports = await externalImports('plan-release.ts')
    assert.ok(planImports.includes('vite-plus/fmt'))
  })

  it('keep installation and formatting in the read-only plan job', () => {
    assert.match(WORKFLOW, /^permissions: \{\}$/mu)
    assert.doesNotMatch(WORKFLOW, /voidzero-dev\/setup-vp|vp install/u)
    const plan = jobBlock('plan')
    assert.ok(
      plan.includes(
        '    permissions:\n      actions: read\n      contents: read\n    outputs:'
      )
    )
    assert.ok(plan.includes('uses: ./.github/actions/setup-project'))
    assert.doesNotMatch(plan, /install-dependencies: false/u)
    assert.ok(plan.includes('run: bun tooling/release/plan-release.ts'))
    assert.ok(plan.includes('name: release-plan'))
    for (const id of ['prepare', 'publish']) {
      const job = jobBlock(id)
      assert.ok(
        job.includes(
          'uses: ./.github/actions/setup-project\n        with:\n          install-dependencies: false\n          cache-save: false'
        ),
        id
      )
      assert.ok(job.includes('digest-mismatch: error'), id)
      assert.ok(
        job.includes(
          'run: bun --no-install tooling/release/automatic-release.ts'
        ),
        id
      )
      assert.doesNotMatch(job, /plan-release\.ts/u, id)
    }
  })

  it('grant pull request writes only to the job that opens and closes them', () => {
    assert.ok(jobBlock('prepare').includes('      pull-requests: write\n'))
    const publish = jobBlock('publish')
    assert.ok(publish.includes('      pull-requests: read\n'))
    assert.ok(publish.includes('      contents: write\n'))
    assert.ok(publish.includes('      checks: write\n'))
    assert.doesNotMatch(publish, /pull-requests: write/u)
  })

  it('expose the published tag and version as publish job outputs', () => {
    const publish = jobBlock('publish')
    assert.ok(
      publish.includes(
        `    outputs:\n      tag: \${{ steps.publish.outputs.tag }}\n      version: \${{ steps.publish.outputs.version }}\n`
      )
    )
    assert.ok(
      publish.includes(
        '- name: Validate release metadata, merge and publish\n        id: publish\n'
      )
    )
  })
})

// O GitHub cancela a release pendente do mesmo grupo: um run inelegível que
// entrasse no grupo publish substituiria a release elegível em espera.
describe('release eligibility', () => {
  it('is the same in the concurrency group and in the plan job', () => {
    const group =
      /automatic-release-\$\{\{(?<value>.+?)&& 'publish' \|\| github\.run_id \}\}/su.exec(
        WORKFLOW
      )?.groups?.value
    const condition = /^ {4}if: >-\n(?<value>(?: {6}.*\n)+)/mu.exec(
      jobBlock('plan')
    )?.groups?.value
    assert.ok(group && condition)
    assert.equal(words(group), `(${words(condition)})`)
  })
})
