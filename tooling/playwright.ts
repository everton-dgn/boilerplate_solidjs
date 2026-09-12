import { env, loadEnvFile } from 'node:process'

import { defineConfig, devices } from '@playwright/test'

loadEnvFile(new URL('../.env.test', import.meta.url))

const BASE_URL = env.BASE_URL_TEST
const { HOST, PORT } = env

if (!BASE_URL || !HOST || !PORT) {
  throw new Error('.env.test must define BASE_URL_TEST, HOST and PORT')
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
    baseURL: BASE_URL,
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: 'pnpm build && pnpm preview --strictPort',
    cwd: '..',
    env: { HOST, PORT },
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: STARTUP_TIMEOUT
  }
})

export default config
