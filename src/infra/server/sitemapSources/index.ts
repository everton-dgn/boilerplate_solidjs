import 'server-only'
import type { SitemapPartitionSource } from '@/@types/sitemap.ts'

// As aplicações registram aqui as próprias fontes exclusivas do servidor.
export const sitemapSources: readonly SitemapPartitionSource[] = []
