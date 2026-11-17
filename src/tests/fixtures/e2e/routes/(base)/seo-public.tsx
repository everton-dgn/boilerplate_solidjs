import type { RouteDefinition } from '@solidjs/router'

export const route = {
  info: {
    seo: {
      title: 'Public guide',
      description: 'Public content of the guide.'
    },
    llms: { section: 'Guides' }
  }
} satisfies RouteDefinition

export default function PublicGuide() {
  return (
    <main>
      <h1>Public guide</h1>
    </main>
  )
}
