import type { RouteDefinition } from '@solidjs/router'

// Artigo com imagem social própria: cobre `type` e `image` por rota.
export const route = {
  info: {
    seo: {
      title: 'Artigo de exemplo',
      description: 'Conteúdo de um artigo com imagem própria.',
      type: 'article',
      image: { path: '/images/article.png', alt: 'Capa do artigo de exemplo' }
    }
  }
} satisfies RouteDefinition

export default function ArticlePage() {
  return (
    <main>
      <h1>Artigo de exemplo</h1>
    </main>
  )
}
