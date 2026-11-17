import assert from 'node:assert/strict'
import { it } from 'node:test'

import v2Strict from 'eslint-plugin-solid/configs/v2-strict'

import type { LintRules } from '../../types.ts'
import { environmentRules } from '../environment.ts'
import { javascriptRules } from '../javascript.ts'

type RuleEntry = LintRules[string]
type Severities = Record<string, number>

// Off in every preset of the plugin; the project turns it on by choice.
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

// The project lists the rules one by one: a new plugin rule only enters when
// someone adds it, and this test points out the difference on an update.
it('keeps the solid/* rules equal to the ones of the v2-strict preset', () => {
  const sharedRules = Object.fromEntries(
    Object.entries(projectRules).filter(
      ([name]) => !PROJECT_ONLY_RULES.includes(name)
    )
  )

  assert.deepEqual(sharedRules, presetRules)
})

it('turns on in the project only the rules that the preset leaves off', () => {
  for (const name of PROJECT_ONLY_RULES) {
    assert.ok(name in projectRules, `${name} should be on`)
    assert.ok(
      !(name in presetRules),
      `${name} now comes on in the preset; remove it from the exceptions`
    )
  }
})

it('leaves the core no-unassigned-vars off in favor of the Solid one', () => {
  assert.equal(v2Strict.rules['no-unassigned-vars'], 0)
  assert.equal(javascriptRules['eslint/no-unassigned-vars'], undefined)
})
