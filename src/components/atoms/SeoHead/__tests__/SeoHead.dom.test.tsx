import {
  createRouter,
  memoryHistory,
  type RouteDefinition
} from '@solidjs/router'

import { SITE } from '@/constants/site.ts'
import {
  parseStructuredData,
  type StructuredData
} from '@/tests/helpers/parseStructuredData/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { SeoHead } from '../index.tsx'

type RenderAtOptions = {
  pathname: string
  routes?: readonly RouteDefinition[]
  // Sinal de que o head foi aplicado; por padrão, a canonical da rota.
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

function readCanonical(): string | null {
  return (
    document.head
      .querySelector('link[rel="canonical"]')
      ?.getAttribute('href') ?? null
  )
}

// O registro do head aplica e remove as tags em microtask após os efeitos.
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
        {props => (
          <>
            <SeoHead />
            {props.children}
          </>
        )}
      </Router>
    ),
    { providers: false }
  )
  await vi.waitUntil(ready)
  return SITE.url
}

describe('metadados de SEO no head', () => {
  it('publica canonical e og:url absolutos sem a query da rota', async () => {
    const base = await renderAt({ pathname: '/docs?tab=2' })

    expect(readCanonical()).toBe(`${base}/docs`)
    expect(readMeta('meta[property="og:url"]')).toBe(`${base}/docs`)
  })

  it('aponta a imagem social absoluta para Open Graph e Twitter', async () => {
    const base = await renderAt({ pathname: '/' })

    expect(readMeta('meta[property="og:image"]')).toBe(
      `${base}${SITE.image.path}`
    )
    expect(readMeta('meta[name="twitter:image"]')).toBe(
      `${base}${SITE.image.path}`
    )
  })

  it('descreve as dimensões e o texto alternativo da imagem', async () => {
    await renderAt({ pathname: '/' })

    expect(readMeta('meta[property="og:image:width"]')).toBe('1200')
    expect(readMeta('meta[property="og:image:height"]')).toBe('630')
    expect(readMeta('meta[property="og:image:alt"]')).toBe(SITE.image.alt)
    expect(readMeta('meta[name="twitter:image:alt"]')).toBe(SITE.image.alt)
  })

  it('publica og:type website e o JSON-LD da página por padrão', async () => {
    const base = await renderAt({ pathname: '/' })

    expect(readMeta('meta[property="og:type"]')).toBe('website')
    expect([
      readMeta('meta[property="og:locale"]'),
      readMeta('meta[property="og:site_name"]'),
      readMeta('meta[name="twitter:card"]')
    ]).toStrictEqual(['pt_BR', SITE.title, 'summary_large_image'])
    const graph = readStructuredData()
    expect(graph?.['@graph'][0]?.['@type']).toBe('WebSite')
    expect(graph?.['@graph'][1]).toMatchObject({
      '@type': 'WebPage',
      url: `${base}/`,
      name: SITE.title
    })
  })

  it('usa a imagem e o tipo declarados pela rota', async () => {
    const base = await renderAt({
      pathname: '/artigo',
      routes: [
        {
          path: '/artigo',
          info: {
            seo: {
              title: 'Artigo',
              type: 'article',
              image: { path: '/images/artigo.png', alt: 'Capa' }
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
    ]).toStrictEqual([`${base}/images/artigo.png`, `${base}/images/artigo.png`])
    expect([
      readMeta('meta[property="og:image:alt"]'),
      readMeta('meta[name="twitter:image:alt"]')
    ]).toStrictEqual(['Capa', 'Capa'])
    expect(readMeta('meta[property="og:image:width"]')).toBe('1200')
    expect(readStructuredData()?.['@graph'][1]).toMatchObject({
      '@type': 'Article',
      headline: 'Artigo'
    })
  })

  it('remove as tags ao desmontar e usa barra final na raiz', async () => {
    await vi.waitUntil(() => readCanonical() === null)
    const base = await renderAt({ pathname: '/' })

    expect(readCanonical()).toBe(`${base}/`)
  })

  it('usa os metadados de SITE quando a rota não declara SEO', async () => {
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

  it('publica os campos da rota filha e herda os demais do layout', async () => {
    await renderAt({
      pathname: '/docs/guia',
      routes: [
        {
          path: '/docs',
          info: {
            seo: { title: 'Documentação', description: 'Guias do projeto.' }
          },
          children: [
            {
              path: '/guia',
              info: { seo: { title: 'Primeiros passos' } },
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
    ]).toStrictEqual([
      'Primeiros passos',
      'Primeiros passos',
      'Primeiros passos'
    ])
    expect([
      readMeta('meta[name="description"]'),
      readMeta('meta[property="og:description"]'),
      readMeta('meta[name="twitter:description"]')
    ]).toStrictEqual([
      'Guias do projeto.',
      'Guias do projeto.',
      'Guias do projeto.'
    ])
  })

  it('publica só robots, título e descrição em rota noindex', async () => {
    await vi.waitUntil(() => readCanonical() === null)
    await renderAt({
      pathname: '/restrita',
      routes: [
        {
          path: '/restrita',
          info: {
            seo: {
              title: 'Área restrita',
              description: 'Conteúdo interno.',
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
    ]).toStrictEqual(['noindex', 'Área restrita', 'Conteúdo interno.'])
    expect([
      readCanonical(),
      readMeta('meta[property="og:type"]'),
      readMeta('meta[property="og:title"]'),
      readMeta('meta[property="og:url"]'),
      readMeta('meta[property="og:image"]'),
      readMeta('meta[name="twitter:title"]'),
      readMeta('meta[name="twitter:image"]'),
      readStructuredData()
    ]).toStrictEqual([null, null, null, null, null, null, null, null])
  })
})
