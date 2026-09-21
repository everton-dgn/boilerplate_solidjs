import type { SitemapEntry, SitemapRouteInfo } from '@/@types/sitemap.ts'

// Leitura do manifesto de rotas: as páginas estáticas já resolvidas e as
// fontes das rotas com parâmetros, executadas a cada request.
export type SitemapManifest = {
  entries: readonly SitemapEntry[]
  sources: readonly SitemapRouteInfo[]
}
