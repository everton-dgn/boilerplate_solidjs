import { pageRoutes } from 'virtual:file-routes'

import { memoizeOnce } from '@/helpers/memoizeOnce/index.ts'

import { collectSitemapEntries } from '../collectSitemapEntries/index.ts'
import { matchSitemapRoute } from '../matchSitemapRoute/index.ts'

// Todos os handlers precisam da mesma identidade para reutilizar a preparação
// estática. As fontes de dados continuam sendo consultadas por requisição.
export const readSitemapContext = memoizeOnce({
  isEnabled: import.meta.env.PROD,
  render: () => ({
    manifest: collectSitemapEntries(pageRoutes),
    matchRoute: matchSitemapRoute(pageRoutes)
  })
})
