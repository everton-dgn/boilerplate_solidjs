import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import * as v from 'valibot'

import { lintFixture } from '../../testing/lintFixture/index.ts'

const DIAGNOSTIC = v.object({ filename: v.string(), code: v.string() })
const DIAGNOSTICS = v.object({ diagnostics: v.array(DIAGNOSTIC) })

test('o lint reconhece o alias do Paraglide e exige referências estáticas às mensagens', context => {
  const fixtures = {
    dynamic:
      'import { m } from "@paraglide/messages.js"; export const read = key => m[key]()',
    alias:
      'import { m as messages } from "@paraglide/messages.js"; export const read = key => messages[key]()',
    spread:
      'import { m } from "@paraglide/messages.js"; export const copy = { ...m }',
    namespace:
      'import * as messages from "@paraglide/messages/_index.js"; export const read = key => messages[key]()',
    'namespace-static':
      'import * as messages from "@paraglide/messages/_index.js"; export const read = () => messages.home_title()',
    static:
      'import { m } from "@paraglide/messages.js"; export const read = () => m.home_title()',
    map: 'import { m } from "@paraglide/messages.js"; const messages = { title: m.home_title }; export const read = key => messages[key]()',
    shadow:
      'import { m } from "@paraglide/messages.js"; export const title = () => m.home_title(); export const read = (m, key) => m[key]()'
  }
  const result = lintFixture({
    context,
    sources: Object.fromEntries(
      Object.entries(fixtures).map(([name, content]) => [
        `src/${name}.ts`,
        content
      ])
    )
  })
  assert.equal(result.status, 1, result.stderr)
  const { diagnostics } = v.parse(DIAGNOSTICS, JSON.parse(result.stdout))
  const violations = diagnostics.filter(
    item => item.code === 'paraglide(no-dynamic-message-access)'
  )
  assert.deepEqual(
    violations.map(item => path.basename(item.filename)).toSorted(),
    ['alias.ts', 'dynamic.ts', 'namespace.ts', 'spread.ts']
  )
})
