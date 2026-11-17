type SeoPageType = 'website' | 'article'

export type SeoImage = {
  // Absolute site path (`/images/og.png`) or absolute URL.
  path: string
  width: number
  height: number
  alt: string
}

// Dates of the `Article` node in the JSON-LD, in ISO 8601 (`2026-09-21` or with
// time and time zone). Ignored when `type` is not `article`.
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

export type SeoRouteInfo = Partial<Omit<SeoMetadata, 'image'>> & {
  image?: Partial<SeoImage>
}
