# Publication artifacts and capacity

[Back to the main guide](../seo.md)

## Static artifacts and origin capacity

The build generates `/sitemaps/pages/N.xml`, `/llms.txt` and
`/_markdown/static.json`. The `/sitemap.xml` root also becomes a file when there
are pages and there are no array or partitioned sources. An array source that
returns nothing is still dynamic: the build does not read it to decide whether
the root can be static. The internal inventory `/sitemaps/static.json` only
answers in the prerender phase, identified by the build process. A header sent
by the client does not unlock that phase. The public Markdown inventory has only
publishable paths.

The build checks the bytes of the published files and writes a manifest next to
the function bundle. `createPublicationBuild()` generates one identifier per
build; its plugin embeds it in the SSR, and `markdownPrerender({ buildId })`
writes the same value in the manifest. Both must come from the same call. The
prerender checks the link, and the function refuses a manifest from another
build, even if the site and the budget are the same. This detects mixed
artifacts; it does not authenticate someone who has write access to the function
folder.

The origin reads that manifest once per instance; a read or validation failure
results in a 503 `no-store`, without rebuilding every page in the request.
Without an array source, it does not load a set of static identities. With one,
it loads the exact URLs once to keep the priority of the static pages. That path
still has an O(N) cost and a 32 MiB budget for the identity file. The manifest
has a 1 MiB limit. The read limits the allocation before validating the JSON and
the hash, and the name of the identity file is fixed. Above those budgets, move
the catalog to partitioned sources. The matcher of the sources is also prepared
once, on the first dynamic read.

`src/infra/server/publication/` limits the dynamic work per process: four
producers, with up to two for the sitemap and two for Markdown; four source
reads, with up to two per source; four outputs and 16 MiB of output reserve. The
reserve uses the maximum budget of the operation before starting it. The limits
are starting values to calibrate in the derived application, according to CPU,
memory and backend capacity. Raising the budget of a response requires checking
the total reserve; a request whose budget does not fit is refused.

There is no queue or internal retry. A refused admission answers a small 503,
`no-store` and `Retry-After: 1`; Markdown also keeps `private`. The array
sources run in sequence, and the deadline covers the whole work. The end of the
producer and the consumption or cancellation of the body release separate
resources. A source that never settles keeps its capacity taken: fix the timeout
and the cancellation in the adapter and recycle the instance through the
procedure of the host when needed. Releasing the slot only because the deadline
passed would let work that is still active pile up.

The backend operations that go through `protectServerOperation` inherit the
async context of the publication. Their Promises keep the producer slot until
they settle, even when the SSR was already disposed. Operations started after
the cancellation or the end of the publication are refused before they run.
Normal HTTP does not enter that context. This keeps the public data boundary of
the adapter; it does not add automatic cancellation to the driver. Pass the
signal to the driver and set its timeout to actually release work.

The Promise of each source must represent all the work it started. If a driver
rejects before ending the query in the database, the local counter does not see
that remaining query. Set the pool limits and the timeouts at the data source.
Two instances have two independent quotas; this controller does not impose a
global limit on the backend. Aggregated counters are available through
`getPublicationMetrics()` for integration with the observability of the
application, without a public endpoint in production.

An array source has a per-request cost: the index reads the array and serializes
the `array.xml` part to check its bytes. With a single static part and no
partitioned sources, it also tries to serialize the union up to the budget
before choosing between a `urlset` and an index. That attempt goes through up to
one static part plus the array sources; it does not use the preparation cache to
skip serializing the response. The `array.xml` route validates and serializes
the part once, when building the response. These costs are limited by the budget
of each part, but they repeat whenever the request reaches the origin. For large
catalogs, use the partitioned registry, whose read of one part does not go
through the whole catalog.

```tsx
import type { RouteDefinition } from '@solidjs/router'

import { listPostEntries } from './listPostEntries/index.ts'
import { seo } from './seo.ts'

// blog/[slug]/index.tsx: `listPostEntries` is a server function that returns
// `{ path: '/blog/my-post', lastmod: '2026-09-21' }` per published record, and
// the `seo.ts` next to it declares `type: 'article'`.
export const route = {
  info: { seo, sitemap: listPostEntries }
} satisfies RouteDefinition
```

For the lists to respect `noindex`, declare it in `route.info.seo`, instead of
adding only a loose HTML tag.

## Capacity and measurement

The `llms.txt` collector goes through every static route of the manifest
(branches with a parameter stay out) and resolves the metadata before applying
`route.info.llms` and `noindex`. The cost of the collection grows with the total
of static routes: selecting fewer pages shortens the published text, but the
walk and the metadata resolution still go through all of them.

The order of magnitude comes from a historical measurement, taken in September
2026 on an Apple M2 Pro, on an intermediate version in which `route.info.llms`
was a boolean and there were no sections yet. With 100,000 synthetic routes, the
path collection took about 33 ms and the full `llms.txt` about 230 ms, with a
body of about 12 MB and a heap difference of about 108 MiB between the start and
the end of the generation (not a memory peak). The full sitemap of 10,000 routes
took about 7 ms. The scripts and records of that measurement no longer exist,
and the current `llms.txt` collector was not measured again. The numbers are for
sizing and are not a goal or a CI limit.

To compare a change in `walkStaticRoutes`, `collectLlmsPages` or the sitemap
collector, measure outside the repository:

- copy the helpers of the base revision as the baseline and load both versions
  through the installed Vite, importing `collectLlmsPages` and the current
  signature of `buildLlmsText`;
- start with a pilot of the most expensive scenario and use its cost to set the
  number of runs within the budget, including preparation and analysis;
- when the decision requires a statistical comparison, run before and after
  pairs in fresh Node processes, alternating the order and without other
  benchmarks on the machine; justify the sample size and do not present the
  percentiles of a short collection as a latency guarantee;
- leave out of the timer the loading of the modules, the creation of the
  synthetic routes and the explicit GC between calls;
- keep the order of the operations fixed (paths, metadata, `llms.txt`, sitemap),
  because the first call of each one benefits from the code warmed up by the
  previous one and does not represent a cold start;
- write each run to a new JSONL, with times, errors, counts and sizes.

Synthetic routes that expose the metadata through `$$route.require()` measure
only the collection and the serialization. Importing real pages, preloads, SSR,
network, CDN, compression and concurrency between requests stay out, so the
result does not predict the HTTP latency.

For partitioned sources, grow the virtual catalog while keeping the size of the
requested batch constant. The synthetic source must create only that batch;
building every record before the timer hides the cost you mean to detect. Record
the calls to `listPartitions` and `readPartition`, response bytes, time and
memory. Measure the static preparation separately, at two scales, because its
cost is proportional to the inventory. An isolated sample shows cost and
unwanted calls, but does not prove capacity under concurrent load.

The pilot of the partitioned implementation, before the static parts were
generated in the build, ran in November 2026 on an Apple M2 Pro with 32 GiB. It
ran each scenario in a fresh process, once. With a synthetic static inventory,
preparing the index took 986 ms for 10,000 pages and 9,487 ms for 100,000.
Reading the first part after that preparation took 319 ms and 308 ms,
respectively. In that implementation, each new instance paid the preparation in
proportion to the inventory. Now the partitioning and the static XML files are
prepared in the build. The application still needs to size that build and the
remaining cost of the identities when it uses an array source. Catalogs that
come from data should prefer partitioned sources.

The later pilot, already with build artifacts, prepared 100,000 synthetic pages
in 10.1 s and serialized and wrote their 29 parts in another 8.6 s. That was
300,000 URLs in the three locales and 120.1 MB of XML. The first read of the
manifest by a new reader took 0.8 ms; loading the 100,000 identities used with
an array source took 16.2 ms, with a 3.6 MB file. Those reads happened in the
same process that prepared the files, with a warm filesystem, and do not measure
the cold start of the process or of the operating system. The RSS peak of the
whole run was 720 MB, including Vitest, preparation and serialization. That peak
sizes the build pilot, not the memory of a new function. There was no
compilation of 100,000 route files and no HTTP load in that measurement.

With virtual catalogs of 100,000 and 1 million records, the direct read of a
batch of a thousand records took 159 ms and 147 ms on the first call, and 124 ms
and 125 ms on the second. Each read called `readPartition` once and did not call
`listPartitions`. The index listed 100 and a thousand IDs, respectively. The
batch produced the same 1,216,503 bytes at both scales; the whole catalog was
not built. The RSS peak of the processes was about 378 MiB in the static
scenario of 100,000 and 299 MiB in the dynamic one of 100,000, including Vitest
and its modules. Those values do not isolate the memory of the application. The
pilot checks the cost and the number of operations, without showing HTTP
latency, percentiles or capacity under concurrency.

The [sitemap protocol](https://www.sitemaps.org/protocol.html) limits each file
to 50,000 URLs and 52,428,800 uncompressed bytes, the values of
`sitemap/constants.ts`; that is why the historical measurement of 100,000 routes
covered only the sitemap collector, without generating a single XML, which would
be invalid. `llms.txt` has no equivalent limit, and the 12 MB body with 100,000
pages shows why a large site needs to select what it publishes. `noindex` goes
out as an HTML meta tag, according to the
[Google documentation on blocking indexing](https://developers.google.com/search/docs/crawling-indexing/block-indexing);
excluding those pages from `llms.txt` is a policy of this project, which the
measurement does not check in search engines or agents.
