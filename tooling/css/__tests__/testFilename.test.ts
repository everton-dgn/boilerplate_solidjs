/* oxlint-disable vitest/no-import-node-test -- Os testes de tooling usam o runner nativo do Node.js. */
/* oxlint-disable vitest/prefer-each -- O runner nativo do Node.js não tem a API it.each. */
import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'

import plugin from '../../css-modules-plugin.ts'
import { testFilenameError } from '../../test-filename.ts'

type Report = {
  node: object
  message: string
}

describe('test filename policy', () => {
  const validTestPaths = [
    'src/components/atoms/DropdownMenu/__tests__/DropdownMenu.browser.test.tsx',
    'src/helpers/isTheme/__tests__/isTheme.node.test.ts',
    'src/infra/adapters/themeStorage/__tests__/themeStorage.dom.test.ts',
    'src/primitives/createTheme/__tests__/createTheme.dom.test.tsx',
    'src/__tests__/App.dom.test.tsx',
    'src/middleware/__tests__/middleware.node.test.ts',
    'src/__tests__/PageFileSystemRouter.node.test.ts',
    'src/tests/pages/Home/Home.themeCss.e2e.test.ts',
    'src/tests/pages/NotFound/NotFound.e2e.test.ts',
    'src/tests/pages/BackendError/BackendError.e2e.test.ts',
    'src/tests/pages/StructuredData/StructuredData.streaming.e2e.test.ts',
    'tooling/release/__tests__/automatic-release.test.ts',
    'tooling/css/__tests__/cssPolicy.test.ts',
    'tooling/css/__tests__/testFilename.test.ts',
    'src/components/NewWidget/__tests__/NewWidget.focus.dom.test.tsx'
  ]

  const invalidTestPaths = [
    'src/components/DropdownMenu/__tests__/dropdown-menu.browser.test.tsx',
    'src/components/DropdownMenu/__tests__/dropdownMenu.browser.test.tsx',
    'src/components/DropdownMenu/__tests__/ThemeToggle.browser.test.tsx',
    'src/helpers/isTheme/__tests__/theme.node.test.ts',
    'src/components/DropdownMenu/__tests__/DropdownMenu.test.tsx',
    'src/components/DropdownMenu/__tests__/DropdownMenu.dom.spec.tsx',
    'src/components/DropdownMenu/__tests__/DropdownMenu.dom.test.js',
    'src/components/DropdownMenu/__tests__/DropdownMenu.e2e.test.ts',
    'src/tests/pages/Home/Home.theme-css.e2e.test.ts',
    'src/tests/pages/Home/Home.Theme.e2e.test.ts',
    'src/tests/pages/Home/Home..e2e.test.ts',
    'src/tests/pages/Unknown.e2e.test.ts',
    'src/tests/pages/Home.e2e.test.ts',
    'src/tests/pages/Home/NotFound.e2e.test.ts',
    'src/tests/pages/Home/nested/Home.e2e.test.ts',
    'src/tests/pages/Unknown/Unknown.e2e.test.ts',
    'src/tests/pages/Home/Home.dom.test.tsx',
    'src/__tests__/app.dom.test.tsx',
    'src/__tests__/Other.dom.test.tsx',
    'src/Unknown.dom.test.tsx',
    'src/components/Button/__tests__/index.ts',
    'tooling/release/__tests__/automaticRelease.test.ts',
    'tooling/css/__tests__/audit.test.ts'
  ]

  const ignoredPaths = [
    'src/App.tsx',
    'src/tests/fixtures/routes/index.tsx',
    'tooling/lint.ts',
    '../src/__tests__/bad.test.ts',
    'node_modules/lib/bad.test.ts'
  ]

  for (const testPath of validTestPaths) {
    it(`accepts ${testPath}`, () => {
      const windowsPath = testPath.replaceAll('/', '\\')

      assert.equal(testFilenameError(testPath), undefined)
      assert.equal(testFilenameError(windowsPath), undefined)
    })
  }

  for (const testPath of invalidTestPaths) {
    it(`rejects ${testPath}`, () => {
      const error = testFilenameError(testPath)

      assert.equal(typeof error, 'string')
    })
  }

  it('ignores production, fixtures and paths outside the project scope', () => {
    for (const ignoredPath of ignoredPaths) {
      assert.equal(testFilenameError(ignoredPath), undefined)
    }
  })

  it('reports on Program, including an empty test, with the configured plugin', () => {
    const reports: Report[] = []
    const programNode = {}
    const cwd = path.resolve('/project')
    const rule = plugin.rules['test-filename']

    for (const subjectName of ['Button', 'button']) {
      const filename = path.join(
        cwd,
        `src/components/Button/__tests__/${subjectName}.dom.test.tsx`
      )
      const listeners = rule.create({
        cwd,
        filename,
        report: diagnostic => reports.push(diagnostic)
      })

      listeners.Program(programNode)
    }

    assert.equal(reports.length, 1)

    const [report] = reports
    assert.equal(report?.node, programNode)
    assert.match(report.message, /Button/u)
  })
})
