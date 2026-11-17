type SitemapPartitionListOptions = {
  limit: number
  signal: AbortSignal
}

type SitemapPartitionReadOptions = {
  id: string
  limit: number
  signal: AbortSignal
}

// A sitemap URL: absolute site path (`/blog/post`) and, when the page has a
// reliable modification date, `lastmod` in W3C Datetime (`2026-09-21` or
// `2026-09-21T10:00:00Z`). Outside that format, the date is left out.
export type SitemapEntry = {
  path: string
  lastmod?: string
}

// Source of the URLs of a route with parameters, declared in
// `route.info.sitemap`. The route module goes into the client bundle, so the
// database and the SDK come in through a server function. It runs on every
// sitemap request, in sequence with the other array sources, and never in the
// build; a data cache, when needed, stays inside the source. The signal aborts at
// the deadline of the sources, when the client disconnects and at the end of the
// read: pass it to the read so it is cancelled, instead of only no longer awaited.
// The Promise must cover all the work it started: the publication slot only comes
// back when it settles.
export type SitemapRouteInfo = (
  signal: AbortSignal
) => readonly SitemapEntry[] | Promise<readonly SitemapEntry[]>

export type SitemapPartitionSource = {
  id: string
  routePath: string
  // The query must respect `limit`; the list is only checked after it is built,
  // which does not protect the backend.
  listPartitions: (
    options: SitemapPartitionListOptions
  ) => Promise<readonly string[]>
  readPartition: (
    options: SitemapPartitionReadOptions
  ) => Promise<readonly SitemapEntry[]>
}
