import type { RouteDefinition } from '@solidjs/router'

export const route = {
  info: {
    seo: { title: 'Utility page', noindex: true }
  }
} satisfies RouteDefinition

export default function UtilityPage() {
  return (
    <main>
      <h1>Utility page</h1>
    </main>
  )
}
