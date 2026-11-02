import { m } from '@paraglide/messages.js'
import { baseLocale, getLocale } from '@paraglide/runtime.js'
import { paraglideMiddleware } from '@paraglide/server.js'
import type { RouteInfo } from '@solidjs/router'

import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'
import { SITE } from '@/constants/site/index.ts'
import { Router } from '@/router.ts'

import { GET } from '../index.ts'

type MatchOptions = { pattern: string; info: RouteInfo }

const BASE_DESCRIPTION = m.site_description({}, { locale: 'en' })
const PORTUGUESE_DESCRIPTION = m.site_description({}, { locale: 'pt' })
const INDEX_LANGUAGE =
  new Intl.DisplayNames(['en'], { type: 'language' }).of(baseLocale) ??
  baseLocale

const FULL_LINK = `(${new URL('/llms-full.txt', SITE.url).href})`

function matchEvery({ pattern, info }: MatchOptions): void {
  vi.spyOn(Router, 'match').mockImplementation(path => [
    { path, pattern, match: path, params: {}, info }
  ])
}

// Contexto de uma requisição em português, como o de uma página localizada.
function inPortuguese(read: () => Promise<Response>): Promise<Response> {
  return paraglideMiddleware(new Request('https://example.com/pt/'), () => {
    expect(getLocale()).toBe('pt')
    return read()
  })
}

describe('rota do llms.txt', () => {
  it('publica o mesmo índice dentro e fora de um contexto em português', async () => {
    const baseResponse = await GET()
    const base = await baseResponse.text()

    const response = await inPortuguese(() => GET())

    await expect(response.text()).resolves.toBe(base)
    expect(base).toContain(BASE_DESCRIPTION)
    expect(base).not.toContain(PORTUGUESE_DESCRIPTION)
    expect(response.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    )
    expect(response.headers.get('cache-control')).toBe(SITE_CACHE_CONTROL)
  })

  it('declara na nota o idioma base em que o índice é montado', async () => {
    const response = await GET()

    await expect(response.text()).resolves.toContain(
      `This index uses ${INDEX_LANGUAGE}.`
    )
  })
})

describe('anúncio do llms-full.txt', () => {
  it('cita o agregado quando o índice aponta para um Markdown estático', async () => {
    matchEvery({ pattern: '/about', info: { markdown: true } })
    const response = await GET()
    const text = await response.text()
    expect(text).toContain('/en/about.md)')
    expect(text.match(/llms-full\.txt/gu)).toHaveLength(1)
    const optional = text.slice(text.indexOf('## Optional'))
    expect(optional).toContain(
      `- [Full Markdown of the static pages]${FULL_LINK}: `
    )
  })

  it.each([
    { pattern: '/about', info: { markdown: 'dynamic' } },
    { pattern: '/blog/:slug', info: { markdown: true } },
    { pattern: '/about', info: { markdown: true, seo: { noindex: true } } },
    { pattern: '/about', info: {} }
  ] satisfies MatchOptions[])(
    'omite o agregado sem Markdown estático: $pattern $info',
    async options => {
      matchEvery(options)
      const response = await GET()
      await expect(response.text()).resolves.not.toContain(FULL_LINK)
    }
  )
})
