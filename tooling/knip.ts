import path from 'node:path'

import { PageFileSystemRouter } from 'filesystem-routing'
import type { KnipConfig } from 'knip'

async function discoverPages(directory: string, production: boolean) {
  const router = new PageFileSystemRouter({
    dir: `${import.meta.dirname}/../${directory}`,
    extensions: ['js', 'jsx', 'ts', 'tsx']
  })
  const routes = await router.getRoutes()

  return routes.flatMap(route =>
    route.$component
      ? [
          path.relative(`${import.meta.dirname}/..`, route.$component.src) +
            (production ? '!' : '')
        ]
      : []
  )
}

const config = {
  // O env.ts é lido pelo @solidjs/vite-plugin (start.env) para gerar os
  // módulos virtual:env, então nada o importa diretamente.
  entry: [
    'src/App.tsx!',
    'src/Document.tsx!',
    'src/middleware.ts!',
    'env.ts!',
    'tooling/testing/error-backend.ts'
  ],
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
  // O modo strict varre a própria config como produção, mas o scanner é tooling de build.
  ignoreIssues: { 'tooling/knip.ts': ['unlisted'] },
  // eslint-plugin-solid entra por jsPlugins em tooling/lint.ts; os plugins de
  // stylelint são nomes em tooling/css/stylelint.config.mjs, que o knip não resolve.
  ignoreDependencies: [
    'eslint-plugin-solid',
    'stylelint-declaration-strict-value',
    'stylelint-use-nesting'
  ],
  // O Kingfisher é instalado externamente; o vp vem de uma devDependency.
  ignoreBinaries: ['kingfisher', 'vp!'],
  treatConfigHintsAsErrors: true
} satisfies KnipConfig

export default async function configureKnip(): Promise<KnipConfig> {
  const [pages, fixtures, e2ePages] = await Promise.all([
    discoverPages('src/routes', true),
    discoverPages('src/tests/fixtures/routes', false),
    discoverPages('src/tests/fixtures/e2e/routes', false)
  ])

  return {
    ...config,
    entry: [...config.entry, ...pages, ...fixtures, ...e2ePages]
  }
}
