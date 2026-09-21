import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'

export function GET(): Response {
  const sitemap = resolveSiteUrl('/sitemap.xml')

  return new Response(`User-agent: *\nAllow: /\nSitemap: ${sitemap}\n`, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': SITE_CACHE_CONTROL
    }
  })
}
