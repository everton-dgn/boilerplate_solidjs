/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import { RuleTester } from 'vite-plus/lint/plugins-dev'

import plugin from '../../css-modules-plugin.ts'
import { lint } from '../../lint.ts'
import { noExportList } from '../index.ts'

const ROOT = path.resolve(import.meta.dirname, '../../..')

test('o plugin project registra a regra e o lint a ativa como erro', () => {
  assert.equal(plugin.rules['no-export-list'], noExportList)
  assert.equal(lint.rules?.['project/no-export-list'], 'error')
})

test('a regra aceita export inline e reexport com from', () => {
  new RuleTester({ cwd: ROOT }).run('no-export-list', noExportList, {
    valid: [
      'export { default } from "@/routes/(base).tsx"',
      'export { default, route } from "@/routes/(base)/(home)/index.tsx"',
      'export { GET } from "@/routes/(seo)/robots.txt/index.ts"',
      'export { value as alias } from "./value.ts"',
      'export type { Theme } from "./types.ts"',
      'export * from "./value.ts"',
      'export * as values from "./value.ts"',
      'export default function page() { return 1 }',
      'const value = 1\nexport default value',
      'export function run() { return 1 }',
      'export async function load() { return 1 }',
      'export const value = 1',
      'export const [first] = [1]',
      'export type Props = { label: string }',
      'export class Store {}',
      'const local = 1\nconsole.log(local)'
    ].map(code => ({ filename: 'src/probe.ts', code })),
    invalid: [
      'const value = 1\nexport { value }',
      'const value = 1\nexport { value as alias }',
      'const value = 1\nexport { value as default }',
      'function run() { return 1 }\nconst value = 1\nexport { run, value }',
      'type Theme = string\nexport type { Theme }',
      'type Theme = string\nconst value = 1\nexport { value, type Theme }',
      'export {}'
    ].map(code => ({
      filename: 'src/probe.ts',
      code,
      errors: [{ messageId: 'inlineExport' }]
    }))
  })
})
