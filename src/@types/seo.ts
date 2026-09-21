type SeoPageType = 'website' | 'article'

export type SeoImage = {
  // Caminho absoluto no site (`/images/og.png`) ou URL absoluta.
  path: string
  width: number
  height: number
  alt: string
}

// Datas do nó `Article` no JSON-LD, em ISO 8601 (`2026-09-21` ou com hora e
// fuso). Ignoradas quando `type` não é `article`.
export type SeoArticle = {
  datePublished?: string
  dateModified?: string
}

export type SeoMetadata = {
  title: string
  description: string
  noindex: boolean
  type: SeoPageType
  image: SeoImage
  article?: SeoArticle
}

// Formato aceito em `route.info.seo`: cada campo é opcional e a imagem pode
// sobrescrever só parte dos atributos herdados.
export type SeoRouteInfo = Partial<Omit<SeoMetadata, 'image'>> & {
  image?: Partial<SeoImage>
}
