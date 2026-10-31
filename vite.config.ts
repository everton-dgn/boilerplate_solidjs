import { env, loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

import { defineConfig, lazyPlugins, loadEnv } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

import { fmt } from './tooling/fmt.ts'
import { lint } from './tooling/lint.ts'

// As entradas explícitas mantêm o cache do lint de CSS independente do
// rastreamento das leituras feitas pelo runtime em cada sistema operacional.
const CSS_CACHE_INPUTS = [
  'src/**/*.css',
  'tooling/css/**',
  'tooling/lint/import-specifier.ts',
  'package.json',
  'bun.lock',
  'bunfig.toml'
]
// O lint e o check dependem da tarefa lint-css, que cuida do CSS. As entradas
// explícitas cobrem as declarações que o lint e o formatador ignoram, as
// configurações do TS e as dependências instaladas.
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
const CI_TEST_WORKERS = 2
const TOOLING_CI_TEST_WORKERS = 3
const TOOLING_TEST_CONCURRENCY = env.CI
  ? ` --test-concurrency=${TOOLING_CI_TEST_WORKERS}`
  : ''

// Os plugins do Vite só são importados quando o Vite roda de fato. vp lint,
// fmt, check, staged e o tooling do editor leem a config sem pagar esse custo
// nem receber os logs de inicialização do Nitro no stdout.
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
    const [modules, { nitro }, { markdownPrerender }, { moveViteMetadata }] =
      await Promise.all([
        loadComponentModules(),
        import('nitro/vite'),
        import('./tooling/markdownPrerender/index.ts'),
        import('./tooling/moveViteMetadata/index.ts')
      ])
    return [
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
      // A função da Vercel usa o Node de engines.node. O SSR mantém Node até
      // Bun preservar os contratos de Response e do log de falhas.
      nitro({
        serverEntry: false,
        preset: 'vercel',
        modules: [markdownPrerender, moveViteMetadata]
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

// oxlint-disable-next-line eslint/max-lines-per-function -- A configuração declarativa do Vite fica reunida neste callback.
export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, import.meta.dirname, ['HOST', 'PORT'])
  const server = {
    host: localEnv.HOST,
    port: localEnv.PORT ? Number(localEnv.PORT) : undefined
  }

  if (mode === 'test') {
    loadTestEnvFile()
  }

  // O Vitest grava test.env no process.env dos workers, onde um valor ausente
  // viraria a string "undefined".
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
          cache: {
            env: ['NODE_ENV'],
            input: [
              { auto: true },
              'src/**',
              'paraglide/**',
              'tooling/**',
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
          command: 'vp check',
          dependsOn: ['lint-css'],
          cache: { env: ['NODE_ENV'], input: PROJECT_CHECK_INPUTS }
        },
        // O rastreamento automático não vê as leituras do tsc nativo, então as
        // entradas ficam explícitas. De src entram só as extensões que o tsc lê;
        // CSS, imagens e fontes chegam por declarações de módulo. O bun.lock
        // representa os tipos instalados, mas guarda só o caminho dos patches,
        // então o conteúdo deles entra à parte. Com noEmit, o tsc só grava o
        // .tsbuildinfo em .tsbuild/, que é cache próprio dele, então nada precisa
        // ser restaurado.
        'typecheck-app': {
          command: 'tsc --project tsconfig.json',
          cache: {
            input: [
              'src/**/*.ts',
              'src/**/*.tsx',
              'src/**/*.json',
              'paraglide/**',
              'env.ts',
              'solid-env.d.ts',
              'tsconfig.json',
              'vite.config.ts',
              'tooling/**/*.ts',
              'package.json',
              'bun.lock',
              'patches/**'
            ],
            output: []
          }
        },
        'typecheck-node': {
          command: 'tsc --project tsconfig.node.json',
          cache: {
            input: [
              'tsconfig.json',
              'tsconfig.node.json',
              'vite.config.ts',
              'tooling/**/*.ts',
              // O tooling importa módulos de src, e o tsconfig inclui a
              // configuração do Paraglide, que importa o settings.json.
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
        // Os testes criam repositórios e fixtures em diretórios temporários que
        // o cache não rastreia; cada execução precisa rodar de verdade.
        'test-tooling': {
          command: `node --test${TOOLING_TEST_CONCURRENCY} --test-timeout=60000 'tooling/__tests__/*.test.ts' 'tooling/!(release)/**/__tests__/*.test.ts'`,
          cache: false
        }
      }
    },
    build: {
      rolldownOptions: {
        output: {
          comments: false
        }
      }
    },
    // O Lightning CSS transpila nesting, light-dark() e prefixos para os
    // navegadores do Baseline padrão do Vite. O nome das classes dos CSS Modules
    // vem só do conteúdo: o [hash] padrão inclui a query, e o ?inline usado pelo
    // plugin do Solid no SSR de desenvolvimento geraria outras classes
    // (vitejs/vite#23735).
    css: {
      transformer: 'lightningcss',
      lightningcss: { cssModules: { pattern: '[content-hash]_[local]' } }
    },
    resolve: { tsconfigPaths: true },
    // Repassa ao terminal os erros e avisos do navegador durante o vp dev.
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
      exclude: [
        '**/node_modules/**',
        '**/playwright/**',
        '**/*.e2e.test.{ts,tsx}'
      ],
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
          'src/**/*.test-d.{ts,tsx}',
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
      // Os projetos herdam as opções acima (extends padrão do Vitest) e
      // declaram só o que muda: ambiente, include, plugins e aliases.
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
              // Os runners do GitHub têm Chrome; execuções locais usam o Chromium do Playwright.
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
