// s-maxage allows the CDN cache; max-age=0 prevents the browser cache. With
// stale-if-error, the Vercel CDN keeps serving the last good copy for up to a day
// after s-maxage when the function answers with an error.
export const SITE_CACHE_CONTROL = import.meta.env.PROD
  ? 'public, max-age=0, s-maxage=3600, stale-if-error=86400'
  : 'no-store'
