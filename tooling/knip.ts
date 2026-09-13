import type { KnipConfig } from 'knip'

const config = {
  // env.ts is read by @solidjs/vite-plugin (start.env) to generate the
  // virtual:env modules, so nothing imports it directly.
  entry: ['src/App.tsx!', 'src/Document.tsx!', 'src/middleware.ts!', 'env.ts!'],
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
