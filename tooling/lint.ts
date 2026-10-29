import type { UserConfig } from 'vite-plus'

import backendPolicy from './backendPolicy/index.ts'
import { environmentRules } from './lint/rules/environment.ts'
import { importRules } from './lint/rules/imports.ts'
import { javascriptRules } from './lint/rules/javascript.ts'
import { testRules } from './lint/rules/testing.ts'
import { typescriptRules } from './lint/rules/typescript.ts'
import { unicornRules } from './lint/rules/unicorn.ts'

const TEST_FILES = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.test-d.ts',
  '**/*.test-d.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/test/**',
  '**/tests/**',
  '**/fixtures/**'
]

export const lint: NonNullable<UserConfig['lint']> = {
  ignorePatterns: [
    'public/**',
    'src/assets/**',
    'src/@types/routes.d.ts',
    'paraglide/**',
    'project.inlang/cache/**',
    '.paraglide/**',
    '.agents/**',
    '.claude/**'
  ],
  categories: {
    correctness: 'off',
    nursery: 'off',
    pedantic: 'off',
    perf: 'off',
    restriction: 'off',
    style: 'off',
    suspicious: 'off'
  },
  jsPlugins: [
    { name: 'project', specifier: './tooling/css-modules-plugin.ts' },
    { name: 'backend', specifier: './tooling/backendPolicy/plugin.ts' },
    {
      name: 'architecture',
      specifier: './tooling/architecturePolicy/index.ts'
    },
    { name: 'paraglide', specifier: '@inlang/paraglide-js/eslint' },
    { name: 'solid', specifier: 'eslint-plugin-solid' },
    { name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }
  ],
  options: {
    typeAware: true,
    typeCheck: true,
    denyWarnings: true,
    reportUnusedDisableDirectives: 'error'
  },
  overrides: [
    ...backendPolicy,
    {
      files: ['src/infra/server/**/index.ts'],
      rules: {
        'import/no-unassigned-import': ['error', { allow: ['server-only'] }]
      }
    },
    {
      files: [
        'src/__tests__/PageFileSystemRouter.node.test.ts',
        'src/tests/pages/AgentReadiness/AgentReadiness.build.production.e2e.test.ts',
        'src/tests/pages/BackendError/BackendError.e2e.test.ts',
        'src/tests/pages/FragmentCss/FragmentCss.e2e.test.ts',
        'src/tests/pages/Hydration/Hydration.parser.e2e.test.ts',
        'src/tests/pages/Hydration/Hydration.preload.e2e.test.ts',
        'src/tests/pages/OutsideError/OutsideError.e2e.test.ts',
        'src/tests/pages/I18n/I18n.production.e2e.test.ts',
        'src/tests/pages/SeoIndexes/SeoIndexes.production.e2e.test.ts',
        'src/tests/helpers/readSiteOrigin/index.ts'
      ],
      rules: { 'import/no-nodejs-modules': 'off' }
    },
    {
      files: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.test-d.{ts,tsx}',
        'tooling/**/*.test.ts'
      ],
      rules: { 'unicorn/filename-case': 'off' }
    },
    {
      // Callbacks de teste e hooks de plugin do Vite seguem assinaturas de
      // terceiros, que podem exigir mais de dois parâmetros.
      files: [
        'src/**/*.test.{ts,tsx}',
        'src/tests/**/*.{ts,tsx}',
        'tooling/**/__tests__/**/*.ts',
        'tooling/i18n/i18nPlugin/index.ts',
        'vite.config.ts'
      ],
      rules: { 'eslint/max-params': 'off' }
    },
    {
      files: ['src/@types/icons.d.ts'],
      rules: {
        'import/unambiguous': 'off'
      }
    },
    {
      files: ['src/**/*.tsx'],
      rules: {
        'typescript/explicit-module-boundary-types': 'off'
      }
    },
    {
      files: [
        'src/@types/solid.d.ts',
        'src/@types/env.d.ts',
        'src/@types/router.d.ts'
      ],
      rules: {
        'import/no-unassigned-import': 'off',
        // Estas declarações ampliam interfaces de terceiros por declaration merging.
        'typescript/consistent-type-definitions': ['error', 'interface']
      }
    },

    {
      files: TEST_FILES,
      rules: {
        'eslint/no-empty': 'off',
        'vitest/require-hook': 'error'
      }
    },
    {
      files: ['**/*.{test,spec}.{ts,tsx}'],
      rules: {
        'typescript/no-floating-promises': 'off',
        'typescript/no-misused-promises': 'off'
      }
    },
    {
      files: ['**/*.{ts,tsx,mts,cts}'],
      rules: {
        'eslint/no-undef': 'off'
      }
    },
    {
      files: ['vite.config.ts', 'tooling/**/*.ts'],
      rules: {
        'import/no-nodejs-modules': 'off'
      }
    },
    {
      files: ['src/App.tsx', 'src/Document.tsx'],
      rules: {
        'unicorn/filename-case': 'off'
      }
    },
    {
      files: [
        'src/tests/fixtures/e2e/middleware/index.ts',
        'src/middleware/localizeRequest/index.ts'
      ],
      rules: {
        'node/callback-return': 'off'
      }
    }
  ],
  plugins: [
    'import',
    'jsx-a11y',
    'node',
    'oxc',
    'promise',
    'typescript',
    'unicorn',
    'vitest'
  ],
  rules: {
    ...environmentRules,
    ...javascriptRules,
    ...importRules,
    ...typescriptRules,
    ...unicornRules,
    ...testRules
  },
  settings: {
    'jsx-a11y': {
      attributes: {
        for: ['htmlFor', 'for']
      }
    },
    solid: { version: 2 }
  }
}
