import { baseLocale } from '@paraglide/runtime.js'

import type { SitemapEntry } from '@/@types/sitemap.ts'
import { localizeHref } from '@/i18n/urls/index.ts'

type NormalizeSitemapEntriesOptions = {
  entries: readonly SitemapEntry[]
  siteUrl: string
}

type SitemapUrlOptions = { path: string; siteUrl: string }

const DATE_LENGTH = 10

const SITE_PATH = /^\/(?!\/)[^\s?#\\]*$/u

const W3C_DATETIME =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/u

function normalizePath(path: string): string {
  if (!SITE_PATH.test(path)) {
    throw new Error(`Invalid sitemap path: ${path}`)
  }
  const collapsed = path.replaceAll(/\/+/gu, '/')
  return collapsed.length > 1 ? collapsed.replace(/\/$/u, '') : collapsed
}

function normalizeLastmod(lastmod: string | undefined): string | undefined {
  if (lastmod === undefined || !W3C_DATETIME.test(lastmod)) return undefined
  if (Number.isNaN(Date.parse(lastmod))) return undefined
  // Validates the calendar before the time zone conversion: it can change the day.
  const date = lastmod.slice(0, DATE_LENGTH)
  const parsedDate = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsedDate.getTime())) return undefined
  return parsedDate.toISOString().slice(0, DATE_LENGTH) === date
    ? lastmod
    : undefined
}

// The same base locale URL that buildLocaleAlternates writes in the XML.
// Different paths that the URL resolves the same way (`/a/../b`, `/café` and
// `/caf%C3%A9`, `/pt/x` and `/x`) produce the same URLs in every locale.
export function sitemapUrl({ path, siteUrl }: SitemapUrlOptions): string {
  return new URL(localizeHref({ href: path, locale: baseLocale }), siteUrl).href
}

// In repeated URLs, the static page wins over the dynamic source.
export function normalizeSitemapEntries({
  entries,
  siteUrl
}: NormalizeSitemapEntriesOptions): SitemapEntry[] {
  const normalized = new Map<string, SitemapEntry>()
  for (const entry of entries) {
    const path = normalizePath(entry.path)
    const url = sitemapUrl({ path, siteUrl })
    if (normalized.has(url)) continue
    const lastmod = normalizeLastmod(entry.lastmod)
    normalized.set(url, lastmod === undefined ? { path } : { path, lastmod })
  }
  return [...normalized.values()]
}
