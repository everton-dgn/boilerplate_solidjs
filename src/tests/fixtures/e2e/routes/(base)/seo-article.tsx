import type { RouteDefinition } from '@solidjs/router'

// Article with its own social image: covers `type` and `image` per route.
export const route = {
  info: {
    seo: {
      title: 'Sample article',
      description: 'Content of an article with its own image.',
      type: 'article',
      image: {
        path: '/favicon/apple-touch-icon.png',
        width: 180,
        height: 180,
        alt: 'Cover of the sample article'
      },
      article: { datePublished: '2026-09-01', dateModified: '2026-09-21' }
    }
  }
} satisfies RouteDefinition

export default function ArticlePage() {
  return (
    <main>
      <h1>Sample article</h1>
    </main>
  )
}
