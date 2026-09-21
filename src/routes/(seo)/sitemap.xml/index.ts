import { pageRoutes } from 'virtual:file-routes'

import { memoizeOnce } from '@/helpers/memoizeOnce/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'

import { buildSitemapResponse } from './helpers/buildSitemapResponse/index.ts'
import { collectSitemapEntries } from './helpers/collectSitemapEntries/index.ts'

// Só a leitura do manifesto é memoizada: as fontes das rotas com parâmetros
// rodam a cada request, porque seus dados mudam sem novo build.
const readManifest = memoizeOnce({
  enabled: import.meta.env.PROD,
  render: () => collectSitemapEntries(pageRoutes)
})

export function GET(): Promise<Response> {
  return buildSitemapResponse({
    manifest: readManifest(),
    siteUrl: resolveSiteUrl('/')
  })
}
