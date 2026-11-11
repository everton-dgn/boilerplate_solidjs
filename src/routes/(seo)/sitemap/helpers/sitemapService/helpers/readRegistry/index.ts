import type { SitemapPartitionSource } from '@/@types/sitemap.ts'
import type { SitemapManifest } from '@/routes/(seo)/sitemap/types.ts'

import { SOURCE_ID_PATTERN } from '../../constants.ts'
import type { PageCatalog } from '../../types.ts'

type RegistryOptions = {
  catalog: PageCatalog
  sources: readonly SitemapPartitionSource[]
}
type ManifestRegistryOptions = {
  manifest: SitemapManifest
  sources: readonly SitemapPartitionSource[]
}

const registries = new WeakMap<
  SitemapManifest,
  WeakMap<
    readonly SitemapPartitionSource[],
    Map<string, SitemapPartitionSource>
  >
>()

function getRegistry({
  manifest,
  sources
}: ManifestRegistryOptions): Map<string, SitemapPartitionSource> {
  let bySources = registries.get(manifest)
  if (!bySources) {
    bySources = new WeakMap()
    registries.set(manifest, bySources)
  }
  const cached = bySources.get(sources)
  if (cached) return cached
  const ids = new Map<string, SitemapPartitionSource>()
  const routes = new Set<string>()
  const eligible = new Set(
    manifest.dynamicRoutes
      ?.filter(route => route.isIndexable)
      .map(route => route.path)
  )
  const arrayRoutes = new Set(manifest.sourceRoutes)
  for (const source of sources) {
    if (
      !SOURCE_ID_PATTERN.test(source.id) ||
      source.id === 'pages' ||
      source.id === 'array' ||
      ids.has(source.id)
    ) {
      throw new Error('Invalid source ID')
    }
    ids.set(source.id, source)
    if (routes.has(source.routePath)) {
      throw new Error('Two sources on the same route')
    }
    if (arrayRoutes.has(source.routePath)) {
      throw new Error('Array and partitioned sources on the same route')
    }
    routes.add(source.routePath)
    if (!eligible.has(source.routePath)) {
      throw new Error('Source route is not eligible')
    }
  }
  bySources.set(sources, ids)
  return ids
}

// Sem fonte registrada não há o que validar, e a produção evita percorrer rotas.
export function readRegistry({
  catalog,
  sources
}: RegistryOptions): Map<string, SitemapPartitionSource> {
  if (sources.length === 0) return new Map()
  return getRegistry({ manifest: catalog.readRoutes().manifest, sources })
}
