import type { RouteDefinition } from '@solidjs/router'

// Sem `llms`: entra no sitemap, mas fica fora do llms.txt.
export const route = {
  info: {
    seo: {
      title: 'Só no sitemap',
      description: 'Página indexável que não foi selecionada para o llms.txt.'
    }
  }
} satisfies RouteDefinition

export default function SitemapOnly() {
  return (
    <main>
      <h1>Só no sitemap</h1>
    </main>
  )
}
