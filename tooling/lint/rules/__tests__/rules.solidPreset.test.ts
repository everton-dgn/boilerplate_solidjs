import assert from 'node:assert/strict'
import { it } from 'node:test'

import v2Strict from 'eslint-plugin-solid/configs/v2-strict'

import type { LintRules } from '../../types.ts'
import { environmentRules } from '../environment.ts'
import { javascriptRules } from '../javascript.ts'

type RuleEntry = LintRules[string]
type Severities = Record<string, number>

// Desligada em todos os presets do plugin; o projeto a liga por escolha.
const PROJECT_ONLY_RULES = ['solid/action-yield-after-await']
const SEVERITY: Severities = { off: 0, allow: 0, warn: 1, error: 2, deny: 2 }

function severityOf(entry: RuleEntry): number {
  const level: unknown = Array.isArray(entry) ? entry[0] : entry
  if (typeof level === 'number') return level
  return SEVERITY[String(level)] ?? 0
}

function enabledSolidRules(rules: LintRules): Severities {
  return Object.fromEntries(
    Object.entries(rules)
      .filter(([name]) => name.startsWith('solid/'))
      .map(([name, entry]): [string, number] => [name, severityOf(entry)])
      .filter(([, severity]) => severity > 0)
  )
}

const presetRules = enabledSolidRules(v2Strict.rules)
const projectRules = enabledSolidRules(environmentRules)

// O projeto lista as regras uma a uma: uma regra nova do plugin só entra
// quando alguém a acrescenta, e este teste aponta a diferença na atualização.
it('mantém as regras solid/* iguais às do preset v2-strict', () => {
  const sharedRules = Object.fromEntries(
    Object.entries(projectRules).filter(
      ([name]) => !PROJECT_ONLY_RULES.includes(name)
    )
  )

  assert.deepEqual(sharedRules, presetRules)
})

it('liga só no projeto as regras que o preset deixa desligadas', () => {
  for (const name of PROJECT_ONLY_RULES) {
    assert.ok(name in projectRules, `${name} deveria estar ligada`)
    assert.ok(
      !(name in presetRules),
      `${name} agora vem ligada no preset; tire-a das exceções`
    )
  }
})

it('deixa a no-unassigned-vars do core desligada em favor da do Solid', () => {
  assert.equal(v2Strict.rules['no-unassigned-vars'], 0)
  assert.equal(javascriptRules['eslint/no-unassigned-vars'], undefined)
})
