import { env, loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

loadEnvFile(new URL('../.env.test', import.meta.url))
const PRODUCTION_ROUTES = env.TEST_PRODUCTION_ROUTES === 'true'
const BUILD_MODE = PRODUCTION_ROUTES ? 'production' : 'e2e'
// Resolver as variáveis públicas no mesmo modo do build mantém os testes e o
// servidor coerentes sobre a URL pública; variáveis já definidas prevalecem.
const ROOT = fileURLToPath(new URL('..', import.meta.url))
Object.assign(env, loadEnv(BUILD_MODE, ROOT, 'VITE_'))

const BASE_URL = env.BASE_URL_TEST

if (!BASE_URL) {
  throw new Error('.env.test must define BASE_URL_TEST')
}

// BASE_URL_TEST é a única fonte de host e porta: o loadEnvFile preserva HOST ou
// PORT já exportadas no shell, que subiriam o preview em outro endereço.
const { hostname: HOST, port: PORT } = new URL(BASE_URL)

if (!PORT) {
  throw new Error('BASE_URL_TEST must include an explicit port')
}
const STARTUP_TIMEOUT = 120_000
// Só a saída do preview vai para o arquivo, sem o ruído do build. O teardown
// global lê o arquivo depois da suíte e recusa marcadores privados.
const SERVER_LOG = `test-results/server-${BUILD_MODE}.log`
env.SERVER_LOG_FILE = fileURLToPath(
  new URL(`../${SERVER_LOG}`, import.meta.url)
)

const config = defineConfig({
  testDir: '../src/tests/pages',
  testMatch: PRODUCTION_ROUTES
    ? '**/*.production.e2e.test.ts'
    : '**/*.e2e.test.ts',
  testIgnore: PRODUCTION_ROUTES ? [] : ['**/*.production.e2e.test.ts'],
  outputDir: PRODUCTION_ROUTES
    ? '../test-results/e2e-production'
    : '../test-results/e2e',
  globalTeardown: './testing/server-log-teardown.ts',
  fullyParallel: true,
  forbidOnly: true,
  workers: env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: PRODUCTION_ROUTES
          ? '../playwright-report/production'
          : '../playwright-report/e2e',
        open: 'never'
      }
    ]
  ],
  use: {
    // Não ative bypassCSP: ele desliga a CSP e anula as suítes que conferem
    // violações (Home.csp e FragmentCss).
    // headless: false,
    // launchOptions: {
    //   slowMo: 600,
    // },
    // video: 'on',
    // screenshot: 'only-on-failure',
    baseURL: BASE_URL,
    locale: 'en-US',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    // {
    //   name: 'chromium',
    //   use: { ...devices['Desktop Chrome'] },
    // },
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: env.CI ? 'chrome' : undefined
      }
    }
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 10'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 17'] },
    // },
    // {
    //   name: 'Mobile Firefox',
    //   use: { ...devices['Pixel 10'], browserName: 'firefox' },
    // }
  ],
  webServer: [
    ...(PRODUCTION_ROUTES
      ? []
      : [
          {
            command: 'node tooling/testing/error-backend.ts',
            cwd: '..',
            url: 'http://127.0.0.1:4318/control',
            reuseExistingServer: false
          }
        ]),
    {
      command: `pnpm build --mode ${BUILD_MODE} && mkdir -p test-results && pnpm start --strictPort > ${SERVER_LOG} 2>&1`,
      cwd: '..',
      env: { HOST, PORT, NODE_ENV: 'production' },
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: STARTUP_TIMEOUT
    }
  ]
})

export default config
