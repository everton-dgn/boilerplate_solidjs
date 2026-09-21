import type { RouteDefinition } from '@solidjs/router'

import { createStructuredData } from '@/primitives/createStructuredData/index.ts'

// Página que publica JSON-LD próprio (FAQPage) ao lado do grafo base do SeoHead.
export const route = {
  info: {
    seo: {
      title: 'Perguntas frequentes',
      description: 'Dúvidas comuns sobre o boilerplate.'
    },
    llms: { section: 'Referência' }
  }
} satisfies RouteDefinition

export default function FaqPage() {
  createStructuredData(() => ({
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'O que é o boilerplate?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Uma base para aplicações SolidJS com SSR.'
        }
      }
    ]
  }))

  return (
    <main>
      <h1>Perguntas frequentes</h1>
    </main>
  )
}
