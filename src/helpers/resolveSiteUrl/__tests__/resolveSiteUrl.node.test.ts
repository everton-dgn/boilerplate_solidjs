import type { resolveSiteUrl } from '../index.ts'

type ResolveSiteUrl = typeof resolveSiteUrl

// The URL depends neither on the messages nor on the locale, which SITE only reads
// in getters. Without the mocks, each new import loaded the whole Paraglide graph.
vi.mock(import('@paraglide/messages.js'), () => ({}))
vi.mock(import('@paraglide/runtime.js'), () => ({}))

// SITE reads the variable on load, so each scenario imports the module again.
async function loadResolveSiteUrl(siteUrl: string): Promise<ResolveSiteUrl> {
  vi.resetModules()
  vi.stubEnv('VITE_SITE_URL', siteUrl)
  const reloaded = await import('../index.ts')
  return reloaded.resolveSiteUrl
}

describe('public URL resolution', () => {
  it('resolves the path against VITE_SITE_URL and keeps the trailing slash at the root', async () => {
    const resolveSiteUrl = await loadResolveSiteUrl('https://example.com')

    expect(resolveSiteUrl('/docs')).toBe('https://example.com/docs')
    expect(resolveSiteUrl('/')).toBe('https://example.com/')
  })

  it('ignores the path and the query of the configured URL', async () => {
    const resolveSiteUrl = await loadResolveSiteUrl(
      'https://example.com/antigo?x=1'
    )

    expect(resolveSiteUrl('/sitemap.xml')).toBe(
      'https://example.com/sitemap.xml'
    )
  })
})
