import type { resolveSiteUrl } from '../index.ts'

type ResolveSiteUrl = typeof resolveSiteUrl

// A URL não depende das mensagens nem do idioma, que SITE só lê em getters.
// Sem os mocks, cada reimportação carregava o grafo inteiro do Paraglide.
vi.mock(import('@paraglide/messages.js'), () => ({}))
vi.mock(import('@paraglide/runtime.js'), () => ({}))

// SITE lê a variável ao carregar, então cada cenário reimporta o módulo.
async function loadResolveSiteUrl(siteUrl: string): Promise<ResolveSiteUrl> {
  vi.resetModules()
  vi.stubEnv('VITE_SITE_URL', siteUrl)
  const reloaded = await import('../index.ts')
  return reloaded.resolveSiteUrl
}

describe('resolução da URL pública', () => {
  it('resolve o caminho contra VITE_SITE_URL e mantém a barra final na raiz', async () => {
    const resolveSiteUrl = await loadResolveSiteUrl('https://example.com')

    expect(resolveSiteUrl('/docs')).toBe('https://example.com/docs')
    expect(resolveSiteUrl('/')).toBe('https://example.com/')
  })

  it('ignora caminho e query da URL configurada', async () => {
    const resolveSiteUrl = await loadResolveSiteUrl(
      'https://example.com/antigo?x=1'
    )

    expect(resolveSiteUrl('/sitemap.xml')).toBe(
      'https://example.com/sitemap.xml'
    )
  })
})
