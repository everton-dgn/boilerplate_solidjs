import type { Page } from '@playwright/test'

type HoldRoute = { page: Page; url: string }
type HeldRoute = {
  requested: Promise<null>
  release: () => Promise<void>
}

// Segura as requisições que casam com url até release(), sem depender de
// tempo. release() remove todas as rotas da página, não só esta, e espera os
// handlers em andamento terminarem.
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
