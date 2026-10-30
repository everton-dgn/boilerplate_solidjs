import { m } from '@paraglide/messages.js'

import type { SeoRouteInfo } from '@/@types/seo.ts'

export const seo = {
  get title() {
    return m.privacy_title()
  },
  get description() {
    return m.privacy_description()
  }
} satisfies SeoRouteInfo
