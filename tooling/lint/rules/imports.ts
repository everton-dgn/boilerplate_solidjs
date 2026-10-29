import type { LintRules } from '../types.ts'

export const importRules: LintRules = {
  'import/consistent-type-specifier-style': [
    'error',
    'prefer-top-level-if-only-type-imports'
  ],
  'import/default': 'error',
  'import/export': 'error',
  'import/exports-last': 'error',
  'import/extensions': ['error', 'ignorePackages'],
  'import/first': 'error',
  'import/named': 'error',
  'import/namespace': 'error',
  'import/newline-after-import': 'error',
  'import/no-absolute-path': 'error',
  'import/no-amd': 'error',
  'import/no-anonymous-default-export': 'error',
  'import/no-commonjs': 'error',
  'import/no-cycle': 'error',
  'import/no-duplicates': ['error', { preferInline: true }],
  'import/no-dynamic-require': 'error',
  'import/no-empty-named-blocks': 'error',
  'import/no-mutable-exports': 'error',
  'import/no-named-as-default': 'error',
  'import/no-named-as-default-member': 'error',
  'import/no-named-default': 'error',
  'import/no-namespace': ['error', { ignore: ['valibot'] }],
  'import/no-nodejs-modules': 'error',
  'import/no-self-import': 'error',
  'import/no-unassigned-import': ['error', { allow: ['**/*.css'] }],
  'import/no-webpack-loader-syntax': 'error',
  'import/unambiguous': 'error'
}
