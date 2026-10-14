import type { Page } from '@playwright/test'

// O fim da fase também pode ocorrer com um fallback de erro renderizado.
export function hydrationFinished(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.dataset.hydrationEnded !== undefined
  )
}
