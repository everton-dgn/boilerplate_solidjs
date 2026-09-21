import { env } from 'node:process'

// Origem pública dos metadados de SEO. A configuração do Playwright exporta
// VITE_SITE_URL com a mesma precedência do build.
export function readSiteOrigin(): string {
  const siteUrl = env.VITE_SITE_URL
  if (!siteUrl) throw new Error('Missing VITE_SITE_URL')
  return new URL(siteUrl).origin
}
