import { env, loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

import { defineConfig, lazyPlugins, loadEnv } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

import { fmt } from './tooling/fmt.ts'
import { lint } from './tooling/lint.ts'

const resolve = { tsconfigPaths: true }

// Os plugins do Vite só são importados quando o Vite roda de fato. vp lint,
// fmt, check, staged e o tooling do editor leem a config sem pagar esse custo
// nem receber os logs de inicialização do Nitro no stdout.
const loadPluginModules = async () => {
  const [solidModule, routing, nitroModule, iconsModule, loaders] =
    await Promise.all([
      import('@solidjs/vite-plugin'),
      import('filesystem-routing/vite'),
      import('nitro/vite'),
      import('unplugin-icons/vite'),
      import('unplugin-icons/loaders')
    ])
  return {
    solid: solidModule.default,
    fileRoutes: routing.fileRoutes,
    nitro: nitroModule.nitro,
    Icons: iconsModule.default,
    FileSystemIconLoader: loaders.FileSystemIconLoader
  }
}

type PluginModules = Awaited<ReturnType<typeof loadPluginModules>>

const icons = ({ Icons, FileSystemIconLoader }: PluginModules) =>
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
    const modules = await loadPluginModules()
    return [
      icons(modules),
      modules.solid({ serverFunctions: true }),
      modules.fileRoutes({ types: 'src/@types/routes.d.ts', httpMethods: true })
    ]
  })

const appPlugins = (mode: string) =>
  lazyPlugins(async () => {
    const modules = await loadPluginModules()
    return [
      icons(modules),
      modules.solid({
        start: { middleware: './src/middleware/index.ts' },
        ssr: true,
        serverFunctions: {
          configure: './src/infra/server/configureServerErrors/index.ts'
        }
      }),
      modules.fileRoutes(
        mode === 'e2e'
          ? { dir: 'src/tests/fixtures/e2e/routes', httpMethods: true }
          : { types: 'src/@types/routes.d.ts', httpMethods: true }
      ),
      modules.nitro({ serverEntry: false, preset: 'vercel' })
    ]
  })

// O Lightning CSS transpila nesting, light-dark() e prefixos para os mesmos
// navegadores-alvo do JavaScript (Baseline do Vite).
const css = {
  transformer: 'lightningcss'
} as const

export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, import.meta.dirname, ['HOST', 'PORT'])
  const server = {
    host: localEnv.HOST,
    port: localEnv.PORT ? Number(localEnv.PORT) : undefined
  }

  if (mode === 'test') {
    loadEnvFile(new URL('.env.test', import.meta.url))
  }

  const testEnv = {
    BASE_URL_TEST: env.BASE_URL_TEST,
    HOST: env.HOST,
    PORT: env.PORT
  }

  return {
    run: {
      tasks: {
        'lint-project': {
          command: 'node tooling/css/check.ts && vp lint',
          cache: { env: ['NODE_ENV'] }
        },
        'check-project': {
          command: 'node tooling/css/check.ts && vp check',
          cache: { env: ['NODE_ENV'] }
        },
        // O rastreamento automático não vê as leituras do tsc nativo, então as
        // entradas ficam explícitas. O lock do node_modules muda a cada install,
        // cobrindo os tipos instalados. Com noEmit, nada precisa ser restaurado.
        'typecheck-node': {
          command: 'tsc --project tsconfig.node.json',
          cache: {
            input: [
              'tsconfig.json',
              'tsconfig.node.json',
              'vite.config.ts',
              'tooling/**/*.ts',
              'package.json',
              'node_modules/.pnpm/lock.yaml'
            ],
            output: []
          }
        },
        // Os testes criam repositórios e fixtures em diretórios temporários que
        // o cache não rastreia; cada execução precisa rodar de verdade.
        'test-tooling': {
          command:
            "node --test --test-timeout=60000 'tooling/**/__tests__/*.test.ts'",
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
    css,
    resolve,
    // Repassa ao terminal os erros e avisos do navegador durante o vp dev.
    server: { ...server, forwardConsole: true },
    preview: server,
    plugins: mode === 'test' ? [] : appPlugins(mode),
    fmt,
    lint,
    test: {
      pool: 'threads',
      css: false,
      globals: true,
      passWithNoTests: false,
      clearMocks: true,
      restoreMocks: true,
      unstubGlobals: true,
      unstubEnvs: true,
      expect: { requireAssertions: true },
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
          'src/**/*.test.{ts,tsx}',
          'src/**/*.test-d.{ts,tsx}',
          'src/tests/**',
          'src/App.tsx',
          'src/Document.tsx',
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
            ...resolve,
            alias: {
              'server-only': fileURLToPath(
                new URL('tooling/testing/server-only.ts', import.meta.url)
              ),
              'virtual:file-routes': fileURLToPath(
                new URL('tooling/testing/file-routes.ts', import.meta.url)
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
          resolve,
          plugins: componentPlugins(),
          test: {
            name: { label: 'dom', color: 'magenta' },
            environment: 'happy-dom',
            setupFiles: ['./tooling/vitest.setup.ts'],
            include: ['src/**/*.dom.test.{ts,tsx}']
          }
        },
        {
          css,
          resolve,
          plugins: componentPlugins(),
          optimizeDeps: {
            include: ['@solidjs/web/server-functions']
          },
          test: {
            css: true,
            name: { label: 'browser', color: 'yellow' },
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
