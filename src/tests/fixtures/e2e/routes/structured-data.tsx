import type { RouteDefinition } from '@solidjs/router'

import { StructuredData } from '@/components/atoms/StructuredData/index.tsx'

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
  return (
    <main>
      <h1>Perguntas frequentes</h1>
      <StructuredData
        data={{
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
        }}
      />
    </main>
  )
}
