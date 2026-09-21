// Uma URL do sitemap: caminho absoluto do site (`/blog/post`) e, quando a
// página tem data de alteração confiável, `lastmod` em W3C Datetime
// (`2026-09-21` ou `2026-09-21T10:00:00Z`). Fora desse formato, a data é
// omitida.
export type SitemapEntry = {
  path: string
  lastmod?: string
}

// Fonte das URLs de uma rota com parâmetros, declarada em
// `route.info.sitemap`. O módulo da rota entra no bundle do cliente, então
// banco e SDK entram por server function. Roda a cada request do sitemap;
// cache de dados, quando necessário, fica dentro da fonte.
export type SitemapRouteInfo = () =>
  | readonly SitemapEntry[]
  | Promise<readonly SitemapEntry[]>
