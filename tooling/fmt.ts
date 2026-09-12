import type { UserConfig } from 'vite-plus'

export const fmt: NonNullable<UserConfig['fmt']> = {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  singleQuote: true,
  jsxSingleQuote: false,
  quoteProps: 'as-needed',
  semi: false,
  trailingComma: 'none',
  arrowParens: 'avoid',
  bracketSpacing: true,
  objectWrap: 'preserve',
  proseWrap: 'always',
  endOfLine: 'lf',
  insertFinalNewline: true,
  sortPackageJson: false,
  embeddedLanguageFormatting: 'off',
  sortImports: {
    groups: [
      'builtin',
      'external',
      ['internal', 'subpath'],
      ['parent', 'sibling', 'index'],
      'style',
      'unknown'
    ],
    sortSideEffects: false
  },
  ignorePatterns: [
    '**/*.svg',
    '*.lock',
    'pnpm-lock.yaml',
    'AGENTS.md',
    'dist/**',
    'dist-ssr/**',
    '.nitro/**',
    '.output/**',
    '.vercel/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**'
  ]
}
