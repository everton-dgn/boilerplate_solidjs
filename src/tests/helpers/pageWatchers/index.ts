import { test as base } from '@playwright/test'

import { watchCspViolations } from '@/tests/helpers/watchCspViolations/index.ts'

type PageWatchers = {
  pageErrors: string[]
  cspViolations: string[]
}

// The fixtures register the collection before the body of the test, so no error
// of the first navigation escapes. Pages created with context.newPage register
// their own collection.
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
