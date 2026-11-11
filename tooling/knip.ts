import path from 'node:path'

import {
  type ModuleRef,
  PageFileSystemRouter,
  type RouteManifestEntry
} from 'filesystem-routing'
import { DEFAULT_EXTENSIONS } from 'filesystem-routing/vite'
import type { KnipConfig } from 'knip'

type DiscoverRouteModulesOptions = {
  directory: string
  isProduction: boolean
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
  isProduction
}: DiscoverRouteModulesOptions) {
  const router = new PageFileSystemRouter({
    dir: `${import.meta.dirname}/../${directory}`,
    // O fileRoutes do vite.config.ts usa esta mesma lista padrão.
    extensions: DEFAULT_EXTENSIONS,
    httpMethods: true
  })
  const routes = await router.getRoutes()
  const sources = new Set(routes.flatMap(route => routeSources(route)))

  return [...sources].map(
    src =>
      path.relative(`${import.meta.dirname}/..`, src) +
      (isProduction ? '!' : '')
  )
}

const config = {
  // O env.ts é lido pelo @solidjs/vite-plugin (opção env) para gerar os
  // módulos virtual:solid-env, então nada o importa diretamente.
  entry: [
    // Entradas autorais do SSR, carregadas pelo @solidjs/vite-plugin por convenção.
    // O plugin do Knip só lê solid() importado estaticamente, e o vite.config.ts
    // o carrega com import(); por isso estas entradas, o middleware e o
    // serverSetup ficam aqui (webpro-nl/knip#2147).
    'src/entry-server.tsx!',
    'src/entry-client.tsx!',
    // O runtime gerado carrega o polyfill de URLPattern do pacote Paraglide
    // quando a API nativa falta.
    'paraglide/runtime.js!',
    'src/middleware/index.ts!',
    'src/infra/server/configureServerErrors/index.ts!',
    // API de transporte do boilerplate; o consumidor atual está na fixture E2E.
    'src/infra/server/requestJson/index.ts!',
    // API pública de configuração e métricas; fixtures exercitam os consumidores.
    'src/infra/server/publication/index.ts!',
    // Componentes e APIs públicas reutilizáveis, exercitados pelas fixtures.
    'src/components/atoms/Input/index.tsx!',
    'src/components/atoms/Textarea/index.tsx!',
    'src/components/molecules/Dialog/index.tsx!',
    'src/components/atoms/ToastProvider/useToast/index.ts!',
    'src/primitives/createLocalizedNavigate/index.ts!',
    'src/i18n/localizedRedirect/index.ts!',
    'src/primitives/createOutdatedPageGuard/index.ts!',
    'env.ts!',
    // Cadeia de middleware do build E2E, escolhida por modo no vite.config.ts.
    'src/tests/fixtures/e2e/middleware/index.ts'
  ],
  project: [
    'src/**/*.{ts,tsx}!',
    'tooling/**/*.ts',
    '!src/tests/**!',
    '!src/**/__tests__/**!',
    '!src/**/*.test.{ts,tsx}!'
  ],
  // A config fica fora do caminho padrão e roda por tooling/css/check.ts.
  stylelint: {
    config: ['tooling/css/stylelint.config.mjs']
  },
  // O plugin trata todo arquivo de src/routes como entrada e esconderia
  // helpers colocalizados sem uso; discoverRouteModules seleciona só as rotas.
  'filesystem-routing': false,
  // O Kingfisher é externo. O vp do script start vem de uma devDependency, que
  // o modo production (ativado pelo --strict) não considera; o '!' restringe o
  // ignore a esse modo, porque na execução padrão ele viraria hint de redundância.
  ignoreBinaries: ['kingfisher', 'vp!'],
  // A regressão resolve srvx pela árvore do Nitro para testar o adapter real,
  // sem fixar uma segunda cópia como dependência direta do projeto.
  ignoreIssues: {
    'src/middleware/securityHeaders/__tests__/securityHeaders.node.test.ts': [
      'unlisted'
    ]
  },
  treatConfigHintsAsErrors: true
} satisfies KnipConfig

export default async function configureKnip(): Promise<KnipConfig> {
  const [pages, fixtures, e2ePages] = await Promise.all([
    discoverRouteModules({ directory: 'src/routes', isProduction: true }),
    discoverRouteModules({
      directory: 'src/tests/fixtures/routes',
      isProduction: false
    }),
    discoverRouteModules({
      directory: 'src/tests/fixtures/e2e/routes',
      isProduction: false
    })
  ])

  return {
    ...config,
    entry: [...config.entry, ...pages, ...fixtures, ...e2ePages]
  }
}
