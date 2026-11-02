import type { SitemapPartitionSource } from '@/@types/sitemap.ts'

import { isPartRemoved } from './state.ts'

export const fixtureSitemapSources: readonly SitemapPartitionSource[] = [
  {
    id: 'catalog',
    routePath: '/catalog/:id',
    listPartitions: ({ limit, signal }) => {
      signal.throwIfAborted()
      return Promise.resolve(
        (isPartRemoved() ? ['b'] : ['a', 'b']).slice(0, limit)
      )
    },
    readPartition: ({ id, limit, signal }) => {
      signal.throwIfAborted()
      if (limit < 1) return Promise.resolve([])
      if (id === 'a') {
        return Promise.resolve(
          isPartRemoved() ? [] : [{ path: '/catalog/a-1' }]
        )
      }
      if (id === 'b') return Promise.resolve([{ path: '/catalog/b-1' }])
      return Promise.resolve([])
    }
  }
]
