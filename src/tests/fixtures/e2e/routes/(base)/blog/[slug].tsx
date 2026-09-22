import { useParams, type RouteDefinition } from '@solidjs/router'

import { listBlogEntries } from '@/tests/fixtures/e2e/blog/listBlogEntries/index.ts'

// Rota com parâmetro: entra no sitemap só pelas entradas da fonte.
export const route = {
  info: {
    seo: {
      title: 'Blog',
      description: 'Posts de exemplo para o sitemap.',
      type: 'article'
    },
    sitemap: listBlogEntries
  }
} satisfies RouteDefinition

export default function BlogPost() {
  const params = useParams()

  return (
    <main>
      <h1>Post {params.slug}</h1>
    </main>
  )
}
