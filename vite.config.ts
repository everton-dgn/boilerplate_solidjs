import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

import { fmt } from './tooling/fmt.ts'
import { lint } from './tooling/lint.ts'

const config = defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  plugins: [
    solid({
      start: { middleware: './src/middleware.ts' },
      ssr: true,
      serverFunctions: true
    })
  ],
  fmt,
  lint,
  test: {
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/**/*.test.{ts,tsx}', 'src/tests/**']
    },
    globals: true,
    reporters: ['verbose'],
    projects: [
      {
        extends: true,
        test: {
          name: { label: 'node', color: 'cyan' },
          pool: 'threads',
          environment: 'node',
          include: ['src/**/*.node.test.ts']
        }
      },
      {
        extends: true,
        test: {
          name: { label: 'jsdom', color: 'magenta' },
          pool: 'threads',
          environment: 'jsdom',
          include: ['src/**/*.dom.test.tsx']
        }
      },
      {
        extends: true,
        optimizeDeps: {
          include: ['@solidjs/web/server-functions']
        },
        test: {
          name: { label: 'browser', color: 'yellow' },
          include: ['src/**/*.browser.test.tsx'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }]
          }
        }
      }
    ]
  }
})

export default config
