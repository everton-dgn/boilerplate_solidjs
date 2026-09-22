import type { RouteDefinition } from '@solidjs/router'
import type { Answer, FAQPage, Question } from 'schema-dts'

import { createSeo } from '@/primitives/createSeo/index.ts'

// Página que publica JSON-LD próprio (FAQPage) ao lado do grafo base do createSeo.
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
  // Tipos concretos evitam inferir os nós aninhados contra toda a união de Thing.
  const answer: Answer = {
    '@type': 'Answer',
    text: 'Uma base para aplicações SolidJS com SSR.'
  }
  const question: Question = {
    '@type': 'Question',
    name: 'O que é o boilerplate?',
    acceptedAnswer: answer
  }
  createSeo({
    structuredData: (): FAQPage => ({
      '@type': 'FAQPage',
      mainEntity: [question]
    })
  })

  return (
    <main>
      <h1>Perguntas frequentes</h1>
    </main>
  )
}
