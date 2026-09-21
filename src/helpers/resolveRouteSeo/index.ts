import type {
  SeoArticle,
  SeoImage,
  SeoMetadata,
  SeoRouteInfo
} from '@/@types/seo.ts'
import { SITE } from '@/constants/site.ts'

type ResolveImageOptions = {
  base: SeoImage
  image: Partial<SeoImage> | undefined
}

type ResolveArticleOptions = {
  base: SeoArticle | undefined
  article: SeoArticle | undefined
}

function resolveImage({ base, image }: ResolveImageOptions): SeoImage {
  return {
    path: image?.path ?? base.path,
    width: image?.width ?? base.width,
    height: image?.height ?? base.height,
    alt: image?.alt ?? base.alt
  }
}

// Só grava as datas declaradas, para o resultado não carregar chaves
// `undefined` quando nenhuma rota fala de artigo.
function resolveArticle({
  base,
  article
}: ResolveArticleOptions): SeoArticle | undefined {
  if (!article) return base
  const resolved: SeoArticle = { ...base }
  if (article.datePublished !== undefined) {
    resolved.datePublished = article.datePublished
  }
  if (article.dateModified !== undefined) {
    resolved.dateModified = article.dateModified
  }
  return resolved
}

// A rota mais específica sobrescreve apenas os campos que declara; a imagem e
// as datas de artigo também são mescladas atributo a atributo.
export function resolveRouteSeo(
  metadata: readonly (SeoRouteInfo | undefined)[]
): SeoMetadata {
  const resolved: SeoMetadata = {
    title: SITE.title,
    description: SITE.description,
    noindex: false,
    type: 'website',
    image: { ...SITE.image }
  }
  for (const seo of metadata) {
    resolved.title = seo?.title ?? resolved.title
    resolved.description = seo?.description ?? resolved.description
    resolved.noindex = seo?.noindex ?? resolved.noindex
    resolved.type = seo?.type ?? resolved.type
    resolved.image = resolveImage({ base: resolved.image, image: seo?.image })
    const article = resolveArticle({
      base: resolved.article,
      article: seo?.article
    })
    if (article) resolved.article = article
  }
  return resolved
}
