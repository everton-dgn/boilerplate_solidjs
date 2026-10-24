import { m } from '@paraglide/messages.js'
import { getLocale } from '@paraglide/runtime.js'
import { paraglideMiddleware } from '@paraglide/server.js'

import { SITE_CACHE_CONTROL } from '@/constants/cache.ts'

import { GET } from '../../../index.ts'
import { buildLlmsResponse } from '../index.ts'

const BASE_DESCRIPTION = m.site_description({}, { locale: 'en' })
const PORTUGUESE_DESCRIPTION = m.site_description({}, { locale: 'pt' })

function renderLocale(): string {
  return `${getLocale()}: ${m.site_description()}`
}

// Contexto de uma requisição em português, como o de uma página localizada.
function inPortuguese(read: () => Promise<Response>): Promise<Response> {
  return paraglideMiddleware(new Request('https://example.com/pt/'), () => {
    expect(getLocale()).toBe('pt')
    return read()
  })
}

describe('resposta do llms.txt no idioma base', () => {
  it('monta o texto no idioma base mesmo dentro de um contexto em português', async () => {
    const response = await inPortuguese(() => buildLlmsResponse(renderLocale))

    await expect(response.text()).resolves.toBe(`en: ${BASE_DESCRIPTION}`)
    expect(response.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    )
    expect(response.headers.get('cache-control')).toBe(SITE_CACHE_CONTROL)
  })
})

// O lint de nomes não aceita um assunto com ponto como `llms.txt`; a rota é
// conferida aqui, junto do helper que ela usa.
describe('rota do llms.txt', () => {
  it('publica o mesmo índice dentro e fora de um contexto em português', async () => {
    const baseResponse = await GET()
    const base = await baseResponse.text()

    const response = await inPortuguese(() => GET())

    await expect(response.text()).resolves.toBe(base)
    expect(base).toContain(BASE_DESCRIPTION)
    expect(base).not.toContain(PORTUGUESE_DESCRIPTION)
  })

  it('declara na nota o idioma base em que o índice é montado', async () => {
    const response = await GET()

    await expect(response.text()).resolves.toContain('This index uses English.')
  })
})
