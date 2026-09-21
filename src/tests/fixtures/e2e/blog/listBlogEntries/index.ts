import type { SitemapEntry } from '@/@types/sitemap.ts'

// Fonte do sitemap para `blog/[slug]`. Server function porque o módulo da
// rota entra no bundle do cliente; uma fonte real leria o banco aqui. A barra
// final e a data inválida cobrem a normalização das entradas.
export async function listBlogEntries(): Promise<SitemapEntry[]> {
  'use server'
  // No lugar da leitura do banco.
  await Promise.resolve()
  return [
    { path: '/blog/primeiro-post', lastmod: '2026-09-10' },
    { path: '/blog/segundo-post/', lastmod: 'ontem' }
  ]
}
