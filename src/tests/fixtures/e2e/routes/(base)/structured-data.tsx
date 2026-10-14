import type { RouteDefinition } from '@solidjs/router'
import type { Answer, FAQPage, Question } from 'schema-dts'

import { createSeo } from '@/primitives/createSeo/index.ts'
import { UNSAFE_JSON_LD_TEXT } from '@/tests/fixtures/structured-data.ts'

export const route = {
  info: {
    seo: {
      title: 'Perguntas frequentes',
      description: UNSAFE_JSON_LD_TEXT
    },
    llms: { section: 'Referência' }
  }
} satisfies RouteDefinition

export default function FaqPage() {
  // Tipos concretos evitam inferir os nós aninhados contra toda a união de Thing.
  const answer: Answer = {
    '@type': 'Answer',
    text: UNSAFE_JSON_LD_TEXT
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
