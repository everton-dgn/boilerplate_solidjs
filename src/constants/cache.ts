// s-maxage permite cache no CDN; max-age=0 evita cache no navegador. Com
// stale-if-error, o CDN da Vercel continua servindo a última cópia boa por até
// um dia depois do s-maxage quando a função responde com erro.
export const SITE_CACHE_CONTROL = import.meta.env.PROD
  ? 'public, max-age=0, s-maxage=3600, stale-if-error=86400'
  : 'no-store'
