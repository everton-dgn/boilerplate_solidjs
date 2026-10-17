import { m } from '@paraglide/messages.js'

import type { SeoRouteInfo } from '@/@types/seo.ts'

export const content = {
  get title(): string {
    return m.home_title()
  },
  get intro(): string {
    return m.home_description({
      framework: 'SolidJS 2',
      toolchain: 'Vite+',
      language: 'TypeScript'
    })
  }
}

export const seo = {
  get title() {
    return m.home_seoTitle()
  }
} satisfies SeoRouteInfo
