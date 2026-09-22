import type { SitemapEntry } from '@/@types/sitemap.ts'

import { SITEMAP_URL_LIMIT } from '../../constants.ts'

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

// Uma data fora do formato ou impossível invalidaria o sitemap inteiro para o
// parser; a URL sai sem `lastmod`.
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

// Valida e normaliza as entradas estáticas e dinâmicas juntas. Em caminho
// repetido, a primeira ocorrência vence: a página estática antes da fonte.
export function normalizeSitemapEntries(
  entries: readonly SitemapEntry[]
): SitemapEntry[] {
  const normalized = new Map<string, SitemapEntry>()
  for (const entry of entries) {
    const path = normalizePath(entry.path)
    if (normalized.has(path)) continue
    const lastmod = normalizeLastmod(entry.lastmod)
    normalized.set(path, lastmod === undefined ? { path } : { path, lastmod })
  }
  if (normalized.size > SITEMAP_URL_LIMIT) {
    throw new Error(`Sitemap acima do limite de ${SITEMAP_URL_LIMIT} URLs`)
  }
  return [...normalized.values()]
}
