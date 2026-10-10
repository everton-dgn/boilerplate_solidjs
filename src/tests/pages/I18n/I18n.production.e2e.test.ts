import { readdir, readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'

const HTTP_OK = 200
const HTTP_NOT_FOUND = 404
const HTTP_REDIRECT = 307
const REQUESTS = 18
const ALTERNATE_LINKS = 4
const LANGUAGES = [
  {
    locale: 'pt',
    tag: 'pt-BR',
    title: 'Uma base limpa para produtos modernos',
    selector: 'Selecionar idioma',
    missing: 'Página não encontrada'
  },
  {
    locale: 'en',
    tag: 'en-US',
    title: 'A clean foundation for modern products',
    selector: 'Select language',
    missing: 'Page not found'
  },
  {
    locale: 'es',
    tag: 'es-ES',
    title: 'Una base limpia para productos modernos',
    selector: 'Seleccionar idioma',
    missing: 'Página no encontrada'
  }
]

test('switches language and hydrates when cookie access is blocked', async ({
  page,
  context
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get() {
        throw new DOMException('Blocked', 'SecurityError')
      },
      set() {
        throw new DOMException('Blocked', 'SecurityError')
      }
    })
  })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/en')
  await page.getByRole('button', { name: 'Select language' }).click()
  await page
    .getByRole('menuitemradio', { name: 'Español', exact: true })
    .click()
  await expect(page).toHaveURL('/es')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Una base limpia para productos modernos'
  )
  await page.getByRole('button', { name: 'Seleccionar tema' }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  expect(errors).toEqual([])
})

test('loads the home message module only when visiting the home page', async ({
  page
}) => {
  const directory = new URL(
    '../../../../.vercel/output/static/assets/',
    import.meta.url
  )
  const entries = await readdir(directory)
  const files = entries.filter(file => file.endsWith('.js'))
  const sources = await Promise.all(
    files.map(async file => ({
      file,
      source: await readFile(new URL(file, directory), 'utf8')
    }))
  )
  const homeModules = sources.filter(({ source }) =>
    source.includes('A clean foundation for modern products')
  )
  expect(homeModules).toHaveLength(1)
  const homeModule = homeModules[0]?.file
  expect(homeModule).toBeDefined()
  const requested = new Set<string>()
  page.on('request', request =>
    requested.add(new URL(request.url()).pathname.split('/').pop() ?? '')
  )
  await page.goto('/pt/404')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Página não encontrada!'
  )
  expect(requested.has(String(homeModule))).toBe(false)
  await page.getByRole('link', { name: 'Voltar ao início' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Uma base limpa para produtos modernos'
  )
  expect(requested.has(String(homeModule))).toBe(true)
})

// oxlint-disable-next-line vitest/prefer-each -- O Playwright não oferece test.each.
for (const language of LANGUAGES) {
  test(`renders ${language.locale} in SSR and hydrates without changing its locale`, async ({
    page,
    request
  }) => {
    const response = await request.get(`/${language.locale}`, {
      headers: { 'accept-language': 'de-DE', cookie: 'locale=es' }
    })
    expect(response.status()).toBe(HTTP_OK)
    expect(response.headers()['content-language']).toBe(language.locale)
    const html = await response.text()
    expect(html).toContain(`lang="${language.tag}"`)
    expect(html).toContain(language.title)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`/${language.locale}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      language.title
    )
    await page.getByRole('button', { name: language.selector }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('html')).toHaveAttribute('lang', language.tag)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${readSiteOrigin()}/${language.locale}`
    )
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(
      ALTERNATE_LINKS
    )
    const header = await page.getByRole('banner').elementHandle()
    expect(header).not.toBeNull()
    await page.getByRole('link', { name: '404', exact: true }).click()
    await expect(page).toHaveURL(`/${language.locale}/404`)
    await expect(page).toHaveTitle(language.missing)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex'
    )
    expect(
      await header.evaluate(
        element => element === document.querySelector('header')
      )
    ).toBe(true)
    expect(errors).toEqual([])
  })
}

test('switches language by keyboard, persists the choice and preserves query and hash', async ({
  page
}) => {
  await page.goto('/pt?campaign=example#section')
  const selector = page.getByRole('button', { name: 'Selecionar idioma' })
  await selector.focus()
  await page.keyboard.press('Enter')
  await page
    .getByRole('menuitemradio', { name: 'English', exact: true })
    .focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/en?campaign=example#section')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'A clean foundation for modern products'
  )
  await page.goto('/')
  await expect(page).toHaveURL('/en')
  await page.getByRole('button', { name: 'Select language' }).click()
  await page
    .getByRole('menuitemradio', { name: 'Español', exact: true })
    .click()
  await expect(page).toHaveURL('/es')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Una base limpia para productos modernos'
  )
})

test('negotiates only unprefixed page URLs and does not cache preference redirects', async ({
  request
}) => {
  const response = await request.get('/?q=one', {
    maxRedirects: 0,
    headers: { cookie: 'locale=es', 'accept-language': 'en-US' }
  })
  expect(response.status()).toBe(HTTP_REDIRECT)
  expect(new URL(response.headers().location ?? '').pathname).toBe('/es')
  expect(response.headers().location).toContain('?q=one')
  expect(response.headers()['cache-control']).toContain('no-store')
  expect(response.headers().vary).toContain('Cookie')
  const fallback = await request.get('/', {
    maxRedirects: 0,
    headers: { cookie: 'locale=invalid', 'accept-language': 'de' }
  })
  expect(new URL(fallback.headers().location ?? '').pathname).toBe('/en')
  const preferred = await request.head('/', {
    maxRedirects: 0,
    headers: { 'accept-language': 'es-AR, en;q=0.5', cookie: '' }
  })
  expect(new URL(preferred.headers().location ?? '').pathname).toBe('/es')
  const missing = await request.get('/en/missing')
  expect(missing.status()).toBe(HTTP_NOT_FOUND)
})

// oxlint-disable-next-line vitest/prefer-each -- O Playwright não oferece test.each.
for (const { header, locale } of [
  { header: '', locale: 'en' },
  { header: 'de;q=1, es;q=0', locale: 'en' },
  { header: 'es;q=0.000, pt;q=0', locale: 'en' },
  { header: 'ES-ar ; Q = 0, pt-BR ; q = 0.4', locale: 'pt' },
  { header: 'es;q=NaN, pt;q=0.5', locale: 'pt' }
]) {
  test(`negotiates and persists ${locale} for Accept-Language ${header}`, async ({
    request
  }) => {
    const response = await request.get('/?campaign=example', {
      maxRedirects: 0,
      headers: { 'accept-language': header }
    })
    expect(response.status()).toBe(HTTP_REDIRECT)
    expect(new URL(response.headers().location ?? '').pathname).toBe(
      `/${locale}`
    )
    expect(response.headers().location).toContain('?campaign=example')
    expect(response.headers()['set-cookie']).toContain(`locale=${locale};`)
    expect(response.headers()['cache-control']).toBe('private, no-store')
    const revisit = await request.get('/', {
      maxRedirects: 0,
      headers: { 'accept-language': 'de' }
    })
    expect(new URL(revisit.headers().location ?? '').pathname).toBe(
      `/${locale}`
    )
    expect(revisit.headers()['set-cookie']).toBeUndefined()
  })
}

test('isolates concurrent SSR requests across all locales', async ({
  request
}) => {
  const results = await Promise.all(
    Array.from({ length: REQUESTS }, async (_, index) => {
      const language = LANGUAGES[index % LANGUAGES.length]
      if (!language) throw new Error('Missing test language')
      const response = await request.get(`/${language.locale}`)
      return { language, html: await response.text() }
    })
  )
  for (const { language, html } of results) {
    expect(html).toContain(`lang="${language.tag}"`)
    expect(html).toContain(language.title)
    for (const other of LANGUAGES.filter(
      item => item.locale !== language.locale
    )) {
      expect(html).not.toContain(other.title)
    }
  }
})

test('publishes localized sitemap URLs while retaining unprefixed API and asset URLs', async ({
  request
}) => {
  const sitemap = await request.get('/sitemap.xml', { maxRedirects: 0 })
  expect(sitemap.status()).toBe(HTTP_OK)
  expect(sitemap.headers()['set-cookie']).toBeUndefined()
  const xml = await sitemap.text()
  for (const { locale } of LANGUAGES) {
    expect(xml).toContain(`<loc>${readSiteOrigin()}/${locale}</loc>`)
    expect(xml).toContain(`hreflang="${locale}"`)
  }
  const robots = await request.get('/robots.txt', { maxRedirects: 0 })
  expect(robots.status()).toBe(HTTP_OK)
  expect(robots.headers()['set-cookie']).toBeUndefined()
  const image = await request.get('/images/og.png', { maxRedirects: 0 })
  expect(image.headers()['content-type']).toContain('image/png')
  expect(image.headers()['set-cookie']).toBeUndefined()
})
