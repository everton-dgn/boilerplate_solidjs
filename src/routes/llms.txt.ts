import type { APIEvent } from 'filesystem-routing/api'
import { pageRoutes } from 'virtual:file-routes'

import { SITE } from '@/constants/site.ts'
import { buildLlmsText } from '@/helpers/buildLlmsText/index.ts'
import { collectLlmsPages } from '@/helpers/collectLlmsPages/index.ts'
import { resolveSiteUrl } from '@/helpers/resolveSiteUrl/index.ts'

type RenderedText = {
  siteUrl: string
  text: string
}

// Conteúdo público: em produção, caches podem reutilizar a resposta por até
// uma hora. Em desenvolvimento o manifesto muda; nem o cliente nem o processo
// guardam a resposta.
const MAX_AGE_SECONDS = 3600
const CACHE_CONTROL = import.meta.env.PROD
  ? `public, max-age=${MAX_AGE_SECONDS}`
  : 'no-store'

// O manifesto é fixo no build, então o texto só muda com a URL do site. Uma
// única entrada, substituída quando a URL muda, evita crescer com origens
// arbitrárias quando VITE_SITE_URL não está definida.
let rendered: RenderedText | undefined

function renderLlmsText(siteUrl: string): string {
  if (rendered?.siteUrl === siteUrl) return rendered.text
  const text = buildLlmsText({
    title: SITE.title,
    description: SITE.description,
    pages: collectLlmsPages({ routes: pageRoutes }),
    siteUrl
  })
  if (import.meta.env.PROD) rendered = { siteUrl, text }
  return text
}

export function GET(event: APIEvent): Response {
  const siteUrl = resolveSiteUrl({
    pathname: '/',
    origin: new URL(event.request.url).origin,
    siteUrl: SITE.url
  })

  return new Response(renderLlmsText(siteUrl), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': CACHE_CONTROL
    }
  })
}
