// s-maxage permite cache no CDN; max-age=0 evita cache no navegador.
export const SITE_CACHE_CONTROL = import.meta.env.PROD
  ? 'public, max-age=0, s-maxage=3600'
  : 'no-store'
