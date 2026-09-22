import type { RouteDefinition } from '@solidjs/router'

export const route = {
  info: {
    seo: {
      title: 'Guia público',
      description: 'Conteúdo público do guia.'
    },
    llms: { section: 'Guias' }
  }
} satisfies RouteDefinition

export default function PublicGuide() {
  return (
    <main>
      <h1>Guia público</h1>
    </main>
  )
}
