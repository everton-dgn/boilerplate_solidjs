import {
  createRouter,
  memoryHistory,
  type RouteDefinition
} from '@solidjs/router'

import { SITE } from '@/constants/site.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { SeoHead } from '../index.tsx'

type RenderAtOptions = {
  pathname: string
  routes?: readonly RouteDefinition[]
}

function readMeta(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute('content') ?? null
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
  routes = [{ path: '/*rest', component: () => null }]
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
  await vi.waitUntil(() => readCanonical() !== null)
  return SITE.url ?? globalThis.location.origin
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
})
