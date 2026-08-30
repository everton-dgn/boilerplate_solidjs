import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

import { fmt } from './tooling/fmt.ts'
import { lint } from './tooling/lint.ts'

const config = defineConfig({
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
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.node.test.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
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
          name: 'browser',
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
