import type { UserConfig } from 'vite-plus'

export const fmt: NonNullable<UserConfig['fmt']> = {
  printWidth: 80,
  singleQuote: true,
  semi: false,
  trailingComma: 'none',
  arrowParens: 'avoid',
  proseWrap: 'always',
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
    'public/**',
    'src/assets/**',
    'src/@types/routes.d.ts',
    'paraglide/**',
    'project.inlang/cache/**',
    '.paraglide/**',
    '**/*.svg',
    '*.lock',
    'AGENTS.md',
    'dist/**',
    'dist-ssr/**',
    '.nitro/**',
    '.output/**',
    '.vercel/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    '.agents/**',
    '.claude/**'
  ]
}
