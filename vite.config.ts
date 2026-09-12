import { env, loadEnvFile } from 'node:process'

import solid from '@solidjs/vite-plugin'
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
    customCollections: {
      'my-images': FileSystemIconLoader('./src/assets/images')
    }
  })

const componentPlugins = () => [icons(), solid({ serverFunctions: true })]

const css = {
  postcss: {
    plugins: [
      postcssPresetEnv({
        stage: 3,
        autoprefixer: {},
        features: {
          'custom-properties': true
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
            nitro({ serverEntry: false })
          ],
    fmt,
    lint,
    test: {
      ...shared,
      env: testEnv,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.d.ts', 'src/**/*.test.{ts,tsx}', 'src/tests/**']
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
              provider: playwright(),
              instances: [{ browser: 'chromium' }]
            }
          }
        }
      ]
    }
  }
})
