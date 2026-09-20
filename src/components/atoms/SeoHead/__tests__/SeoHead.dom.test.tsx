import { createRouter, memoryHistory } from '@solidjs/router'

import { SITE } from '@/constants/site.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { SeoHead } from '../index.tsx'

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
async function renderAt(pathname: string): Promise<string> {
  const Router = createRouter({
    routes: [{ path: '/*rest', component: () => <SeoHead /> }],
    history: memoryHistory(pathname)
  })
  renderComponent(() => <Router />, { providers: false })
  await vi.waitUntil(() => readCanonical() !== null)
  return SITE.url ?? globalThis.location.origin
}

describe('metadados de SEO no head', () => {
  it('publica canonical e og:url absolutos sem a query da rota', async () => {
    const base = await renderAt('/docs?tab=2')

    expect(readCanonical()).toBe(`${base}/docs`)
    expect(readMeta('meta[property="og:url"]')).toBe(`${base}/docs`)
  })

  it('aponta a imagem social absoluta para Open Graph e Twitter', async () => {
    const base = await renderAt('/')

    expect(readMeta('meta[property="og:image"]')).toBe(
      `${base}${SITE.image.path}`
    )
    expect(readMeta('meta[name="twitter:image"]')).toBe(
      `${base}${SITE.image.path}`
    )
  })

  it('descreve as dimensões e o texto alternativo da imagem', async () => {
    await renderAt('/')

    expect(readMeta('meta[property="og:image:width"]')).toBe('1200')
    expect(readMeta('meta[property="og:image:height"]')).toBe('630')
    expect(readMeta('meta[property="og:image:alt"]')).toBe(SITE.image.alt)
  })

  it('remove as tags ao desmontar e usa barra final na raiz', async () => {
    await vi.waitUntil(() => readCanonical() === null)
    const base = await renderAt('/')

    expect(readCanonical()).toBe(`${base}/`)
  })
})
