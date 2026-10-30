import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import stylelint from 'stylelint'
import { RuleTester } from 'vite-plus/lint/plugins-dev'

import plugin from '../../project-plugin.ts'
import { cssFilenameError } from '../css-filename.ts'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

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
    const rule = plugin.rules['css-filename']
    assert.ok(rule)
    new RuleTester({ cwd: ROOT }).run('css-filename', rule, {
      valid: [
        'import S from "@/routes/styles.module.css"',
        'import "/src/theme/tokens/zIndex.css"',
        'import "./routes/styles.module.css"',
        'import "external/styles.css"',
        'export { default } from "@/routes/styles.module.css"',
        'export * from "/src/theme/tokens/zIndex.css"',
        'void import("@/routes/styles.module.css?inline")',
        'void import(`@/routes/styles.module.css`)',
        'void import(source)'
      ].map(code => ({ filename: 'src/App.tsx', code })),
      invalid: [
        'import S from "@/routes/home.module.css?inline"',
        'export { default } from "@/routes/home.module.css"',
        'export * from "@/routes/home.module.css"',
        'void import("@/routes/home.module.css")',
        'void import(`@/routes/home.module.css`)'
      ].map(code => ({
        filename: 'src/App.tsx',
        code,
        errors: [
          {
            message:
              'Use styles.module.css fora de src/theme/, inclusive nas rotas.'
          }
        ]
      }))
    })
  })
})

describe('css module imports', () => {
  it('requires a single default import named S', () => {
    const rule = plugin.rules['css-modules-import']
    assert.ok(rule)
    new RuleTester({ cwd: ROOT }).run('css-modules-import', rule, {
      valid: [
        'import S from "./styles.module.css"',
        'import S from "./styles.module.css?inline"',
        'import "./global.css"',
        'import styles from "./global.css"'
      ].map(code => ({ filename: 'src/App.tsx', code })),
      invalid: [
        'import styles from "./styles.module.css"',
        'import "./styles.module.css"',
        'import S, { root } from "./styles.module.css"',
        'import * as S from "./styles.module.css"'
      ].map(code => ({
        filename: 'src/App.tsx',
        code,
        errors: [{ messageId: 'useS' }]
      }))
    })
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

  it('rejects literal colors in any property and raw font shorthands', async () => {
    for (const { code, rule } of [
      { code: '.a { border-block-end: 1px solid red; }', rule: 'color-named' },
      {
        code: '.a { border-inline-start: 1px solid #f00; }',
        rule: 'color-no-hex'
      },
      {
        code: '.a { text-decoration: underline oklch(0.6 0.2 25); }',
        rule: 'function-disallowed-list'
      },
      {
        code: '.a { font: 600 14px sans-serif; }',
        rule: 'scale-unlimited/declaration-strict-value'
      },
      {
        code: '.a { background-image: linear-gradient(var(--color-primary), var(--color-secondary)); }',
        rule: 'scale-unlimited/declaration-strict-value'
      }
    ]) {
      const rules = await lint(code)
      assert.ok(rules.includes(rule), code)
    }
    assert.deepEqual(
      await lint('.a { font: inherit; background: currentcolor; }'),
      []
    )
  })

  it('rejects unknown pseudo-elements and type selectors', async () => {
    const pseudoElement = await lint(
      '.a { &::placholder { color: var(--color-primary); } }'
    )
    assert.ok(pseudoElement.includes('selector-pseudo-element-no-unknown'))
    const type = await lint('dvi.a { color: var(--color-primary); }')
    assert.ok(type.includes('selector-type-no-unknown'))
    assert.deepEqual(
      await lint(
        '.a { &::placeholder { color: var(--color-primary); } & svg { fill: currentcolor; } }'
      ),
      []
    )
  })
})
