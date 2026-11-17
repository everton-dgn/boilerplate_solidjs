import { HTTP_INTERNAL_SERVER_ERROR } from '@/constants/http.ts'
import { runPublication } from '@/infra/server/publication/index.ts'
import type {
  PublicationContext,
  SourceOptions
} from '@/infra/server/publication/types.ts'
import { SITEMAP_SOURCES_TIMEOUT_MS } from '@/routes/(seo)/sitemap/constants.ts'

import type { ServiceOptions } from '../../types.ts'
import { errorResponse } from '../sitemapResponse/index.ts'

type PublishOptions = {
  options: ServiceOptions
  byteBudget: number
  run: (context: PublicationContext) => Promise<Response>
}

// The slot stays taken until `run` settles. The source signal still aborts at the
// end of the read, for whoever still has pending work after the response.
export async function publishSitemap({
  options,
  byteBudget,
  run
}: PublishOptions): Promise<Response> {
  const { signal, method = 'GET' } = options
  const response = await runPublication({
    kind: 'sitemap',
    signal,
    method,
    timeoutMs: SITEMAP_SOURCES_TIMEOUT_MS,
    maxOutputBytes: byteBudget,
    run: async context => {
      const finished = new AbortController()
      // The route scanner reads this file as TSX, without a generic in an arrow.
      function readSource<T>({ key, run: read }: SourceOptions<T>): Promise<T> {
        return context.readSource({
          key,
          run: sourceSignal =>
            read(AbortSignal.any([sourceSignal, finished.signal]))
        })
      }
      try {
        return await run({ signal: context.signal, readSource })
      } finally {
        finished.abort()
      }
    }
  })
  return response.status === HTTP_INTERNAL_SERVER_ERROR
    ? errorResponse()
    : response
}
