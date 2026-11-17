# Sitemap and content sources

[Back to the main guide](../seo.md)

## Sitemap and dynamic routes

In the sitemap, a route with a parameter enters through the entries of
`route.info.sitemap`: a function, synchronous or async, that returns a list of
`{ path, lastmod? }` with absolute site paths, enumerated from the data source.
The route module goes into the client bundle, so the database and the SDK stay
in a server function called by the source, according to the
[server error contract](../server-errors.md). The source receives an
`AbortSignal` that aborts at the deadline of the sources, when the client
disconnects and at the end of the read, including when another source fails;
pass it to the read to cancel it, instead of only no longer waiting for it. A
source that ignores the signal keeps running and keeps its slot taken until the
Promise settles, even after the response ends by timeout. The source runs on
every request that reaches the function. The response allows a shared cache for
one hour; whether the cache is used depends on the host and needs to be
measured. The source is ignored under `noindex`, its own or inherited; on a page
without a parameter it has no effect. As in llms.txt, the filter looks at the
effective setting of the page, including the child index route, which shares the
URL of the layout: an index with `noindex: true` removes the source of the
layout, a source declared by the index replaces the one of the layout, and an
index without a source inherits the one of the layout, published according to
the effective `noindex` of the index. The source is tied to the URL of the route
that declares it; a source that enumerates pages of another child must stay in
that child. The entries are validated at the boundary: a path that does not
start with `/`, or that has a host, scheme, query, fragment or space, fails;
trailing and repeated slashes are normalized; entries that result in the same
published URL keep the first occurrence (the static page before the source). The
comparison uses the localized URL that goes into the XML, so `/a/../b` and `/b`,
`/café` and `/caf%C3%A9` or `/pt/blog/x` and `/blog/x` count as the same page. A
`lastmod` outside W3C Datetime is left out. A failure of any source, an invalid
entry, an exceeded deadline or a sitemap over the protocol limits (of URLs and
of bytes, in `sitemap/constants.ts`) answer 503 without a body and with
`no-store`. The expected abort and timeout of the controller are silent; real
exceptions log the fixed `[sitemap]` line described in
[server errors](../server-errors/logging.md#failure-log). The crawler tries
again, and the CDN does not keep a partial sitemap for an hour. The successful
response carries `stale-if-error=86400`: after the cached copy expires, if the
function answers with an error, the Vercel CDN serves the last good copy for up
to a day, without storing the error. The Vercel documentation gives the 500 and
network and DNS failures as examples; that the 503 of this route also triggers
the old copy is a hypothesis not yet measured. Titles loaded at run time can
still use `useHead`, but the generator does not read those changes.

Each page produces one URL per locale, with alternates and `x-default`. The
locales of the same page stay together in one part. The static inventory is
split automatically by the URL count and by the UTF-8 bytes of the whole XML,
including alternates and escapes. See the
[integration of the indexes with i18n](../i18n.md#seo-indexes).

Small inventories keep `/sitemap.xml` as a `urlset`. With several parts or a
partitioned source, that entry publishes a `sitemapindex`, and `robots.txt`
still points to it. Each file stays within 50,000 URLs and 52,428,800
uncompressed bytes. The initial operating budget is smaller, 4 MiB per response,
configurable in `src/routes/(seo)/sitemap/constants.ts` within the protocol
limit. The localized URLs also need to fit in 2048 characters. A locale group
that goes over the budget on its own fails, as does an oversized index; there
are no nested indexes and no partial publication with a success status.

The `route.info.sitemap` contract, called an array source here, is still fine
for small lists. It returns a whole array, so the consumer cannot prevent the
allocation that the source makes before returning. When going over the limits,
move the source to the partitioned registry described below.

Entries of array sources that repeat indexable static pages are dropped, keeping
the metadata of the static page, even if the source declares another route. That
entry is not published by the source; the remaining entries must belong to the
route that declares it. The index reads the array sources once and leaves out
`array.xml` when no entry of its own is left. If the static pages and the array
sources fit separately, but the sum goes over the count or the bytes,
`/sitemap.xml` publishes an index with the valid parts. An `array.xml` part that
goes over the limits on its own still fails explicitly.

The four handlers share the modules in `src/routes/(seo)/sitemap/`. That folder
organizes the service and does not declare a route. In production, they reuse
the same manifest and matcher per instance, including when reading a part after
the index. In development, the context is rebuilt on every call. The results of
the dynamic sources do not go into that cache.

### Partitioned sources

Large catalogs use `src/infra/server/sitemapSources/`, marked as `server-only`,
separate from the metadata that goes into the client. Each
`SitemapPartitionSource` declares an `id`, the `routePath` of the dynamic page,
`listPartitions({ limit, signal })` and `readPartition({ id, limit, signal })`.
The derived application implements the queries to the database or service; the
boilerplate delivers the contract, the HTTP service and a test source.

`listPartitions` returns the public IDs for the index and applies the limit in
the query before building the list. `readPartition` reads only the requested
part and respects the limit and the cancellation. The read limit includes one
extra position to detect an oversized part; if that position is filled, the
publication fails instead of truncating the part. Running a global query and
then slicing the array inside that callback keeps the cost of the whole catalog.
Use a limited query at the data source.

`limit` limits the record count, not the XML bytes. A part under that count can
still go over the budget because of the length of the URLs, the escapes and the
alternates per locale. Size the partitions at the source to stay within both
limits. The server checks the exact size and answers 503 with `no-store` if the
part goes over the budget, without truncating it.

IDs must be stable and public, without tokens or private cursors. Immutable ID
ranges are one option; a position in a list or an editable category does not
guarantee stability. The source must keep its parts disjoint. Duplicates in the
same response, invalid IDs and entries that belong to another route are refused.
URL ownership uses the real router, including the priority of static pages, and
respects the effective `noindex`. Do not register two sources for the same route
or combine the array source and the partitioned one on that route.

The responses are eventually consistent. For example, the crawler reads the
index at 10:00, a part is removed at 10:01 and it reads that part at 10:02: when
the request reaches the origin, it gets a 404 with `no-store`. A copy still
valid in the CDN can answer with the previous content. A new part appears when
the index and the crawler are updated. An entry moved between parts can appear
twice or be missing for a while in reads made at different times. This behavior
also applies to a deploy and a rollback.

Each response is validated and published whole. An empty source or a removed
part answers 404 with `no-store`; a failure, timeout, invalid schema or excess
answers 503 without a body and with `no-store`. GET and HEAD keep the same
status and metadata. A process or CDN cache does not guarantee the retention of
old generations or coordination between instances. If the product requires every
index to stay readable after updates, versioned publication and retention in
shared storage will have to be added, with their own policy and cost.

The walk through the manifest is iterative, so it does not depend on the
JavaScript recursion limit; the `walkStaticRoutes` test covers 10,000 nested
layouts and 10,000 sibling routes. The sitemap collector reads paths, `noindex`,
`type` and the article dates, without resolving the title or the description.
The `llms.txt` collector also resolves the page metadata.
