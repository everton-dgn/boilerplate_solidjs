import { m } from '@paraglide/messages.js'

import type { SeoRouteInfo } from '@/@types/seo.ts'

export const seo = {
  get title() {
    return m.notFound_title()
  },
  get description() {
    return m.notFound_description()
  },
  noindex: true
} satisfies SeoRouteInfo
