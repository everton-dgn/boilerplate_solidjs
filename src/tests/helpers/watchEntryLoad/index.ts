import type { Page } from '@playwright/test'

// The load event of an async module happens after the evaluation, even if
// hydrate() only parked while the parser was still receiving the shell.
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
