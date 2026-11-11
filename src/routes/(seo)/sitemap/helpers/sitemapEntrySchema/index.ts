import * as v from 'valibot'

export const sitemapEntrySchema = v.object({
  path: v.string(),
  lastmod: v.optional(v.string())
})
