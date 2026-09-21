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
    'src/middleware/index.ts!',
    'src/infra/server/configureServerErrors/index.ts!',
    // API de transporte do boilerplate; o consumidor atual está na fixture E2E.
    'src/infra/server/requestJson/index.ts!',
    // JSON-LD por página do boilerplate; o consumidor atual está na fixture E2E.
    'src/components/atoms/StructuredData/index.tsx!',
    'tooling/testing/server-only.ts',
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
