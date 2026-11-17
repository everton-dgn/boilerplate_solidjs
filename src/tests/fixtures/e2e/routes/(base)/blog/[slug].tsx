import { useParams, type RouteDefinition } from '@solidjs/router'

import { listBlogEntries } from '@/tests/fixtures/e2e/blog/listBlogEntries/index.ts'

// Route with a parameter: it enters the sitemap only through the source entries.
export const route = {
  info: {
    seo: {
      title: 'Blog',
      description: 'Sample posts for the sitemap.',
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
