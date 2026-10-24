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
    throw new Error(`Caminho inválido para o sitemap: ${path}`)
  }
  const collapsed = path.replaceAll(/\/+/gu, '/')
  return collapsed.length > 1 ? collapsed.replace(/\/$/u, '') : collapsed
}

function normalizeLastmod(lastmod: string | undefined): string | undefined {
  if (lastmod === undefined || !W3C_DATETIME.test(lastmod)) return undefined
  if (Number.isNaN(Date.parse(lastmod))) return undefined
  // Valida o calendário antes da conversão de fuso: ela pode mudar o dia.
  const date = lastmod.slice(0, DATE_LENGTH)
  const parsedDate = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsedDate.getTime())) return undefined
  return parsedDate.toISOString().slice(0, DATE_LENGTH) === date
    ? lastmod
    : undefined
}

// A mesma URL do idioma base que buildLocaleAlternates grava no XML. Caminhos
// diferentes que a URL resolve igual (`/a/../b`, `/café` e `/caf%C3%A9`, `/pt/x`
// e `/x`) geram as mesmas URLs em todos os idiomas.
function sitemapUrl({ path, siteUrl }: SitemapUrlOptions): string {
  return new URL(localizeHref({ href: path, locale: baseLocale }), siteUrl).href
}

// Em URLs repetidas, a página estática prevalece sobre a fonte dinâmica.
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
