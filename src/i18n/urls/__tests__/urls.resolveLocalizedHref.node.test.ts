import { paraglideMiddleware } from '@/paraglide/server.js'

import { resolveLocalizedHref } from '../index.ts'

describe('resolveLocalizedHref contracts', () => {
  it.each(['pt', 'en', 'es'] as const)(
    'localizes a page into %s without an extension heuristic',
    locale => {
      expect(
        resolveLocalizedHref({ href: '/es/manual.pdf?q=1#part', locale })
      ).toBe(`/${locale}/manual.pdf?q=1#part`)
    }
  )

  it.each([
    'https://example.com/docs',
    '//example.com/docs',
    'mailto:a@example.com',
    'tel:123'
  ])('preserves external href %s', href => {
    expect(resolveLocalizedHref({ href, locale: 'es' })).toBe(href)
  })

  it('requires a location for relative pages and supports query-only links', async () => {
    expect(() =>
      resolveLocalizedHref({ href: '../docs', locale: 'en' })
    ).toThrow('requires a Router or base')
    await paraglideMiddleware(
      new Request('https://example.com/pt/docs?q=1'),
      () => {
        expect(
          resolveLocalizedHref({
            href: '?q=2#part',
            base: '/pt/docs?q=1',
            locale: 'en'
          })
        ).toBe('/en/docs?q=2#part')
        expect(
          resolveLocalizedHref({
            href: '#part',
            base: '/pt/docs?q=1',
            locale: 'en'
          })
        ).toBe('/en/docs?q=1#part')
        return new Response()
      }
    )
  })

  it('bypasses endpoints and assets explicitly, including relative references', () => {
    for (const href of [
      '/api/report',
      '/images/logo',
      '../download',
      '?file=1'
    ]) {
      expect(
        resolveLocalizedHref({ href, localize: false, locale: 'en' })
      ).toBe(href)
    }
  })
})
