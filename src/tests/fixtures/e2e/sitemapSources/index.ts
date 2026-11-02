import type { SitemapPartitionSource } from '@/@types/sitemap.ts'

export const fixtureSitemapSources: readonly SitemapPartitionSource[] = [
  {
    id: 'catalog',
    routePath: '/catalog/:id',
    listPartitions: () => Promise.resolve(['a', 'b']),
    readPartition: ({ id, limit, signal }) => {
      signal.throwIfAborted()
      if (limit < 1) return Promise.resolve([])
      if (id === 'a') return Promise.resolve([{ path: '/catalog/a-1' }])
      if (id === 'b') return Promise.resolve([{ path: '/catalog/b-1' }])
      return Promise.resolve([])
    }
  }
]
