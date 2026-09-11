import { defineConfig, devices } from '@playwright/test'

const BASE_URL = 'http://127.0.0.1:4317'
const STARTUP_TIMEOUT = 120_000

const config = defineConfig({
  testDir: '../src/tests/pages',
  testMatch: '**/*.e2e.test.ts',
  outputDir: '../test-results/e2e',
  fullyParallel: true,
  forbidOnly: true,
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
    command: 'pnpm build && pnpm start',
    cwd: '..',
    env: { HOST: '127.0.0.1', PORT: '4317' },
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: STARTUP_TIMEOUT
  }
})

export default config
