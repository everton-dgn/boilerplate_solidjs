import { test as base } from '@playwright/test'

import { watchCspViolations } from '@/tests/helpers/watchCspViolations/index.ts'

type PageWatchers = {
  pageErrors: string[]
  cspViolations: string[]
}

// Os fixtures registram a coleta antes do corpo do teste, então nenhum erro da
// primeira navegação escapa. Páginas criadas com context.newPage registram a
// própria coleta.
export const test = base.extend<PageWatchers>({
  pageErrors: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await use(errors)
  },
  cspViolations: async ({ page }, use) => {
    await use(await watchCspViolations(page))
  }
})

export { expect } from '@playwright/test'
