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

// Pages ($component) and HTTP handlers ($GET, $POST…) are entries: only the
// filesystem-routing manifest imports them.
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
    // The fileRoutes of vite.config.ts uses this same default list.
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
  // env.ts is read by @solidjs/vite-plugin (env option) to generate the
  // virtual:solid-env modules, so nothing imports it directly.
  entry: [
    // Authored SSR entries, loaded by @solidjs/vite-plugin by convention. The
    // Knip plugin only reads a statically imported solid(), and vite.config.ts
    // loads it with import(); that is why these entries, the middleware and
    // serverSetup stay here (webpro-nl/knip#2147).
    'src/entry-server.tsx!',
    'src/entry-client.tsx!',
    // The generated runtime loads the URLPattern polyfill of the Paraglide
    // package when the native API is missing.
    'paraglide/runtime.js!',
    'src/middleware/index.ts!',
    'src/infra/server/configureServerErrors/index.ts!',
    // Transport API of the boilerplate; the current consumer is in the E2E fixture.
    'src/infra/server/requestJson/index.ts!',
    // Public configuration and metrics API; fixtures exercise the consumers.
    'src/infra/server/publication/index.ts!',
    // Reusable public components and APIs, exercised by the fixtures.
    'src/components/atoms/Input/index.tsx!',
    'src/components/atoms/Textarea/index.tsx!',
    'src/components/molecules/Dialog/index.tsx!',
    'src/components/atoms/ToastProvider/useToast/index.ts!',
    'src/primitives/createLocalizedNavigate/index.ts!',
    'src/i18n/localizedRedirect/index.ts!',
    'src/primitives/createOutdatedPageGuard/index.ts!',
    'env.ts!',
    // Middleware chain of the E2E build, chosen by mode in vite.config.ts.
    'src/tests/fixtures/e2e/middleware/index.ts'
  ],
  project: [
    'src/**/*.{ts,tsx}!',
    'tooling/**/*.ts',
    '!src/tests/**!',
    '!src/**/__tests__/**!',
    '!src/**/*.test.{ts,tsx}!'
  ],
  // The config stays outside the default path and runs through tooling/css/check.ts.
  stylelint: {
    config: ['tooling/css/stylelint.config.mjs']
  },
  // The plugin treats every file of src/routes as an entry and would hide unused
  // colocated helpers; discoverRouteModules selects only the routes.
  'filesystem-routing': false,
  // Kingfisher is external. The vp of the start script comes from a
  // devDependency, which production mode (turned on by --strict) does not
  // consider; the '!' limits the ignore to that mode, because in the default run
  // it would become a redundancy hint.
  ignoreBinaries: ['kingfisher', 'vp!'],
  // The regression resolves srvx through the Nitro tree to test the real adapter,
  // without pinning a second copy as a direct dependency of the project.
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
