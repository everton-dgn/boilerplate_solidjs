import { buildLocaleAlternates } from '../index.ts'

describe('locale alternates', () => {
  it('lists every locale and points x-default to the base locale', () => {
    expect(
      buildLocaleAlternates({
        href: '/docs?q=1#section',
        siteUrl: 'https://example.com'
      })
    ).toStrictEqual([
      { hreflang: 'pt', href: 'https://example.com/pt/docs?q=1#section' },
      { hreflang: 'en', href: 'https://example.com/en/docs?q=1#section' },
      { hreflang: 'es', href: 'https://example.com/es/docs?q=1#section' },
      { hreflang: 'x-default', href: 'https://example.com/en/docs?q=1#section' }
    ])
  })

  it('relocalizes a path that already has a locale prefix', () => {
    const alternates = buildLocaleAlternates({
      href: '/es/docs',
      siteUrl: 'https://example.com'
    })

    expect(alternates.map(({ href }) => href)).toStrictEqual([
      'https://example.com/pt/docs',
      'https://example.com/en/docs',
      'https://example.com/es/docs',
      'https://example.com/en/docs'
    ])
  })

  it('resolves root-relative paths against the site origin', () => {
    const [alternate] = buildLocaleAlternates({
      href: '/docs',
      siteUrl: 'https://example.com/base/index.html?x=1'
    })

    expect(alternate?.href).toBe('https://example.com/pt/docs')
  })
})
