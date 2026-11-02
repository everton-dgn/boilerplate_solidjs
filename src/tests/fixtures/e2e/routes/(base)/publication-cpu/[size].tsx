import { useParams, type RouteDefinition } from '@solidjs/router'

const LARGE_REPETITIONS = 120_000
const SMALL_REPETITIONS = 100

export const route = {
  info: {
    markdown: 'dynamic',
    llms: false,
    seo: { title: 'Publication CPU fixture' }
  }
} satisfies RouteDefinition

export default function PublicationCpu() {
  const params = useParams()
  return (
    <main>
      <h1>Publication CPU fixture</h1>
      <p>
        {'Public text. '.repeat(
          params.size === 'large' ? LARGE_REPETITIONS : SMALL_REPETITIONS
        )}
      </p>
    </main>
  )
}
