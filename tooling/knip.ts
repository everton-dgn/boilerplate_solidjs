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
    // O fileRoutes do vite.config.ts usa esta mesma lista padrão.
    extensions: DEFAULT_EXTENSIONS,
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
    // Entradas autorais do SSR, carregadas pelo @solidjs/vite-plugin por convenção.
    // O plugin do Knip só lê solid() importado estaticamente, e o vite.config.ts
    // o carrega com import(); por isso estas entradas, o middleware e o
    // configure ficam aqui (webpro-nl/knip#2147).
    'src/entry-server.tsx!',
    'src/entry-client.tsx!',
    // O runtime gerado importa o polyfill de URLPattern do pacote Paraglide.
    'paraglide/runtime.js!',
    'src/middleware/index.ts!',
    'src/infra/server/configureServerErrors/index.ts!',
    // API de transporte do boilerplate; o consumidor atual está na fixture E2E.
    'src/infra/server/requestJson/index.ts!',
    // Componentes e APIs públicas reutilizáveis, exercitados pelas fixtures.
    'src/components/atoms/Input/index.tsx!',
    'src/components/atoms/Textarea/index.tsx!',
    'src/components/molecules/Dialog/index.tsx!',
    'src/components/atoms/ToastProvider/useToast/index.ts!',
    'src/primitives/createLocalizedNavigate/index.ts!',
    'src/i18n/localizedRedirect/index.ts!',
    'env.ts!',
    // Cadeia de middleware do build E2E, escolhida por modo no vite.config.ts.
    'src/tests/fixtures/e2e/middleware/index.ts',
    // A CI roda a prova com `vp exec node`, que o plugin de GitHub Actions do
    // Knip não reconhece como execução de arquivo.
    'tooling/ciReuse/prove-reuse.ts'
  ],
  project: [
    'src/**/*.{ts,tsx}!',
    'tooling/**/*.ts',
    '!src/tests/**!',
    '!src/**/*.test.{ts,tsx}!'
  ],
  // A config fica fora do caminho padrão e roda por tooling/css/check.ts.
  stylelint: {
    config: ['tooling/css/stylelint.config.mjs']
  },
  // O plugin trata todo arquivo de src/routes como entrada e esconderia
  // helpers colocalizados sem uso; discoverRouteModules seleciona só as rotas.
  'filesystem-routing': false,
  // O Kingfisher é externo; o vp do script start vem de uma devDependency.
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
