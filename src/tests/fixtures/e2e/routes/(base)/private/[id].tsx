import { useParams, type RouteDefinition } from '@solidjs/router'

// Route with a parameter and `noindex`: the source is ignored and nothing enters the sitemap.
export const route = {
  info: {
    seo: { title: 'Private area', noindex: true },
    sitemap: () => [{ path: '/private/1' }]
  }
} satisfies RouteDefinition

export default function PrivatePage() {
  const params = useParams()

  return (
    <main>
      <h1>Registro {params.id}</h1>
    </main>
  )
}
