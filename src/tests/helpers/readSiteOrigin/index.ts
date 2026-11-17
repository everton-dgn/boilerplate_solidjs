import { env } from 'node:process'

// Public origin of the SEO metadata. The Playwright configuration exports
// VITE_SITE_URL with the same precedence as the build.
export function readSiteOrigin(): string {
  const siteUrl = env.VITE_SITE_URL
  if (!siteUrl) throw new Error('Missing VITE_SITE_URL')
  return new URL(siteUrl).origin
}
