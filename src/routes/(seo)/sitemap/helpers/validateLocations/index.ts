import type { SitemapEntry } from '@/@types/sitemap.ts'
import { buildLocaleAlternates } from '@/i18n/buildLocaleAlternates/index.ts'

import { SITEMAP_LOC_LIMIT } from '../../constants.ts'

type LocationOptions = { entries: readonly SitemapEntry[]; siteUrl: string }

export function validateLocations({ entries, siteUrl }: LocationOptions): void {
  for (const { path } of entries) {
    for (const { href } of buildLocaleAlternates({ href: path, siteUrl })) {
      if (href.length > SITEMAP_LOC_LIMIT) {
        throw new Error('loc exceeds the limit')
      }
    }
  }
}
