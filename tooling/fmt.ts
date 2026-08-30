import type { UserConfig } from 'vite-plus'

export const fmt: NonNullable<UserConfig['fmt']> = {
  printWidth: 80,
  singleQuote: true,
  semi: false,
  trailingComma: 'none',
  arrowParens: 'avoid',
  sortPackageJson: false,
  embeddedLanguageFormatting: 'off',
  sortImports: {
    groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']]
  },
  ignorePatterns: [
    '*.lock',
    'AGENTS.md',
    'dist/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**'
  ]
}
