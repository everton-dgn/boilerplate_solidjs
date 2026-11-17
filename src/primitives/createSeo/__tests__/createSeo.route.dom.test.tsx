import {
  createRouter,
  memoryHistory,
  type RouteDefinition
} from '@solidjs/router'
import { render } from '@solidjs/web'

import { SITE } from '@/constants/site/index.ts'
import { POLL, readCanonical } from '@/tests/helpers/headTags/index.ts'
import {
  parseStructuredData,
  type StructuredData
} from '@/tests/helpers/parseStructuredData/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { createSeo } from '../index.ts'

type RenderAtOptions = {
  pathname: string
  routes?: readonly RouteDefinition[]
  // Sign that the head was applied; by default, the canonical of the route.
  ready?: () => boolean
}

function readMeta(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute('content') ?? null
}

function readStructuredData(): StructuredData | null {
  const script = document.head.querySelector(
    'script[type="application/ld+json"]'
  )
  return script?.textContent ? parseStructuredData(script.textContent) : null
}

// The order of the nodes does not matter in JSON-LD; finds it by `@type`.
function readNode(type: string): StructuredData['@graph'][number] | undefined {
  return readStructuredData()?.['@graph'].find(node => node['@type'] === type)
}

// The head registry applies and removes the tags in a microtask after the effects.
async function renderAt({
  pathname,
  routes = [{ path: '/*rest', component: () => null }],
  ready = () => readCanonical() !== null
}: RenderAtOptions): Promise<string> {
  const Router = createRouter({
    routes,
    history: memoryHistory(pathname)
  })
  renderComponent(
    () => (
      <Router>
        {props => {
          createSeo({ route: true })
          return props.children
        }}
      </Router>
    ),
    { hasProviders: false }
  )
  await vi.waitUntil(ready, POLL)
  return SITE.url
}

describe('SEO metadata in the head', () => {
  it('publishes absolute canonical and og:url without the query of the route', async () => {
    const base = await renderAt({ pathname: '/docs?tab=2' })

    expect(readCanonical()).toBe(`${base}/en/docs`)
    expect(readMeta('meta[property="og:url"]')).toBe(`${base}/en/docs`)
  })

  it('points the absolute social image to Open Graph and Twitter', async () => {
    const base = await renderAt({ pathname: '/' })

    expect(readMeta('meta[property="og:image"]')).toBe(
      `${base}${SITE.image.path}`
    )
    expect(readMeta('meta[name="twitter:image"]')).toBe(
      `${base}${SITE.image.path}`
    )
  })

  it('describes the dimensions and the alternative text of the image', async () => {
    await renderAt({ pathname: '/' })

    expect(readMeta('meta[property="og:image:width"]')).toBe('1200')
    expect(readMeta('meta[property="og:image:height"]')).toBe('630')
    expect(readMeta('meta[property="og:image:alt"]')).toBe(SITE.image.alt)
    expect(readMeta('meta[name="twitter:image:alt"]')).toBe(SITE.image.alt)
  })

  it('publishes og:type website and the JSON-LD of the page by default', async () => {
    const base = await renderAt({ pathname: '/' })

    expect(readMeta('meta[property="og:type"]')).toBe('website')
    expect([
      readMeta('meta[property="og:locale"]'),
      readMeta('meta[property="og:site_name"]'),
      readMeta('meta[name="twitter:card"]'),
      readMeta('meta[name="twitter:site"]'),
      readMeta('meta[name="twitter:creator"]')
    ]).toStrictEqual([
      'en_US',
      SITE.title,
      'summary_large_image',
      SITE.twitter,
      SITE.author.twitter
    ])
    expect(readNode('WebSite')).toBeDefined()
    expect(readNode('WebPage')).toMatchObject({
      url: `${base}/en`,
      name: SITE.title
    })
  })

  it('uses the image and the type declared by the route', async () => {
    const base = await renderAt({
      pathname: '/article',
      routes: [
        {
          path: '/article',
          info: {
            seo: {
              title: 'Article',
              type: 'article',
              image: { path: '/images/article.png', alt: 'Cover' }
            }
          },
          component: () => null
        }
      ]
    })

    expect(readMeta('meta[property="og:type"]')).toBe('article')
    expect([
      readMeta('meta[property="og:image"]'),
      readMeta('meta[name="twitter:image"]')
    ]).toStrictEqual([
      `${base}/images/article.png`,
      `${base}/images/article.png`
    ])
    expect([
      readMeta('meta[property="og:image:alt"]'),
      readMeta('meta[name="twitter:image:alt"]')
    ]).toStrictEqual(['Cover', 'Cover'])
    expect([
      readMeta('meta[property="og:image:width"]'),
      readMeta('meta[property="article:published_time"]')
    ]).toStrictEqual(['1200', null])
    expect(readNode('Article')).toMatchObject({ headline: 'Article' })
  })

  it('removes the tags on unmount and uses a trailing slash at the root', async () => {
    await vi.waitUntil(() => readCanonical() === null, POLL)
    const Router = createRouter({
      routes: [{ path: '/*rest', component: () => null }],
      history: memoryHistory('/')
    })
    const host = document.createElement('div')
    document.body.append(host)
    onTestFinished(() => host.remove())
    const dispose = render(
      () => (
        <Router>
          {props => {
            createSeo({ route: true })
            return props.children
          }}
        </Router>
      ),
      host
    )
    await vi.waitUntil(() => readCanonical() !== null, POLL)
    expect(readCanonical()).toBe(`${SITE.url}/en`)
    expect(readMeta('meta[property="og:url"]')).toBe(`${SITE.url}/en`)

    dispose()
    await vi.waitUntil(() => readCanonical() === null, POLL)
    expect(readMeta('meta[property="og:url"]')).toBeNull()
  })

  it('uses the SITE metadata when the route declares no SEO', async () => {
    await renderAt({ pathname: '/' })

    expect([
      document.title,
      readMeta('meta[property="og:title"]'),
      readMeta('meta[name="twitter:title"]')
    ]).toStrictEqual([SITE.title, SITE.title, SITE.title])
    expect([
      readMeta('meta[name="description"]'),
      readMeta('meta[property="og:description"]'),
      readMeta('meta[name="twitter:description"]')
    ]).toStrictEqual([SITE.description, SITE.description, SITE.description])
  })

  it('publishes the fields of the child route and inherits the others from the layout', async () => {
    await renderAt({
      pathname: '/docs/guia',
      routes: [
        {
          path: '/docs',
          info: {
            seo: { title: 'Documentation', description: 'Project guides.' }
          },
          children: [
            {
              path: '/guia',
              info: { seo: { title: 'Getting started' } },
              component: () => null
            }
          ]
        }
      ]
    })

    expect([
      document.title,
      readMeta('meta[property="og:title"]'),
      readMeta('meta[name="twitter:title"]')
    ]).toStrictEqual(['Getting started', 'Getting started', 'Getting started'])
    expect([
      readMeta('meta[name="description"]'),
      readMeta('meta[property="og:description"]'),
      readMeta('meta[name="twitter:description"]')
    ]).toStrictEqual(['Project guides.', 'Project guides.', 'Project guides.'])
  })
})

describe('indexing and article Open Graph', () => {
  it('allows the large image preview on an indexable route', async () => {
    await vi.waitUntil(() => readMeta('meta[name="robots"]') === null, POLL)
    await renderAt({ pathname: '/' })

    expect(readMeta('meta[name="robots"]')).toBe(
      'index, follow, max-image-preview:large'
    )
  })

  it('publishes the article dates in Open Graph', async () => {
    await renderAt({
      pathname: '/article',
      routes: [
        {
          path: '/article',
          info: {
            seo: {
              type: 'article',
              article: {
                datePublished: '2026-09-01',
                dateModified: '2026-09-21'
              }
            }
          },
          component: () => null
        }
      ]
    })

    expect([
      readMeta('meta[property="article:published_time"]'),
      readMeta('meta[property="article:modified_time"]')
    ]).toStrictEqual(['2026-09-01', '2026-09-21'])
  })

  it('publishes only the date that the article declares', async () => {
    await vi.waitUntil(
      () => readMeta('meta[property="article:published_time"]') === null,
      POLL
    )
    await renderAt({
      pathname: '/article',
      routes: [
        {
          path: '/article',
          info: {
            seo: { type: 'article', article: { dateModified: '2026-09-21' } }
          },
          component: () => null
        }
      ]
    })

    expect([
      readMeta('meta[property="article:published_time"]'),
      readMeta('meta[property="article:modified_time"]')
    ]).toStrictEqual([null, '2026-09-21'])
  })

  it('leaves out the article dates on a noindex route', async () => {
    await vi.waitUntil(() => readMeta('meta[name="robots"]') === null, POLL)
    await renderAt({
      pathname: '/rascunho',
      routes: [
        {
          path: '/rascunho',
          info: {
            seo: {
              type: 'article',
              noindex: true,
              article: { datePublished: '2026-09-01' }
            }
          },
          component: () => null
        }
      ],
      ready: () => readMeta('meta[name="robots"]') === 'noindex'
    })

    expect([
      readMeta('meta[property="article:published_time"]'),
      readMeta('meta[property="og:type"]')
    ]).toStrictEqual([null, null])
  })

  it('leaves out the article dates on a page that is not an article', async () => {
    await vi.waitUntil(
      () => readMeta('meta[property="article:published_time"]') === null,
      POLL
    )
    await renderAt({
      pathname: '/guia',
      routes: [
        {
          path: '/guia',
          info: { seo: { article: { datePublished: '2026-09-01' } } },
          component: () => null
        }
      ]
    })

    expect(readMeta('meta[property="article:published_time"]')).toBeNull()
  })

  it('publishes only robots, title and description on a noindex route', async () => {
    await vi.waitUntil(() => readCanonical() === null, POLL)
    await renderAt({
      pathname: '/restrita',
      routes: [
        {
          path: '/restrita',
          info: {
            seo: {
              title: 'Restricted area',
              description: 'Internal content.',
              noindex: true
            }
          },
          component: () => null
        }
      ],
      ready: () => readMeta('meta[name="robots"]') !== null
    })

    expect([
      readMeta('meta[name="robots"]'),
      document.title,
      readMeta('meta[name="description"]')
    ]).toStrictEqual(['noindex', 'Restricted area', 'Internal content.'])
    expect([
      readCanonical(),
      readMeta('meta[property="og:type"]'),
      readMeta('meta[property="og:title"]'),
      readMeta('meta[property="og:url"]'),
      readMeta('meta[property="og:image"]'),
      readMeta('meta[name="twitter:title"]'),
      readMeta('meta[name="twitter:image"]'),
      readMeta('meta[name="twitter:site"]'),
      readStructuredData()
    ]).toStrictEqual([null, null, null, null, null, null, null, null, null])
  })
})
