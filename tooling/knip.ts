import type { KnipConfig } from 'knip'

const config = {
  entry: ['src/App.tsx!', 'src/Document.tsx!', 'src/middleware.ts!'],
  project: [
    'src/**/*.{ts,tsx}!',
    'tooling/**/*.ts',
    '!src/tests/**!',
    '!src/**/*.test.{ts,tsx}!'
  ],
  vitest: {
    config: ['vite.config.ts']
  },
  playwright: {
    config: ['tooling/playwright.ts']
  },
  ignoreUnresolved: ['^~icons/'],
  // Loaded through jsPlugins in tooling/lint.ts.
  ignoreDependencies: ['eslint-plugin-solid'],
  // Kingfisher is installed externally; vp is provided by a devDependency.
  ignoreBinaries: ['kingfisher', 'vp!'],
  treatConfigHintsAsErrors: true
} satisfies KnipConfig

export default config
