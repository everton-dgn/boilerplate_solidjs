import type { RouteDefinition } from '@solidjs/router'

export const route = {
  info: {
    markdown: true,
    llms: false,
    seo: { title: 'Excluded Markdown', noindex: true }
  }
} satisfies RouteDefinition

export default function MarkdownNoindex() {
  return (
    <main>
      <h1>NOINDEX_CONTENT</h1>
    </main>
  )
}
