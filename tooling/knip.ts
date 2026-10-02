import path from 'node:path'

import {
  type ModuleRef,
  PageFileSystemRouter,
  type RouteManifestEntry
} from 'filesystem-routing'
import type { KnipConfig } from 'knip'

type DiscoverRouteModulesOptions = {
  directory: string
  production: boolean
}

function isModuleRef(value: unknown): value is ModuleRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'src' in value &&
    typeof value.src === 'string'
  )
}

// Páginas ($component) e handlers HTTP ($GET, $POST…) são entradas: só o
// manifesto do filesystem-routing os importa.
function routeSources(route: RouteManifestEntry): string[] {
  return Object.entries(route).flatMap(([key, value]) =>
    key.startsWith('$') && isModuleRef(value) ? [value.src] : []
  )
}

async function discoverRouteModules({
  directory,
  production
}: DiscoverRouteModulesOptions) {
  const router = new PageFileSystemRouter({
    dir: `${import.meta.dirname}/../${directory}`,
    extensions: ['js', 'jsx', 'ts', 'tsx'],
    httpMethods: true
  })
  const routes = await router.getRoutes()
  const sources = new Set(routes.flatMap(route => routeSources(route)))

  return [...sources].map(
    src =>
      path.relative(`${import.meta.dirname}/..`, src) + (production ? '!' : '')
  )
}

const config = {
  // O env.ts é lido pelo @solidjs/vite-plugin (start.env) para gerar os
  // módulos virtual:env, então nada o importa diretamente.
  entry: [
    'src/App.tsx!',
    'src/Document.tsx!',
    // Entradas autorais do SSR, carregadas pelo @solidjs/vite-plugin por convenção.
    'src/entry-server.tsx!',
    'src/entry-client.tsx!',
    // Entrada SSR do build, ligada pelo plugin local do vite.config.ts.
    'src/entry-handler.ts!',
    'src/middleware/index.ts!',
    'src/infra/server/configureServerErrors/index.ts!',
    // API de transporte do boilerplate; o consumidor atual está na fixture E2E.
    'src/infra/server/requestJson/index.ts!',
    'tooling/testing/server-only.ts',
    'env.ts!',
    'tooling/testing/error-backend.ts',
    // globalTeardown do Playwright, referenciado por caminho em tooling/playwright.ts.
    'tooling/testing/server-log-teardown.ts',
    // Cadeia de middleware do build E2E, escolhida por modo no vite.config.ts.
    'src/tests/fixtures/e2e/middleware/index.ts',
    // Testes de tipo: checados pelo tsc, sem execução no Vitest.
    'src/**/*.test-d.{ts,tsx}'
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
  // O Kingfisher é externo; vp e knip são ferramentas de desenvolvimento.
  ignoreBinaries: ['kingfisher', 'vp!', 'knip!'],
  treatConfigHintsAsErrors: true
} satisfies KnipConfig

export default async function configureKnip(): Promise<KnipConfig> {
  const [pages, fixtures, e2ePages] = await Promise.all([
    discoverRouteModules({ directory: 'src/routes', production: true }),
    discoverRouteModules({
      directory: 'src/tests/fixtures/routes',
      production: false
    }),
    discoverRouteModules({
      directory: 'src/tests/fixtures/e2e/routes',
      production: false
    })
  ])

  return {
    ...config,
    entry: [...config.entry, ...pages, ...fixtures, ...e2ePages]
  }
}
