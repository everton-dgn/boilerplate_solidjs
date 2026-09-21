import { SITE } from '@/constants/site.ts'

// URL pública absoluta de um caminho: a origem vem de VITE_SITE_URL, cujos
// caminho e query são ignorados.
export function resolveSiteUrl(pathname: string): string {
  return new URL(pathname, SITE.url).href
}
