/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env, execPath } from 'node:process'
import { test } from 'node:test'
import { promisify } from 'node:util'

const exec = promisify(execFile)
// Hooks do Git exportam GIT_DIR e afins; os repositórios temporários não podem herdá-los.
const ISOLATED_ENV = Object.fromEntries(
  Object.entries(env).filter(([key]) => !key.startsWith('GIT_'))
)
// Identidade por comando: nenhum teste grava configuração de Git.
const IDENTITY = ['-c', 'user.email=ci@example.com', '-c', 'user.name=CI']
const EVIDENCE_TEST = 'a evidência descreve o merge sintético testado'
const WORKFLOW = await readFile(
  new URL('../../../.github/workflows/ci.yml', import.meta.url),
  'utf8'
)
const LINES = WORKFLOW.split('\n')
const SETUP_ACTION = await readFile(
  new URL('../../../.github/actions/setup-project/action.yml', import.meta.url),
  'utf8'
)
const RUN_INDENT_OFFSET = 2
const NOT_FOUND = -1
const SHA_LENGTH = 40
const LAST_INDEX = -1
// pull e build no E2E de produção, deploy no job de deploy.
const VERCEL_COMMAND_COUNT = 3

type ScriptOptions = {
  script: string
  variables: Record<string, string>
}
type GateCase = {
  variables: Record<string, string>
  isAccepted: boolean
}

function stepScript(name: string): string {
  const start = LINES.findIndex(line => line.trim() === `- name: ${name}`)
  assert.ok(start !== NOT_FOUND, `Passo ausente: ${name}`)
  const next = LINES.findIndex(
    (line, index) => index > start && line.trim().startsWith('- name: ')
  )
  const run = LINES.findIndex(
    (line, index) => index > start && line.trim() === 'run: |'
  )
  assert.ok(
    run > start && (next === NOT_FOUND || run < next),
    `Passo sem run: ${name}`
  )
  const indent = (LINES[run] ?? '').indexOf('run:')
  const body: string[] = []
  for (const line of LINES.slice(run + 1)) {
    if (line.trim() && line.search(/\S/u) <= indent) break
    body.push(line.slice(indent + RUN_INDENT_OFFSET))
  }
  return body.join('\n')
}

function jobBlock(id: string): string {
  const start = LINES.indexOf(`  ${id}:`)
  assert.ok(start !== NOT_FOUND, `Job ausente: ${id}`)
  const end = LINES.findIndex(
    (line, index) => index > start && /^ {2}\S/u.test(line)
  )
  return LINES.slice(start, end === NOT_FOUND ? undefined : end).join('\n')
}

async function runScript({ script, variables }: ScriptOptions) {
  try {
    // Fora de qualquer repositório: um script sem cd não alcança o checkout.
    await exec('bash', ['-e', '-c', script], {
      cwd: tmpdir(),
      env: { ...ISOLATED_ENV, ...variables }
    })
    return true
  } catch {
    return false
  }
}

const reused = { PROOF_RESULT: 'success', REUSE: 'true', RUN_QUALITY: 'false' }
const allPassed = {
  QUALITY_RESULT: 'success',
  TOOLING_RESULT: 'success',
  FIXTURES_RESULT: 'success',
  PRODUCTION_RESULT: 'success'
}
const allSkipped = {
  QUALITY_RESULT: 'skipped',
  TOOLING_RESULT: 'skipped',
  FIXTURES_RESULT: 'skipped',
  PRODUCTION_RESULT: 'success'
}
const pullRequest = { PROOF_RESULT: 'skipped', REUSE: '', RUN_QUALITY: '' }

test('o gate aceita jobs pulados somente com prova válida', async () => {
  const script = stepScript('Require all validation jobs')
  const cases: GateCase[] = [
    { variables: { ...pullRequest, ...allPassed }, isAccepted: true },
    { variables: { ...reused, ...allSkipped }, isAccepted: true },
    {
      variables: {
        ...reused,
        ...allSkipped,
        RUN_QUALITY: 'true',
        QUALITY_RESULT: 'success'
      },
      isAccepted: true
    },
    { variables: { ...reused, ...allPassed }, isAccepted: true },
    {
      variables: { ...pullRequest, ...allPassed, TOOLING_RESULT: 'skipped' },
      isAccepted: false
    },
    {
      variables: { ...reused, ...allSkipped, RUN_QUALITY: 'true' },
      isAccepted: false
    },
    {
      variables: { ...reused, ...allSkipped, PRODUCTION_RESULT: 'skipped' },
      isAccepted: false
    },
    {
      variables: { ...reused, ...allSkipped, PRODUCTION_RESULT: 'failure' },
      isAccepted: false
    },
    {
      variables: { ...reused, ...allSkipped, TOOLING_RESULT: 'failure' },
      isAccepted: false
    },
    {
      variables: { ...reused, ...allSkipped, FIXTURES_RESULT: 'cancelled' },
      isAccepted: false
    },
    {
      variables: { ...reused, ...allSkipped, REUSE: 'false' },
      isAccepted: false
    },
    {
      variables: { ...reused, ...allSkipped, PROOF_RESULT: 'failure' },
      isAccepted: false
    },
    {
      variables: {
        ...reused,
        ...allPassed,
        PROOF_RESULT: 'failure',
        REUSE: ''
      },
      isAccepted: true
    },
    {
      variables: { ...reused, ...allPassed, PRODUCTION_RESULT: 'cancelled' },
      isAccepted: false
    }
  ]
  for (const { variables, isAccepted } of cases) {
    assert.equal(
      await runScript({ script, variables }),
      isAccepted,
      JSON.stringify(variables)
    )
  }
})

test('o grafo mantém produção independente e os jobs reutilizáveis atrás do proof', () => {
  assert.doesNotMatch(jobBlock('e2e-production'), /needs:/u)
  assert.match(jobBlock('e2e-production'), /name: E2E \(production\)/u)
  for (const [id, name] of [
    ['quality', 'Quality'],
    ['tooling', 'Tooling'],
    ['e2e-fixtures', 'E2E (fixtures)']
  ] as const) {
    const block = jobBlock(id)
    assert.ok(block.includes(`    name: ${name}\n    needs: proof\n`), id)
    assert.ok(
      block.includes(
        `\${{ !cancelled() && (needs.proof.result != 'success' ||`
      ),
      id
    )
  }
  const proof = jobBlock('proof')
  assert.ok(
    proof.includes(
      "if: github.event_name == 'push' && github.ref == 'refs/heads/main'"
    )
  )
  assert.ok(
    proof.includes(
      '    permissions:\n      actions: read\n      contents: read\n      pull-requests: read\n    outputs:'
    )
  )
  assert.ok(
    jobBlock('check').includes(
      'needs: [proof, quality, tooling, e2e-fixtures, e2e-production]'
    )
  )
  const deploy = jobBlock('deploy')
  assert.ok(deploy.includes('needs: [check, e2e-production]'))
  const condition = deploy.replaceAll(/\s+/gu, ' ')
  for (const clause of [
    '!cancelled()',
    "needs.check.result == 'success'",
    "needs.e2e-production.result == 'success'",
    "github.event_name == 'push'",
    "github.ref == 'refs/heads/main'"
  ]) {
    assert.ok(condition.includes(clause), clause)
  }
})

test('o workflow publica a evidência e as chaves lidas pelo proof', () => {
  const quality = jobBlock('quality')
  assert.ok(
    quality.includes(`name: ci-reuse-evidence-\${{ github.run_attempt }}`)
  )
  assert.ok(
    WORKFLOW.includes(
      `ci-validation-v2-\${{ runner.os }}-\${{ runner.arch }}-node-\${{\n            steps.toolchain.outputs.node }}-bun-\${{ steps.toolchain.outputs.bun\n            }}-\${{ hashFiles('bun.lock') }}-`
    )
  )
})

test(EVIDENCE_TEST, async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ci-reuse-evidence-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const repository = path.join(directory, 'repo')
  async function git(...args: string[]) {
    const result = await exec('git', [...IDENTITY, '-C', repository, ...args], {
      env: ISOLATED_ENV
    })
    return result.stdout.trim()
  }
  await exec('git', ['init', '-q', '-b', 'main', repository], {
    env: ISOLATED_ENV
  })
  await git('commit', '-q', '--allow-empty', '-m', 'base')
  const base = await git('rev-parse', 'HEAD')
  await git('switch', '-q', '-c', 'feature')
  await writeFile(path.join(repository, 'file.txt'), 'head\n')
  await git('add', 'file.txt')
  await git('commit', '-q', '-m', 'head')
  const head = await git('rev-parse', 'HEAD')
  await git('switch', '-q', '--detach', base)
  await git('merge', '-q', '--no-ff', '-m', 'merge', head)
  const tested = await git('rev-parse', 'HEAD')
  const tree = await git('rev-parse', 'HEAD^{tree}')
  const variables = {
    RUNNER_TEMP: directory,
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_RUN_ID: '900',
    GITHUB_RUN_ATTEMPT: '2',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_WORKFLOW_REF:
      'owner/repo/.github/workflows/ci.yml@refs/pull/42/merge',
    GITHUB_WORKFLOW_SHA: tested,
    GITHUB_SHA: tested,
    PULL_REQUEST: '42',
    BASE_REF: 'main',
    BASE_SHA: base,
    HEAD_SHA: head
  }
  const script = `cd ${JSON.stringify(repository)}\n${stepScript('Record tested commit')}`
  assert.equal(await runScript({ script, variables }), true)
  const evidence: unknown = JSON.parse(
    await readFile(
      path.join(directory, 'ci-reuse-evidence/evidence.json'),
      'utf8'
    )
  )
  assert.deepEqual(evidence, {
    version: 1,
    repository: 'owner/repo',
    run_id: 900,
    run_attempt: 2,
    event: 'pull_request',
    workflow_ref: variables.GITHUB_WORKFLOW_REF,
    workflow_sha: tested,
    github_sha: tested,
    pull_request: 42,
    base_ref: 'main',
    base_sha: base,
    head_sha: head,
    tested_sha: tested,
    tested_tree: tree,
    tested_parents: [base, head]
  })
})

test('pull, build e deploy usam uma única versão estrita do Vercel CLI', async context => {
  assert.doesNotMatch(WORKFLOW, /vercel@latest/u)
  assert.equal(
    WORKFLOW.split('vp dlx "vercel@$VERCEL_CLI_VERSION"').length - 1,
    VERCEL_COMMAND_COUNT
  )
  assert.ok(
    jobBlock('deploy').includes(
      `VERCEL_CLI_VERSION: \${{ needs.e2e-production.outputs.vercel-version }}`
    )
  )
  const directory = await mkdtemp(path.join(tmpdir(), 'ci-vercel-version-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(
    path.join(directory, 'curl'),
    '#!/bin/sh\ntest -n "$FAKE_RESPONSE" || exit 22\nprintf "%s" "$FAKE_RESPONSE"\n',
    { mode: 0o755 }
  )
  const resolve = stepScript('Resolve Vercel CLI version')
  const output = path.join(directory, 'output')
  const cases = [
    { response: '{"name":"vercel","version":"64.5.0"}', expected: '64.5.0' },
    { response: '{"name":"vercel","version":"64.5.0-canary.1"}' },
    { response: '{"name":"vercel","version":"latest"}' },
    { response: '{"name":"vercel","version":"1.2"}' },
    { response: '{"name":"vercel","version":"01.2.3"}' },
    { response: '{"name":"other","version":"1.2.3"}' },
    { response: '' }
  ]
  for (const { response, expected } of cases) {
    await writeFile(output, '')
    const isAccepted = await runScript({
      script: resolve,
      variables: {
        FAKE_RESPONSE: response,
        GITHUB_OUTPUT: output,
        PATH: `${directory}:${env.PATH ?? ''}`
      }
    })
    assert.equal(isAccepted, expected !== undefined, response)
    assert.equal(
      await readFile(output, 'utf8'),
      expected ? `version=${expected}\n` : '',
      response
    )
  }
  const verify = stepScript('Verify deployment configuration')
  const configured = {
    VERCEL_ORG_ID: 'org',
    VERCEL_PROJECT_ID: 'project',
    VERCEL_TOKEN: 'token'
  }
  for (const [version, isAccepted] of [
    ['64.5.0', true],
    ['', false],
    ['latest', false]
  ] as const) {
    assert.equal(
      await runScript({
        script: verify,
        variables: { ...configured, VERCEL_CLI_VERSION: version }
      }),
      isAccepted,
      version
    )
  }
})

test('só proof e deploy preparam as ferramentas sem instalar dependências', () => {
  assert.match(
    SETUP_ACTION,
    /install-dependencies:\n {4}description: .+\n {4}required: false\n {4}default: 'true'/u
  )
  assert.match(
    SETUP_ACTION,
    /cache: \$\{\{ inputs\.install-dependencies == 'true' \}\}/u
  )
  assert.match(
    SETUP_ACTION,
    /- name: Install dependencies\n {6}if: inputs\.install-dependencies == 'true'/u
  )
  const toolchainOnly = ['proof', 'deploy'].map(id => jobBlock(id))
  for (const block of toolchainOnly) {
    assert.ok(
      block.includes('install-dependencies: false\n          cache-save: false')
    )
  }
  assert.equal(
    WORKFLOW.split('install-dependencies: false').length - 1,
    toolchainOnly.length
  )
})

test('o deploy confere o head da main sob o lock antes de publicar', () => {
  const deploy = jobBlock('deploy')
  const steps = deploy.split('\n      - name: ').slice(1)
  const [guard, ...rest] = steps
  assert.ok(
    deploy.indexOf('group: vercel-production') < deploy.indexOf('    steps:')
  )
  assert.ok(
    guard?.startsWith('Check that this commit is still the head of main')
  )
  assert.ok(rest.length > 0)
  for (const step of rest) {
    assert.ok(
      step.includes(
        "\n        if: steps.freshness.outputs.should-deploy == 'true'\n"
      ),
      step.split('\n')[0]
    )
  }
  assert.ok(rest.at(LAST_INDEX)?.includes('deploy --prebuilt --prod --yes'))
})

test('a guarda publica só o head atual e falha em erro de API', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ci-deploy-guard-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(
    path.join(directory, 'gh'),
    '#!/bin/sh\ntest "$FAKE_GH_STATUS" = 0 || exit 1\nprintf "%s\\n" "$FAKE_GH_OUTPUT"\n',
    { mode: 0o755 }
  )
  const script = stepScript('Check that this commit is still the head of main')
  const current = 'a'.repeat(SHA_LENGTH)
  const output = path.join(directory, 'output')
  const summary = path.join(directory, 'summary')
  const cases = [
    { status: '0', head: current, isAccepted: true, decision: 'true' },
    {
      status: '0',
      head: 'b'.repeat(SHA_LENGTH),
      isAccepted: true,
      decision: 'false'
    },
    { status: '1', head: current, isAccepted: false, decision: undefined },
    { status: '0', head: 'not-a-sha', isAccepted: false, decision: undefined },
    { status: '0', head: '', isAccepted: false, decision: undefined }
  ]
  for (const { status, head, isAccepted, decision } of cases) {
    await writeFile(output, '')
    await writeFile(summary, '')
    assert.equal(
      await runScript({
        script,
        variables: {
          FAKE_GH_STATUS: status,
          FAKE_GH_OUTPUT: head,
          GITHUB_SHA: current,
          GITHUB_REPOSITORY: 'owner/repo',
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
          PATH: `${directory}:${env.PATH ?? ''}`
        }
      }),
      isAccepted,
      `${status} ${head}`
    )
    assert.equal(
      await readFile(output, 'utf8'),
      decision ? `should-deploy=${decision}\n` : ''
    )
    if (decision === 'false') {
      assert.match(await readFile(summary, 'utf8'), /Deploy skipped/u)
    }
  }
})

test('os testes ignoram GIT_DIR e GIT_WORK_TREE herdados de hooks', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ci-reuse-hostile-git-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const victim = path.join(directory, 'victim')
  const worktree = path.join(directory, 'worktree')
  async function git(...args: string[]) {
    const result = await exec('git', args, { env: ISOLATED_ENV })
    return result.stdout
  }
  async function snapshot() {
    const parts = [
      await git('-C', victim, 'rev-parse', 'HEAD'),
      await git('-C', worktree, 'rev-parse', 'HEAD'),
      await git('-C', victim, 'for-each-ref'),
      await git('-C', victim, 'ls-files', '--stage'),
      await git('-C', worktree, 'ls-files', '--stage'),
      await git('-C', victim, 'status', '--porcelain'),
      await git('-C', worktree, 'status', '--porcelain'),
      await readFile(path.join(victim, '.git/config'), 'utf8')
    ]
    return parts.join('\n--\n')
  }
  await git('init', '-q', '-b', 'main', victim)
  await writeFile(path.join(victim, 'tracked.txt'), 'tracked\n')
  await git('-C', victim, 'add', 'tracked.txt')
  await git(...IDENTITY, '-C', victim, 'commit', '-q', '-m', 'init')
  await git('-C', victim, 'worktree', 'add', '-q', '-b', 'feat/x', worktree)
  const gitDir = await git('-C', worktree, 'rev-parse', '--absolute-git-dir')
  const before = await snapshot()
  // Com NODE_TEST_CONTEXT herdado, o runner aninhado só avisa e sai com 0.
  const { NODE_TEST_CONTEXT: _runner, ...childEnv } = ISOLATED_ENV
  const child = await exec(
    execPath,
    [
      '--test',
      '--test-reporter=tap',
      `--test-name-pattern=^${EVIDENCE_TEST}$`,
      import.meta.filename
    ],
    {
      cwd: directory,
      env: { ...childEnv, GIT_DIR: gitDir.trim(), GIT_WORK_TREE: worktree }
    }
  )
  assert.match(child.stdout, new RegExp(`^ok 1 - ${EVIDENCE_TEST}$`, 'mu'))
  assert.match(child.stdout, /^# tests 1$/mu)
  assert.match(child.stdout, /^# pass 1$/mu)
  assert.equal(await snapshot(), before)
})

function jobIds(): string[] {
  const start = LINES.indexOf('jobs:')
  return LINES.slice(start + 1)
    .map(line => /^ {2}(?<id>[a-z][\w-]*):$/u.exec(line)?.groups?.id)
    .filter(id => id !== undefined)
}

function jobNeeds(id: string): string[] {
  const line = /^ {4}needs: (?<value>.+)$/mu.exec(jobBlock(id))?.groups?.value
  return line
    ? line
        .replaceAll(/[[\]]/gu, '')
        .split(',')
        .map(item => item.trim())
    : []
}

function jobCondition(id: string): string {
  return (
    /^ {4}if:(?<value>.*(?:\n {6}.*)*)/mu.exec(jobBlock(id))?.groups?.value ??
    ''
  )
}

test('jobs que dependem de jobs dispensáveis declaram a função de status', () => {
  // Sem função de status, o GitHub aplica success(), que considera toda a
  // cadeia de needs: um ancestral pulado pela prova pularia o job. Esta
  // checagem estrutural não emula o scheduler do GitHub; a prova
  // comportamental é o deploy no próximo merge elegível.
  const skippable = new Set(['quality', 'tooling', 'e2e-fixtures'])
  const ids = jobIds()
  function reachesSkippable(id: string): boolean {
    const pending = [...jobNeeds(id)]
    const seen = new Set<string>()
    while (pending.length > 0) {
      const next = pending.pop() ?? ''
      if (skippable.has(next)) return true
      if (!seen.has(next)) {
        seen.add(next)
        pending.push(...jobNeeds(next))
      }
    }
    return false
  }
  const dependents = ids.filter(
    id => !skippable.has(id) && reachesSkippable(id)
  )
  assert.deepEqual(dependents, ['check', 'deploy'])
  for (const id of dependents) {
    assert.match(jobCondition(id), /!cancelled\(\)|always\(\)/u, id)
  }
})
