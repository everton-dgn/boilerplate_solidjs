import { baseLocale } from '@paraglide/runtime.js'
import { paraglideMiddleware } from '@paraglide/server.js'

import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'
import { localizeHref } from '@/i18n/urls/index.ts'

// A descrição do site e os metadados das páginas leem o idioma do contexto
// Paraglide. O índice sai sempre no idioma base, inclusive na primeira
// requisição, que fica guardada em produção.
export function buildLlmsResponse(render: () => string): Promise<Response> {
  const url = resolveSiteUrl(localizeHref({ href: '/', locale: baseLocale }))
  return paraglideMiddleware(
    new Request(url),
    () =>
      new Response(render(), {
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'cache-control': SITE_CACHE_CONTROL
        }
      })
  )
}
