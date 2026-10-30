import { SITE } from '@/constants/site/index.ts'

export function resolveSiteUrl(pathname: string): string {
  return new URL(pathname, SITE.url).href
}
