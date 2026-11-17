import type { SitemapEntry } from '@/@types/sitemap.ts'

// Sitemap source for `blog/[slug]`. A server function because the route module
// goes into the client bundle; a real source would read the database here. The
// trailing slash and the invalid date cover the normalization of the entries.
export async function listBlogEntries(): Promise<SitemapEntry[]> {
  'use server'
  // In place of the database read.
  await Promise.resolve()
  return [
    { path: '/blog/first-post', lastmod: '2026-09-10' },
    { path: '/blog/second-post/', lastmod: 'yesterday' }
  ]
}
