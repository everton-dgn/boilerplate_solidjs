import { useParams } from '@solidjs/router'

export const route = {
  info: {
    seo: { title: 'Catalog', description: 'Public catalog entry.' }
  }
}

export default function CatalogPage() {
  const params = useParams()
  return (
    <main>
      <h1>Entry {params.id}</h1>
    </main>
  )
}
