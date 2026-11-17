import { pageRoutes } from 'virtual:file-routes'

import { memoizeOnce } from '@/helpers/memoizeOnce/index.ts'
import { readPublicationPhase } from '@/helpers/readPublicationPhase/index.ts'

import type { SitemapContext } from '../../types.ts'
import { collectSitemapEntries } from '../collectSitemapEntries/index.ts'
import { createSitemapArtifacts } from '../createSitemapArtifacts/index.ts'
import { matchSitemapRoute } from '../matchSitemapRoute/index.ts'

function createContext(): SitemapContext {
  const readRoutes = memoizeOnce({
    isEnabled: true,
    render: () => ({
      manifest: collectSitemapEntries(pageRoutes),
      matchRoute: matchSitemapRoute(pageRoutes)
    })
  })
  return readPublicationPhase() === 'artifact'
    ? { artifacts: createSitemapArtifacts(), readRoutes }
    : readRoutes()
}

// Every handler needs the same identity to reuse the static preparation. In
// production, the route walk only happens when the request needs dynamic sources,
// which are still read per request.
export const readSitemapContext = memoizeOnce({
  isEnabled: import.meta.env.PROD,
  render: createContext
})
