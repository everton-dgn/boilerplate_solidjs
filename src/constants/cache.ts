// Cache-control das rotas geradas do manifesto: sitemap, robots e llms.txt.
// O manifesto e a URL do site são fixos no build, então em produção caches
// podem reutilizar a resposta por até uma hora. Em desenvolvimento o manifesto
// muda e nada é guardado.
export const SITE_CACHE_CONTROL = import.meta.env.PROD
  ? 'public, max-age=3600'
  : 'no-store'
