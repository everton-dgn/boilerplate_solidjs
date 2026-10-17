import type { RouteDefinition } from '@solidjs/router'

export const route = {
  info: { markdown: false, llms: false, seo: { title: 'Opted out Markdown' } }
} satisfies RouteDefinition

export default function MarkdownOptout() {
  return (
    <main>
      <h1>OPTOUT_CONTENT</h1>
    </main>
  )
}
