import type { SeoRouteInfo } from '@/@types/seo.ts'

import { content } from './content.ts'

export const seo = {
  get title() {
    return content.title
  },
  get description() {
    return content.description
  }
} satisfies SeoRouteInfo
