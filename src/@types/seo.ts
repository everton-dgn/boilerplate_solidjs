export type SeoImage = {
  // Caminho absoluto no site (`/images/og.png`) ou URL absoluta.
  path: string
  width: number
  height: number
  alt: string
}

export type SeoPageType = 'website' | 'article'

export type SeoMetadata = {
  title: string
  description: string
  noindex: boolean
  type: SeoPageType
  image: SeoImage
}

// Formato aceito em `route.info.seo`: cada campo é opcional e a imagem pode
// sobrescrever só parte dos atributos herdados.
export type SeoRouteInfo = Partial<Omit<SeoMetadata, 'image'>> & {
  image?: Partial<SeoImage>
}
