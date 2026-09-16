/* oxlint-disable vitest/no-import-node-test -- Os testes de tooling usam o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import stylelint from 'stylelint'

import plugin, { cssFilenameError } from '../../css-modules-plugin.ts'

describe('css filenames', () => {
  it('checks theme boundaries and module names', () => {
    for (const file of [
      'src/routes/styles.module.css',
      'src/theme/tokens/zIndex.css'
    ]) {
      assert.equal(cssFilenameError(file), undefined)
    }
    for (const file of [
      'src/routes/home.module.css',
      'src/theme/tokens/z-index.css',
      'src/themeOther/colors.css'
    ]) {
      assert.ok(cssFilenameError(file))
    }
  })
  it('checks imports, reexports and dynamic imports through the Oxlint rule', () => {
    const reports: unknown[] = []
    const listeners = plugin.rules['css-filename'].create({
      cwd: '/repo',
      filename: '/repo/src/App.tsx',
      report: item => reports.push(item)
    })
    for (const listener of Object.values(listeners)) {
      listener({ source: { value: '@/routes/home.module.css?inline' } })
      listener({ source: { value: '/src/theme/tokens/zIndex.css' } })
      listener({ source: { value: './routes/styles.module.css' } })
      listener({ source: { value: 'external/styles.css' } })
    }
    assert.equal(reports.length, Object.keys(listeners).length)
  })
})

async function lint(code: string): Promise<string[]> {
  const result = await stylelint.lint({
    code,
    codeFilename: 'styles.module.css',
    configFile: fileURLToPath(
      new URL('../stylelint.config.mjs', import.meta.url)
    )
  })
  return result.results.flatMap(item =>
    item.warnings.map(warning => warning.rule)
  )
}

describe('stylelint css policy', () => {
  it('accepts snake_case and rejects hyphens, camelCase and PascalCase', async () => {
    assert.deepEqual(
      await lint('.variant_default { color: var(--color-primary); }'),
      []
    )
    for (const selector of [
      'btn-primary',
      'btnPrimary',
      'BtnPrimary',
      'btn__primary',
      'btn_primary_'
    ]) {
      const rules = await lint(`.${selector} { color: var(--color-primary); }`)
      assert.ok(rules.includes('selector-class-pattern'))
    }
  })

  it('allows two nested levels and rejects a third', async () => {
    assert.deepEqual(
      await lint(
        '.card { &:hover { & > span { color: var(--color-primary); } } }'
      ),
      []
    )
    const rules = await lint(
      '.card { &:hover { & > span { & > a { color: var(--color-primary); } } } }'
    )
    assert.ok(rules.includes('max-nesting-depth'))
  })

  it('requests nesting for adjacent state selectors and media queries', async () => {
    const states = await lint(
      '.card { color: var(--color-primary); } .card:hover { color: var(--color-secondary); }'
    )
    assert.ok(states.includes('csstools/use-nesting'))
    const media = await lint(
      '.card { color: var(--color-primary); } @media (width > 600px) { .card { color: var(--color-secondary); } }'
    )
    assert.ok(media.includes('csstools/use-nesting'))
  })

  it('accepts native nesting and rejects an ampersand without a parent', async () => {
    assert.deepEqual(
      await lint(
        '.card { color: var(--color-primary); &:hover { color: var(--color-secondary); } @media (width > 600px) { color: var(--color-foreground); } }'
      ),
      []
    )
    const rules = await lint('&:hover { color: var(--color-primary); }')
    assert.ok(rules.includes('nesting-selector-no-missing-scoping-root'))
  })
})
