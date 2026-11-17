import type { Page } from '@playwright/test'

// The end of the phase can also happen with a rendered error fallback.
export function hydrationFinished(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.dataset.hydrationEnded !== undefined
  )
}
