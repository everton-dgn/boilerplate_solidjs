import { SITE } from '@/constants/site.ts'

export function resolveSiteUrl(pathname: string): string {
  return new URL(pathname, SITE.url).href
}
