import { useParams } from '@solidjs/router'

export const route = {
  info: {
    seo: { title: 'Catálogo', description: 'Entrada pública do catálogo.' }
  }
}

export default function CatalogPage() {
  const params = useParams()
  return (
    <main>
      <h1>Entrada {params.id}</h1>
    </main>
  )
}
