import assert from 'node:assert/strict'
import { it } from 'node:test'

import * as v from 'valibot'

import { lint } from '../lint.ts'
import { lintFixture } from '../testing/lintFixture/index.ts'

const TOOLING_TESTS = 'tooling/**/__tests__/**/*.ts'
const FLOATING = 'typescript(no-floating-promises)'
const PROBE = 'tooling/probe/__tests__/probe.test.ts'
const PROBE_SOURCE = `import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('probe', () => {
  it('forgets to await', () => {
    assert.rejects(Promise.reject(new Error('lost')))
  })
})
`

// A análise de tipos precisa de um projeto TypeScript com os tipos do Node.
const PROBE_TSCONFIG = JSON.stringify({
  compilerOptions: {
    module: 'nodenext',
    target: 'esnext',
    strict: true,
    noEmit: true,
    types: ['node']
  },
  include: ['tooling']
})

const DiagnosticSchema = v.object({ code: v.string() })
const DiagnosticsSchema = v.object({ diagnostics: v.array(DiagnosticSchema) })

const override = lint.overrides?.find(
  entry =>
    entry.files.includes(TOOLING_TESTS) &&
    entry.rules?.['typescript/no-floating-promises'] !== undefined
)
// A fixture liga só a análise de tipos e o override real dos testes de tooling.
const PROMISE_LINT_CONFIG = `export default ${JSON.stringify({
  lint: {
    categories: { correctness: 'off' },
    plugins: ['typescript'],
    options: { typeAware: true },
    overrides: [override]
  }
})}`

it('aceita describe e it do node:test e acusa a Promise de teste esquecida', context => {
  assert.ok(override, 'O override dos testes de tooling não foi encontrado.')
  const result = lintFixture({
    context,
    config: PROMISE_LINT_CONFIG,
    sources: { 'tsconfig.json': PROBE_TSCONFIG, [PROBE]: PROBE_SOURCE }
  })
  const { diagnostics } = v.parse(DiagnosticsSchema, JSON.parse(result.stdout))
  assert.deepEqual(
    diagnostics.map(diagnostic => diagnostic.code),
    [FLOATING],
    result.stderr
  )
})
