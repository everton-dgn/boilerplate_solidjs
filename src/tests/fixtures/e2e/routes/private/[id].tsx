import { useParams, type RouteDefinition } from '@solidjs/router'

// Rota com parâmetro e `noindex`: a fonte é ignorada e nada entra no sitemap.
export const route = {
  info: {
    seo: { title: 'Área privada', noindex: true },
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
