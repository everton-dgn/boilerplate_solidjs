import { delocalizePathname, localizeHref } from '../index.ts'

describe('localized URLs', () => {
  it('keeps the query and hash while changing locales', () => {
    expect(localizeHref({ href: '/pt/docs?q=1#section', locale: 'es' })).toBe(
      '/es/docs?q=1#section'
    )
    expect(localizeHref({ href: '/', locale: 'en' })).toBe('/en')
    expect(localizeHref({ href: '/es', locale: 'pt' })).toBe('/pt')
  })

  it('leaves external URLs and fragments untouched', () => {
    for (const href of [
      'https://example.com/a',
      '//example.com/a',
      'mailto:a@example.com',
      '#section'
    ]) {
      expect(localizeHref({ href, locale: 'es' })).toBe(href)
    }
  })

  it('strips only a complete supported locale segment for route matching', () => {
    expect(delocalizePathname('/es/docs')).toBe('/docs')
    expect(delocalizePathname('/pt')).toBe('/')
    expect(delocalizePathname('/enterprise')).toBe('/enterprise')
    expect(delocalizePathname('/fr/docs')).toBe('/fr/docs')
  })
})
