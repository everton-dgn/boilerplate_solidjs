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

// Todos os handlers precisam da mesma identidade para reutilizar a preparação
// estática. Em produção, o percurso das rotas só acontece quando o pedido
// precisa de fontes dinâmicas, que continuam consultadas por requisição.
export const readSitemapContext = memoizeOnce({
  isEnabled: import.meta.env.PROD,
  render: createContext
})
