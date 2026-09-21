import type { RouteDefinition } from '@solidjs/router'

export const route = {
  info: {
    seo: { title: 'Página utilitária', noindex: true }
  }
} satisfies RouteDefinition

export default function UtilityPage() {
  return (
    <main>
      <h1>Página utilitária</h1>
    </main>
  )
}
