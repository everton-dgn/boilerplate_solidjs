import type { Page } from '@playwright/test'

// O evento load de um módulo async ocorre depois da avaliação, mesmo se
// hydrate() apenas estacionou enquanto o parser ainda recebia o shell.
export function watchEntryLoad(page: Page): ReturnType<Page['addInitScript']> {
  return page.addInitScript(() => {
    document.addEventListener(
      'load',
      event => {
        const script = event.target
        if (
          script instanceof HTMLScriptElement &&
          script.src.includes('/assets/entry-client-')
        ) {
          document.documentElement.dataset.entryLoaded = document.readyState
        }
      },
      true
    )
  })
}
