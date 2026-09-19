import { env, loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

import postcssPresetEnv from 'postcss-preset-env'
import { defineConfig, lazyPlugins, loadEnv } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

import { fmt } from './tooling/fmt.ts'
import { lint } from './tooling/lint.ts'

const resolve = { tsconfigPaths: true }

const shared = {
  pool: 'threads',
  css: false,
  globals: true,
  passWithNoTests: false,
  clearMocks: true,
  exclude: ['**/node_modules/**', '**/playwright/**', '**/*.e2e.test.{ts,tsx}']
}

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
      modules.fileRoutes({ types: 'src/@types/routes.d.ts' })
    ]
  })

const appPlugins = (mode: string) =>
  lazyPlugins(async () => {
    const modules = await loadPluginModules()
    return [
      icons(modules),
      modules.solid({
        start: { middleware: './src/middleware.ts' },
        ssr: true,
        serverFunctions: {
          configure: './src/infra/server/configureServerErrors/index.ts'
        }
      }),
      modules.fileRoutes(
        mode === 'e2e'
          ? { dir: 'src/tests/fixtures/e2e/routes' }
          : { types: 'src/@types/routes.d.ts' }
      ),
      modules.nitro({ serverEntry: false, preset: 'vercel' })
    ]
  })

const css = {
  postcss: {
    plugins: [
      postcssPresetEnv({
        stage: 3,
        autoprefixer: {},
        features: {
          'custom-properties': true,
          'light-dark-function': true
        }
      })
    ]
  }
}

export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, import.meta.dirname, '')
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
      cache: {
        scripts: true
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
    server,
    preview: server,
    plugins: mode === 'test' ? [] : appPlugins(mode),
    fmt,
    lint,
    test: {
      ...shared,
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
          'src/tests/**',
          'src/App.tsx',
          'src/Document.tsx',
          'src/router.ts'
        ]
      },
      reporters: ['verbose'],
      projects: [
        {
          resolve: {
            ...resolve,
            alias: {
              'server-only': fileURLToPath(
                new URL('tooling/testing/server-only.ts', import.meta.url)
              )
            }
          },
          test: {
            ...shared,
            env: testEnv,
            name: { label: 'node', color: 'cyan' },
            environment: 'node',
            include: ['src/**/*.node.test.{ts,tsx}']
          }
        },
        {
          resolve,
          plugins: componentPlugins(),
          test: {
            ...shared,
            env: testEnv,
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
            ...shared,
            env: testEnv,
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
