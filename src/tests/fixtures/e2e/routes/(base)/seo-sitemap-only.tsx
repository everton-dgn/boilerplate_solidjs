import type { RouteDefinition } from '@solidjs/router'

// Without `llms`: it enters the sitemap, but stays out of llms.txt.
export const route = {
  info: {
    seo: {
      title: 'Sitemap only',
      description: 'Indexable page that was not selected for llms.txt.'
    }
  }
} satisfies RouteDefinition

export default function SitemapOnly() {
  return (
    <main>
      <h1>Sitemap only</h1>
    </main>
  )
}
