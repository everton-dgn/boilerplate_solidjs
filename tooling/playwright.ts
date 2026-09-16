import { env, loadEnvFile } from 'node:process'

import { defineConfig, devices } from '@playwright/test'

loadEnvFile(new URL('../.env.test', import.meta.url))

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

const config = defineConfig({
  testDir: '../src/tests/pages',
  testMatch: '**/*.e2e.test.ts',
  outputDir: '../test-results/e2e',
  fullyParallel: true,
  forbidOnly: true,
  workers: env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: '../playwright-report', open: 'never' }]
  ],
  use: {
    // bypassCSP: true,
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
    { name: 'chromium', use: devices['Desktop Chrome'] }
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
    {
      command: 'node tooling/testing/error-backend.ts',
      cwd: '..',
      url: 'http://127.0.0.1:4318/control',
      reuseExistingServer: false
    },
    {
      command: 'pnpm build --mode e2e && pnpm start --strictPort',
      cwd: '..',
      env: { HOST, PORT, NODE_ENV: 'production' },
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: STARTUP_TIMEOUT
    }
  ]
})

export default config
