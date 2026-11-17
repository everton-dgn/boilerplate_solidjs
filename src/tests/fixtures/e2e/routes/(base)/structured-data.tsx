import type { RouteDefinition } from '@solidjs/router'
import type { Answer, FAQPage, Question } from 'schema-dts'

import { createSeo } from '@/primitives/createSeo/index.ts'
import { UNSAFE_JSON_LD_TEXT } from '@/tests/fixtures/structured-data.ts'

export const route = {
  info: {
    seo: {
      title: 'Frequently asked questions',
      description: UNSAFE_JSON_LD_TEXT
    },
    llms: { section: 'Reference' }
  }
} satisfies RouteDefinition

export default function FaqPage() {
  // Concrete types avoid inferring the nested nodes against the whole Thing union.
  const answer: Answer = {
    '@type': 'Answer',
    text: UNSAFE_JSON_LD_TEXT
  }
  const question: Question = {
    '@type': 'Question',
    name: 'What is the boilerplate?',
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
      <h1>Frequently asked questions</h1>
    </main>
  )
}
