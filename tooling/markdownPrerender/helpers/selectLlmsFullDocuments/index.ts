import type { LlmsFullDocument, LlmsFullOmission } from '../../types.ts'

type IndexLink = { href: string }
type SelectionOptions = {
  links: readonly IndexLink[]
  siteUrl: string
  inventory: ReadonlySet<string>
  baseLocalePaths: ReadonlySet<string>
  ownPaths: ReadonlySet<string>
}
type Selection = {
  documents: LlmsFullDocument[]
  omitted: LlmsFullOmission[]
}
type Classification =
  | { document: LlmsFullDocument }
  | { reason: string }
  | undefined

type ClassifyOptions = Omit<SelectionOptions, 'links' | 'siteUrl'> & {
  href: string
  origin: string
}

function classify({
  href,
  origin,
  inventory,
  baseLocalePaths,
  ownPaths
}: ClassifyOptions): Classification {
  let url: URL
  let path: string
  try {
    url = new URL(href)
    path = decodeURI(url.pathname)
  } catch {
    return { reason: 'invalid URL' }
  }
  if (url.origin !== origin) return { reason: 'external link' }
  if (ownPaths.has(path)) return undefined
  // A query pertence à página renderizada na requisição, não ao arquivo.
  if (url.search) return { reason: 'URL with query, served on request' }
  if (!path.endsWith('.md')) return { reason: 'HTML page without Markdown' }
  if (!inventory.has(path)) return { reason: 'Markdown generated on request' }
  if (!baseLocalePaths.has(path)) return { reason: 'page in another language' }
  url.hash = ''
  return { document: { url: url.href, path } }
}

// Cada documento entra uma vez, na posição do primeiro link; fragmentos
// apontam para o mesmo documento. Links que não levam a um `.md` estático
// aprovado do idioma base ficam declarados como não incluídos, sem nenhuma
// requisição.
export function selectLlmsFullDocuments({
  links,
  siteUrl,
  inventory,
  baseLocalePaths,
  ownPaths
}: SelectionOptions): Selection {
  const { origin } = new URL(siteUrl)
  const documents = new Map<string, LlmsFullDocument>()
  const omitted = new Map<string, LlmsFullOmission>()
  for (const { href } of links) {
    const result = classify({
      href,
      origin,
      inventory,
      baseLocalePaths,
      ownPaths
    })
    if (!result) continue
    if ('document' in result) {
      const { document } = result
      if (!documents.has(document.path)) documents.set(document.path, document)
      continue
    }
    if (!omitted.has(href)) {
      omitted.set(href, { url: href, reason: result.reason })
    }
  }
  return { documents: [...documents.values()], omitted: [...omitted.values()] }
}
