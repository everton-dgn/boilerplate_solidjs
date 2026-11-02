type SitemapPartitionListOptions = {
  limit: number
  signal: AbortSignal
}

type SitemapPartitionReadOptions = {
  id: string
  limit: number
  signal: AbortSignal
}

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
// banco e SDK entram por server function. Roda a cada request do sitemap, em
// sequência com as demais fontes em array, e nunca no build; cache de dados,
// quando necessário, fica dentro da fonte. O sinal aborta no prazo das fontes,
// na desconexão do cliente e ao fim da leitura: repasse-o à leitura para que
// ela seja cancelada, e não só deixe de ser esperada. A Promise precisa cobrir
// todo o trabalho iniciado: a vaga de publicação só volta quando ela assenta.
export type SitemapRouteInfo = (
  signal: AbortSignal
) => readonly SitemapEntry[] | Promise<readonly SitemapEntry[]>

export type SitemapPartitionSource = {
  id: string
  routePath: string
  // A consulta precisa respeitar `limit`; a lista só é conferida depois de
  // materializada, o que não protege o backend.
  listPartitions: (
    options: SitemapPartitionListOptions
  ) => Promise<readonly string[]>
  readPartition: (
    options: SitemapPartitionReadOptions
  ) => Promise<readonly SitemapEntry[]>
}
