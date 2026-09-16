import { env, loadEnvFile } from 'node:process'

import solid from '@solidjs/vite-plugin'
import { fileRoutes } from 'filesystem-routing/vite'
import { nitro } from 'nitro/vite'
import postcssPresetEnv from 'postcss-preset-env'
import { FileSystemIconLoader } from 'unplugin-icons/loaders'
import Icons from 'unplugin-icons/vite'
import { defineConfig, loadEnv } from 'vite-plus'
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

const icons = () =>
  Icons({
    compiler: 'solid',
    iconCustomizer(_collection, _icon, props) {
      props['aria-hidden'] = 'true'
    },
    customCollections: {
      'my-images': FileSystemIconLoader('./src/assets/images')
    }
  })

const componentPlugins = () => [
  icons(),
  solid({ serverFunctions: true }),
  fileRoutes({ types: 'src/@types/routes.d.ts' })
]

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
    plugins:
      mode === 'test'
        ? []
        : [
            icons(),
            solid({
              start: { middleware: './src/middleware.ts' },
              ssr: true,
              serverFunctions: true
            }),
            fileRoutes(
              mode === 'e2e'
                ? { dir: 'src/tests/fixtures/e2e/routes' }
                : { types: 'src/@types/routes.d.ts' }
            ),
            nitro({ serverEntry: false, preset: 'vercel' })
          ],
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
          resolve,
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
