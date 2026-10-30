import { m } from '@paraglide/messages.js'
import { baseLocale, getLocale } from '@paraglide/runtime.js'
import { paraglideMiddleware } from '@paraglide/server.js'

import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'

import { GET } from '../index.ts'

const BASE_DESCRIPTION = m.site_description({}, { locale: 'en' })
const PORTUGUESE_DESCRIPTION = m.site_description({}, { locale: 'pt' })
const INDEX_LANGUAGE =
  new Intl.DisplayNames(['en'], { type: 'language' }).of(baseLocale) ??
  baseLocale

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
