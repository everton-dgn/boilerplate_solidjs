import { m } from '@paraglide/messages.js'

import type { SeoRouteInfo } from '@/@types/seo.ts'

export const seo = {
  get title() {
    return m.about_title()
  },
  get description() {
    return m.about_description()
  }
} satisfies SeoRouteInfo
