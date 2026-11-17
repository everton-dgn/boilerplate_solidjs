import type { Page } from '@playwright/test'

type HoldRoute = { page: Page; url: string }
type HeldRoute = {
  requested: Promise<null>
  release: () => Promise<void>
}

// Holds the requests that match url until release(), without relying on time.
// release() removes every route of the page, not only this one, and waits for
// the handlers in progress to finish.
export async function holdRoute({ page, url }: HoldRoute): Promise<HeldRoute> {
  const requested = Promise.withResolvers<null>()
  const released = Promise.withResolvers<null>()
  await page.route(url, async route => {
    requested.resolve(null)
    await released.promise
    await route.continue()
  })
  return {
    requested: requested.promise,
    release: async () => {
      released.resolve(null)
      await page.unrouteAll({ behavior: 'wait' })
    }
  }
}
