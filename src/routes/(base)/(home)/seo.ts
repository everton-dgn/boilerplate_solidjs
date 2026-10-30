import { m } from '@paraglide/messages.js'

import type { SeoRouteInfo } from '@/@types/seo.ts'

export const seo = {
  get title() {
    return m.home_seoTitle()
  }
} satisfies SeoRouteInfo
