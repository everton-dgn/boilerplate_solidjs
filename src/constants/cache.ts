// Cache-control das rotas geradas do manifesto: sitemap, robots e llms.txt.
// `s-maxage` deixa o CDN reutilizar a resposta por uma hora (a Vercel só
// cacheia resposta de função com essa diretiva); `max-age=0` evita cópia no
// navegador. Em desenvolvimento o manifesto muda e nada é guardado.
export const SITE_CACHE_CONTROL = import.meta.env.PROD
  ? 'public, max-age=0, s-maxage=3600'
  : 'no-store'
