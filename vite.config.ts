import { env, loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

import { defineConfig, lazyPlugins, loadEnv } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

import inlangSettings from './project.inlang/settings.json' with { type: 'json' }
import { SECURITY_HEADERS } from './src/middleware/securityHeaders/constants.ts'
import { fmt } from './tooling/fmt.ts'
import { lint } from './tooling/lint.ts'

// The explicit inputs keep the CSS lint cache independent from the tracking of
// the reads made by the runtime on each operating system.
const CSS_CACHE_INPUTS = [
  'src/**/*.css',
  'tooling/css/**',
  'tooling/lint/import-specifier.ts',
  'package.json',
  'bun.lock',
  'bunfig.toml'
]
// The lint and the check depend on the lint-css task, which handles the CSS. The
// explicit inputs cover the declarations that the lint and the formatter ignore,
// the TS configurations and the installed dependencies.
const PROJECT_CHECK_INPUTS = [
  { auto: true },
  'src/**',
  'paraglide/**',
  'tooling/**',
  '*.ts',
  'tsconfig*.json',
  'package.json',
  'bun.lock',
  'bunfig.toml',
  'patches/**'
]
const STATIC_FILE_HEADERS = {
  'strict-transport-security': SECURITY_HEADERS['strict-transport-security'],
  'x-content-type-options': SECURITY_HEADERS['x-content-type-options'],
  'cross-origin-resource-policy':
    SECURITY_HEADERS['cross-origin-resource-policy']
}
// Nitro compiles the routeRules with the h3 preMerge, which refuses a partial
// overlap: a /**.md would cross the folders below and the compilation would fall
// back to the simple mode with a warning. The published .md files stay under the
// locale prefix of urlPatterns in project.inlang/paraglide.config.ts.
const STATIC_FILE_PATHS = [
  '/assets/**',
  '/images/**',
  '/favicon/**',
  ...inlangSettings.locales.map(locale => `/${locale}/**.md`),
  '/llms.txt',
  '/llms-full.txt',
  '/sitemap.xml',
  '/sitemaps/pages/**',
  '/_markdown/static.json'
]
const CI_TEST_WORKERS = 2
const TOOLING_CI_TEST_WORKERS = 3
const TOOLING_TEST_CONCURRENCY = env.CI
  ? ` --test-concurrency=${TOOLING_CI_TEST_WORKERS}`
  : ''

// The Vite plugins are only imported when Vite actually runs. vp lint, fmt,
// check, staged and the editor tooling read the config without paying that cost
// or getting the Nitro startup logs in stdout.
const loadComponentModules = async () => {
  const [solidModule, routing, iconsModule, loaders, i18n] = await Promise.all([
    import('@solidjs/vite-plugin'),
    import('filesystem-routing/vite'),
    import('unplugin-icons/vite'),
    import('unplugin-icons/loaders'),
    import('./tooling/i18n/i18nPlugin/index.ts')
  ])
  return {
    solid: solidModule.default,
    fileRoutes: routing.fileRoutes,
    Icons: iconsModule.default,
    FileSystemIconLoader: loaders.FileSystemIconLoader,
    i18n: i18n.i18nPlugin
  }
}

type ComponentModules = Awaited<ReturnType<typeof loadComponentModules>>

const icons = ({ Icons, FileSystemIconLoader }: ComponentModules) =>
  Icons({
    compiler: 'solid',
    iconCustomizer(_collection, _icon, props) {
      props['aria-hidden'] = 'true'
    },
    customCollections: {
      'my-images': FileSystemIconLoader('./src/assets/images')
    }
  })

const componentPlugins = () =>
  lazyPlugins(async () => {
    const modules = await loadComponentModules()
    return [
      modules.i18n(),
      icons(modules),
      modules.solid({ serverFunctions: true }),
      modules.fileRoutes({ types: 'src/@types/routes.d.ts', httpMethods: true })
    ]
  })

const appPlugins = (mode: string) =>
  lazyPlugins(async () => {
    const [
      modules,
      { nitro },
      { markdownPrerender },
      { createPublicationBuild }
    ] = await Promise.all([
      loadComponentModules(),
      import('nitro/vite'),
      import('./tooling/markdownPrerender/index.ts'),
      import('./tooling/publicationArtifacts/helpers/createPublicationBuild/index.ts')
    ])
    // Nitro shares this plugin list between the build environments, and the same
    // closure reaches the SSR and the module that writes the manifest.
    const { buildId, plugin: publicationBuild } = createPublicationBuild()
    return [
      publicationBuild,
      modules.i18n(),
      icons(modules),
      modules.solid({
        start: {
          middleware:
            mode === 'e2e'
              ? './src/tests/fixtures/e2e/middleware/index.ts'
              : './src/middleware/index.ts'
        },
        ssr: true,
        serverFunctions: {
          serverSetup: './src/infra/server/configureServerErrors/index.ts'
        }
      }),
      modules.fileRoutes(
        mode === 'e2e'
          ? { dir: 'src/tests/fixtures/e2e/routes', httpMethods: true }
          : { types: 'src/@types/routes.d.ts', httpMethods: true }
      ),
      // The Vercel function uses the Node of engines.node. The SSR keeps Node until
      // Bun keeps the contracts of Response and of the failure log.
      nitro({
        serverEntry: false,
        preset: 'vercel',
        modules: [markdownPrerender({ buildId })],
        // Without fallthrough, a file missing in /images/ gets the no-store 404 of
        // Nitro instead of the SSR page with the immutable cache. Nitro already
        // registers the Vite assetsDir, which serves /assets/, this way.
        publicAssets: [
          {
            baseURL: '/images',
            dir: 'public/images',
            fallthrough: false,
            maxAge: 31_536_000
          }
        ],
        // The static files leave the CDN without going through the middleware. The
        // same values reach the function responses, which the middleware already writes.
        routeRules: Object.fromEntries(
          STATIC_FILE_PATHS.map(path => [
            path,
            { headers: STATIC_FILE_HEADERS }
          ])
        )
      })
    ]
  })

function loadTestEnvFile(): void {
  try {
    loadEnvFile(fileURLToPath(new URL('.env.test', import.meta.url)))
  } catch (error) {
    const isMissing =
      error instanceof Error && 'code' in error && error.code === 'ENOENT'
    if (!isMissing) throw error
  }
}

// oxlint-disable-next-line eslint/max-lines-per-function -- The declarative Vite configuration stays together in this callback.
export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, import.meta.dirname, ['HOST', 'PORT'])
  const server = {
    host: localEnv.HOST,
    port: localEnv.PORT ? Number(localEnv.PORT) : undefined
  }

  if (mode === 'test') {
    loadTestEnvFile()
  }

  // Vitest writes test.env into the process.env of the workers, where a missing
  // value would become the string "undefined".
  const testEnv = Object.fromEntries(
    Object.entries({
      BASE_URL_TEST: env.BASE_URL_TEST,
      HOST: env.HOST,
      PORT: env.PORT
    }).filter(([, value]) => value !== undefined)
  )

  return {
    run: {
      tasks: {
        'i18n-generate': {
          command: 'bun tooling/i18n/generate.ts',
          cache: {
            input: [
              'src/**/i18n/*.json',
              'tooling/i18n/**',
              'project.inlang/settings.json',
              'project.inlang/paraglide.config.ts',
              'package.json',
              'bun.lock'
            ],
            output: ['paraglide/**', '.paraglide/messages/**']
          }
        },
        'lint-css': {
          command: 'bun tooling/css/check.ts',
          cache: {
            env: ['NODE_ENV'],
            input: [{ auto: true }, ...CSS_CACHE_INPUTS]
          }
        },
        'dead-code-project': {
          command:
            'knip-bun --config tooling/knip.ts && knip-bun --config tooling/knip.ts --strict',
          // The Knip plugins read the configurations of the root, the hooks and the
          // workflows; as in the CSS lint, the automatic tracking of the Bun reads
          // varies by operating system.
          cache: {
            env: ['NODE_ENV'],
            input: [
              { auto: true },
              'src/**',
              'paraglide/**',
              'tooling/**',
              '*.ts',
              'tsconfig*.json',
              '.github/**',
              '.lefthook.yml',
              '.commitlintrc',
              'package.json',
              'bun.lock'
            ],
            output: []
          }
        },
        'lint-project': {
          command: 'vp lint',
          dependsOn: ['lint-css'],
          cache: { env: ['NODE_ENV'], input: PROJECT_CHECK_INPUTS }
        },
        'check-project': {
          command: 'vp check --continue-on-error',
          dependsOn: ['lint-css'],
          cache: { env: ['NODE_ENV'], input: PROJECT_CHECK_INPUTS }
        },
        // The application types come from vp check, with typeCheck in the lint.
        // The automatic tracking does not see the reads of the native tsc, so the
        // inputs stay explicit. From src only the extensions that tsc reads enter;
        // CSS, images and fonts come through module declarations. bun.lock stands
        // for the installed types, but only keeps the path of the patches, so their
        // content enters separately. With noEmit, tsc only writes .tsbuildinfo in
        // .tsbuild/, which is its own cache, so nothing needs to be restored.
        'typecheck-node': {
          command: 'tsc --project tsconfig.node.json',
          cache: {
            input: [
              'tsconfig.json',
              'tsconfig.node.json',
              'vite.config.ts',
              'tooling/**/*.ts',
              // The tooling imports modules of src, and the tsconfig includes the
              // Paraglide configuration, which imports settings.json.
              'src/**/*.ts',
              'src/**/*.tsx',
              'src/**/*.json',
              'project.inlang/paraglide.config.ts',
              'project.inlang/settings.json',
              'package.json',
              'bun.lock',
              'patches/**'
            ],
            output: []
          }
        },
        // The tests create repositories and fixtures in temporary folders that the
        // cache does not track; each run must really run.
        'test-tooling': {
          command: `node --test${TOOLING_TEST_CONCURRENCY} --test-timeout=60000 'tooling/__tests__/*.test.ts' 'tooling/!(release)/**/__tests__/*.test.ts'`,
          cache: false
        }
      }
    },
    // The Solid plugin deletes the client manifest that it turns on itself, so
    // nothing of .vite/ reaches the published static output. Only the E2E build,
    // which is not published, keeps the manifest so that Hydration.preload finds
    // the route chunk.
    build: {
      manifest: mode === 'e2e',
      rolldownOptions: {
        output: {
          comments: false
        }
      }
    },
    // Lightning CSS transpiles nesting, light-dark() and prefixes for the browsers
    // of the default Vite Baseline. The class names of the CSS Modules come only
    // from the content: the default [hash] includes the query, and the ?inline used
    // by the Solid plugin in the development SSR would generate other classes
    // (vitejs/vite#23735).
    css: {
      transformer: 'lightningcss',
      lightningcss: { cssModules: { pattern: '[content-hash]_[local]' } }
    },
    resolve: { tsconfigPaths: true },
    // Forwards the browser errors and warnings to the terminal during vp dev.
    server: { ...server, forwardConsole: true },
    preview: server,
    plugins: mode === 'test' ? [] : appPlugins(mode),
    fmt,
    lint,
    test: {
      pool: 'threads',
      maxWorkers: env.CI ? CI_TEST_WORKERS : undefined,
      css: false,
      globals: true,
      restoreMocks: true,
      unstubGlobals: true,
      unstubEnvs: true,
      expect: { requireAssertions: true, poll: { interval: 10 } },
      env: testEnv,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 75,
          statements: 80
        },
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.d.ts',
          'src/**/{constants,types,@types}/**',
          'src/**/{constants,types}.{ts,tsx}',
          'src/**/__tests__/**',
          'src/tests/**',
          'src/App.tsx',
          'src/Document.tsx',
          'src/entry-server.tsx',
          'src/entry-client.tsx',
          'src/router.ts'
        ]
      },
      reporters: env.GITHUB_ACTIONS
        ? ['default', 'github-actions']
        : ['verbose'],
      // The projects inherit the options above (default Vitest extends) and only
      // declare what changes: environment, include, plugins and aliases.
      projects: [
        {
          resolve: {
            alias: {
              'server-only': fileURLToPath(
                new URL('tooling/testing/server-only.ts', import.meta.url)
              ),
              'virtual:file-routes': fileURLToPath(
                new URL('tooling/testing/file-routes.ts', import.meta.url)
              ),
              'virtual:solid-server-function-handler': fileURLToPath(
                new URL(
                  'tooling/testing/solid-server-function-handler.ts',
                  import.meta.url
                )
              )
            }
          },
          test: {
            name: { label: 'node', color: 'cyan' },
            environment: 'node',
            include: ['src/**/*.node.test.{ts,tsx}']
          }
        },
        {
          plugins: componentPlugins(),
          test: {
            name: { label: 'dom', color: 'magenta' },
            environment: 'happy-dom',
            environmentOptions: { happyDOM: { url: 'http://localhost/en' } },
            include: ['src/**/*.dom.test.{ts,tsx}']
          }
        },
        {
          plugins: componentPlugins(),
          test: {
            css: true,
            name: { label: 'browser', color: 'yellow' },
            setupFiles: ['./src/tests/setup/browser/index.ts'],
            include: ['src/**/*.browser.test.{ts,tsx}'],
            browser: {
              enabled: true,
              headless: true,
              trace: {
                mode: 'retain-on-failure',
                tracesDir: './test-results/browser-traces'
              },
              // The GitHub runners have Chrome; local runs use the Playwright Chromium.
              provider: playwright({
                contextOptions: { locale: 'en-US' },
                launchOptions: env.CI ? { channel: 'chrome' } : {}
              }),
              instances: [{ browser: 'chromium' }]
            }
          }
        }
      ]
    }
  }
})
