import { env, loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

loadEnvFile(fileURLToPath(new URL('../.env.test', import.meta.url)))
const PRODUCTION_ROUTES = env.TEST_PRODUCTION_ROUTES === 'true'
const PUBLICATION_LOAD = env.TEST_PUBLICATION_LOAD === 'true'
if (PUBLICATION_LOAD && PRODUCTION_ROUTES) {
  throw new Error('TEST_PUBLICATION_LOAD requires fixture routes')
}
const BUILD_MODE = PRODUCTION_ROUTES ? 'production' : 'e2e'
const SHOULD_BUILD = env.TEST_PREBUILT !== 'true'
if (!SHOULD_BUILD && !PRODUCTION_ROUTES) {
  throw new Error('TEST_PREBUILT requires production routes')
}
const BUILD_COMMAND = SHOULD_BUILD
  ? `vp run build --mode ${BUILD_MODE} && `
  : ''
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
const SECONDARY_PORT_OFFSET = 2
const MAX_PORT = 65_535
const SECONDARY_PORT = Number(PORT) + SECONDARY_PORT_OFFSET
if (PUBLICATION_LOAD && SECONDARY_PORT > MAX_PORT) {
  throw new Error('BASE_URL_TEST leaves no port for the secondary server')
}
const SECONDARY_URL = new URL(BASE_URL)
SECONDARY_URL.port = String(SECONDARY_PORT)
const CI_WORKERS = 3
const DEFAULT_WORKERS = env.CI ? CI_WORKERS : undefined
// Só a saída do preview vai para o arquivo, sem o ruído do build. O teardown
// global lê o arquivo depois da suíte e recusa marcadores privados.
const SERVER_LOG = `test-results/server-${BUILD_MODE}.log`
env.SERVER_LOG_FILE = fileURLToPath(
  new URL(`../${SERVER_LOG}`, import.meta.url)
)
const SECONDARY_LOG = 'test-results/server-publication-secondary.log'
if (PUBLICATION_LOAD) {
  env.PUBLICATION_SECONDARY_URL = SECONDARY_URL.href
  env.SERVER_LOG_SECONDARY = fileURLToPath(
    new URL(`../${SECONDARY_LOG}`, import.meta.url)
  )
}
// O arquivo que conta linhas fixas do log roda como teardown do chromium, em
// ordem e sem outros testes em paralelo, para que cada contagem seja exata. O
// teardown roda mesmo quando um teste do chromium falha.
const SERVER_LOG_TESTS = '**/OutsideError.e2e.test.ts'
const MARKDOWN_TESTS = '**/Markdown/*.e2e.test.ts'
const PUBLICATION_LOAD_TESTS = '**/PublicationLoad.e2e.test.ts'
const PROJECTS = PRODUCTION_ROUTES
  ? [{ name: 'chromium' }]
  : [
      {
        name: 'chromium',
        testIgnore: [
          '**/*.production.e2e.test.ts',
          SERVER_LOG_TESTS,
          PUBLICATION_LOAD_TESTS,
          MARKDOWN_TESTS
        ],
        teardown: 'server-logs'
      },
      {
        name: 'markdown',
        testMatch: MARKDOWN_TESTS,
        fullyParallel: false,
        workers: 1,
        teardown: 'server-logs'
      },
      {
        name: 'server-logs',
        testMatch: SERVER_LOG_TESTS,
        fullyParallel: false
      }
    ]

const config = defineConfig({
  testDir: '../src/tests/pages',
  testMatch: PRODUCTION_ROUTES
    ? '**/*.production.e2e.test.ts'
    : '**/*.e2e.test.ts',
  outputDir: PRODUCTION_ROUTES
    ? '../test-results/e2e-production'
    : '../test-results/e2e',
  globalTeardown: './testing/server-log-teardown.ts',
  fullyParallel: !PUBLICATION_LOAD,
  forbidOnly: true,
  workers: PUBLICATION_LOAD ? 1 : DEFAULT_WORKERS,
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: PRODUCTION_ROUTES
          ? '../playwright-report/production'
          : '../playwright-report/e2e',
        open: 'never',
        // O CI só envia o relatório quando o job falha.
        onlyFailures: Boolean(env.CI)
      }
    ]
  ],
  use: {
    ...devices['Desktop Chrome'],
    channel: env.CI ? 'chrome' : undefined,
    // Não ative bypassCSP: ele desliga a CSP e anula as suítes que conferem
    // violações (Home.csp e FragmentCss).
    baseURL: BASE_URL,
    locale: 'en-US',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: PUBLICATION_LOAD
    ? [{ name: 'publication-load', testMatch: PUBLICATION_LOAD_TESTS }]
    : PROJECTS,
  webServer: [
    ...(PRODUCTION_ROUTES
      ? []
      : [
          {
            command: 'bun tooling/testing/error-backend.ts',
            cwd: '..',
            url: 'http://127.0.0.1:4318/control',
            reuseExistingServer: false
          }
        ]),
    {
      command: `${BUILD_COMMAND}mkdir -p test-results && vp run start --strictPort > ${SERVER_LOG} 2>&1`,
      cwd: '..',
      env: { HOST, PORT, NODE_ENV: 'production' },
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: STARTUP_TIMEOUT
    },
    ...(PUBLICATION_LOAD
      ? [
          {
            command: `vp run start --strictPort > ${SECONDARY_LOG} 2>&1`,
            cwd: '..',
            env: { HOST, PORT: String(SECONDARY_PORT), NODE_ENV: 'production' },
            url: SECONDARY_URL.href,
            reuseExistingServer: false,
            timeout: STARTUP_TIMEOUT
          }
        ]
      : [])
  ]
})

export default config
