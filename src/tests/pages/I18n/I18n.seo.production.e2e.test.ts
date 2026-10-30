import { expect, test } from '@playwright/test'

import english from '@/i18n/en.json' with { type: 'json' }
import spanish from '@/i18n/es.json' with { type: 'json' }
import portuguese from '@/i18n/pt.json' with { type: 'json' }
import { parseStructuredData } from '@/tests/helpers/parseStructuredData/index.ts'
import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'

const HTTP_OK = 200
const HTTP_NOT_FOUND = 404
const PAGE_PATHS = ['', '/about', '/contact', '/privacy']
const LANGUAGES = [
  { locale: 'pt', tag: 'pt-BR', messages: portuguese },
  { locale: 'en', tag: 'en-US', messages: english },
  { locale: 'es', tag: 'es-ES', messages: spanish }
]
const ALTERNATES = Object.fromEntries<string>([
  ...LANGUAGES.map(
    ({ locale }) => [locale, `${readSiteOrigin()}/${locale}`] as const
  ),
  ['x-default', `${readSiteOrigin()}/en`]
])

type SitemapRecord = { loc: string; alternates: Record<string, string> }

function readSitemap(xml: string): SitemapRecord[] {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.querySelector('parsererror')) {
    throw new Error('Invalid sitemap XML')
  }
  return [...document.querySelectorAll('url')].map(entry => {
    const alternates: Record<string, string> = {}
    for (const link of entry.getElementsByTagNameNS(
      'http://www.w3.org/1999/xhtml',
      'link'
    )) {
      alternates[link.getAttribute('hreflang') ?? ''] =
        link.getAttribute('href') ?? ''
    }
    return { loc: entry.querySelector('loc')?.textContent ?? '', alternates }
  })
}

for (const { locale, tag, messages } of LANGUAGES) {
  test(`publishes complete ${locale} SEO in server HTML without JavaScript`, async ({
    browser,
    baseURL
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL
    })
    try {
      const page = await context.newPage()
      await page.goto(`/${locale}/?campaign=example#section`)
      await expect(page.locator('html')).toHaveAttribute('lang', tag)
      await expect(page.locator('head title')).toHaveCount(1)
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${readSiteOrigin()}/${locale}`
      )
      const alternates = await page
        .locator('head link[hreflang]')
        .evaluateAll(links =>
          Object.fromEntries<string>(
            links.map(
              link =>
                [
                  link.getAttribute('hreflang') ?? '',
                  link.getAttribute('href') ?? ''
                ] as const
            )
          )
        )
      expect(alternates).toEqual(ALTERNATES)
      for (const selector of [
        'meta[name="description"]',
        'meta[property="og:description"]',
        'meta[name="twitter:description"]'
      ]) {
        await expect(page.locator(`head ${selector}`)).toHaveAttribute(
          'content',
          messages.site_description
        )
      }
      await expect(
        page.locator('head meta[property="og:locale"]')
      ).toHaveAttribute('content', tag.replace('-', '_'))
      expect(
        await page
          .locator('head meta[property="og:locale:alternate"]')
          .evaluateAll(elements =>
            elements.map(element => element.getAttribute('content'))
          )
      ).toEqual(
        LANGUAGES.filter(language => language.locale !== locale).map(language =>
          language.tag.replace('-', '_')
        )
      )
      for (const selector of [
        'meta[property="og:image:alt"]',
        'meta[name="twitter:image:alt"]'
      ]) {
        await expect(page.locator(`head ${selector}`)).toHaveAttribute(
          'content',
          messages.site_imageAlt
        )
      }
      const graph = parseStructuredData(
        await page
          .locator('head script[type="application/ld+json"]')
          .textContent()
      )['@graph']
      expect(graph).toContainEqual(
        expect.objectContaining({
          '@type': 'WebPage',
          url: `${readSiteOrigin()}/${locale}`,
          inLanguage: tag,
          description: messages.site_description
        })
      )
      expect(graph).toContainEqual(
        expect.objectContaining({
          '@type': 'WebSite',
          inLanguage: LANGUAGES.map(language => language.tag)
        })
      )
      expect(graph).toContainEqual(
        expect.objectContaining({
          '@type': 'Organization',
          contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'demo',
            email: 'contato@example.com',
            telephone: '0000000000',
            description:
              'Placeholder values for this boilerplate demonstration. Do not use them to contact the maintainer.'
          },
          address: {
            '@type': 'PostalAddress',
            streetAddress: 'Rua de exemplo, 123',
            addressLocality: 'Cidade de exemplo',
            addressRegion: 'Estado de exemplo',
            postalCode: '00000-000',
            addressCountry: 'BR',
            description:
              'Placeholder address for this boilerplate demonstration.'
          }
        })
      )
      const missing = await page.goto(`/${locale}/missing`)
      expect(missing?.status()).toBe(HTTP_NOT_FOUND)
      await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex'
      )
      await expect(
        page.locator(
          'head link[hreflang], head link[rel="canonical"], head script[type="application/ld+json"]'
        )
      ).toHaveCount(0)
    } finally {
      await context.close()
    }
  })

  test(`preserves ${locale} for HTML fetched outside document navigation`, async ({
    request
  }) => {
    const response = await request.get(`/${locale}`, {
      headers: { 'sec-fetch-dest': 'empty', accept: '*/*', cookie: 'locale=pt' }
    })
    expect(response.status()).toBe(HTTP_OK)
    expect(response.headers()['content-language']).toBe(locale)
    const html = await response.text()
    expect(html).toContain(`lang="${tag}"`)
    expect(html).toContain(messages.site_description)
  })
}

test('sitemap alternates are reciprocal and every localized URL resolves without redirects', async ({
  page,
  request
}) => {
  const response = await request.get('/sitemap.xml')
  expect(response.status()).toBe(HTTP_OK)
  const entries = await page.evaluate(readSitemap, await response.text())
  const expectedEntries = PAGE_PATHS.flatMap(path => {
    const alternates = Object.fromEntries<string>([
      ...LANGUAGES.map(
        ({ locale }) =>
          [locale, `${readSiteOrigin()}/${locale}${path}`] as const
      ),
      ['x-default', `${readSiteOrigin()}/en${path}`]
    ])
    return LANGUAGES.map(({ locale }) => ({
      loc: `${readSiteOrigin()}/${locale}${path}`,
      alternates
    }))
  })
  expect(
    entries.toSorted((left, right) => left.loc.localeCompare(right.loc))
  ).toEqual(
    expectedEntries.toSorted((left, right) => left.loc.localeCompare(right.loc))
  )
  for (const entry of entries) {
    const result = await request.get(new URL(entry.loc).pathname, {
      maxRedirects: 0
    })
    expect(result.status()).toBe(HTTP_OK)
    expect(result.headers()['content-language']).toBe(
      new URL(entry.loc).pathname.split('/')[1]
    )
  }
})
