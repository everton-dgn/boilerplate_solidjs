import { m } from '@paraglide/messages.js'

import type { SeoRouteInfo } from '@/@types/seo.ts'

export const seo = {
  get title() {
    return m.contact_title()
  },
  get description() {
    return m.contact_description()
  }
} satisfies SeoRouteInfo
