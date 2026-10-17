import { expect, test } from '@playwright/test'

const HTTP_OK = 200
const HTTP_REDIRECT = 307
const HTTP_NOT_FOUND = 404
const HTTP_NOT_ACCEPTABLE = 406
const MINIMUM_PAGE_LENGTH = 100
const MINIMUM_ERROR_LENGTH = 20
const LOCALES = [
  { locale: 'pt', tag: 'pt-BR', missing: 'Página não encontrada!' },
  { locale: 'en', tag: 'en-US', missing: 'Page not found!' },
  { locale: 'es', tag: 'es-ES', missing: '¡Página no encontrada!' }
]
const PAGE_PATHS = ['', '/about', '/contact', '/privacy']

// oxlint-disable-next-line vitest/prefer-each -- Playwright has no test.each.
for (const { locale, tag, missing } of LOCALES) {
  // oxlint-disable-next-line vitest/prefer-each -- Playwright has no test.each.
  for (const path of PAGE_PATHS) {
    test(`negotiates HTML and Markdown at /${locale}${path}`, async ({
      request
    }) => {
      const pathname = `/${locale}${path}`
      const negotiated = await request.get(pathname, {
        maxRedirects: 0,
        headers: { accept: 'text/markdown' }
      })
      const markdownPath = path ? `${pathname}.md` : `${pathname}/index.md`
      expect(negotiated.status()).toBe(HTTP_OK)
      expect(negotiated.headers()['content-type']).toContain('text/markdown')
      expect(negotiated.headers().vary?.toLowerCase().split(/,\s*/u)).toContain(
        'accept'
      )
      expect(await negotiated.text()).toContain('# ')
      const markdown = await request.get(markdownPath, {
        maxRedirects: 0,
        headers: {
          accept: 'text/markdown',
          cookie: `session=private; locale=${locale === 'es' ? 'en' : 'es'}`
        }
      })
      expect(markdown.status()).toBe(HTTP_OK)
      expect(markdown.headers()['content-type']).toBe(
        'text/markdown; charset=utf-8'
      )
      expect(markdown.headers()['content-language']).toBe(locale)
      expect(markdown.headers()['cache-control']).toBe('private, no-store')
      expect(markdown.headers()['set-cookie']).toBe(
        `locale=${locale}; Path=/; Max-Age=34560000; SameSite=Lax`
      )
      expect(markdown.headers().vary?.toLowerCase().split(/,\s*/u)).toContain(
        'accept'
      )
      expect(markdown.headers()['x-content-type-options']).toBe('nosniff')
      const body = await markdown.text()
      expect(body.trim().length).toBeGreaterThanOrEqual(MINIMUM_PAGE_LENGTH)
      expect(body).toMatch(/^# .+$/mu)
      if (path) expect(body).toContain('\n## ')
      expect(body).not.toMatch(/<!doctype|<script/iu)

      const html = await request.get(pathname, {
        maxRedirects: 0,
        headers: { accept: 'text/html' }
      })
      expect(html.status()).toBe(HTTP_OK)
      expect(html.headers()['content-type']).toContain('text/html')
      expect(html.headers().vary?.toLowerCase().split(/,\s*/u)).toContain(
        'accept'
      )
      expect(html.headers()['content-language']).toBe(locale)
      expect(html.headers()['content-security-policy']).toContain(
        "script-src 'nonce-"
      )
      const htmlBody = await html.text()
      expect(htmlBody).toMatch(/<!doctype html>/iu)
      expect(htmlBody).toContain('type="text/markdown"')
      expect(htmlBody).toContain(markdownPath)

      const head = await request.head(pathname, {
        headers: { accept: 'text/markdown', cookie: `locale=${locale}` }
      })
      expect(head.status()).toBe(HTTP_OK)
      expect(head.headers()['content-type']).toBe(
        'text/markdown; charset=utf-8'
      )
      expect(head.headers()['set-cookie']).toBeUndefined()
      expect(head.headers()['content-language']).toBe(locale)
      expect(await head.body()).toHaveLength(0)
    })
  }

  test(`serves a noindex Markdown 404 and preserves HTML in ${locale}`, async ({
    request
  }) => {
    const path = `/${locale}/__agent-readiness-missing-page`
    const response = await request.get(path, {
      headers: { accept: 'text/markdown' }
    })
    expect(response.status()).toBe(HTTP_NOT_FOUND)
    expect(response.headers()['content-type']).toContain('text/markdown')
    expect(response.headers()['content-language']).toBe(locale)
    expect(response.headers().vary?.toLowerCase().split(/,\s*/u)).toContain(
      'accept'
    )
    expect(response.headers()['content-security-policy']).toContain(
      "script-src 'none'"
    )
    expect(response.headers()['x-robots-tag']).toBe('noindex')
    expect(response.headers()['cache-control']).toBe('private, no-store')
    const body = await response.text()
    expect(body).toContain(`# ${missing}`)
    expect(body).toContain('404')
    expect(body.length).toBeGreaterThan(MINIMUM_ERROR_LENGTH)
    expect(body).not.toMatch(/<!doctype|<script/iu)

    const head = await request.head(path, {
      headers: { accept: 'text/markdown' }
    })
    expect(head.status()).toBe(HTTP_NOT_FOUND)
    expect(head.headers()['content-type']).toContain('text/markdown')
    expect(await head.body()).toHaveLength(0)

    const html = await request.get(path, { headers: { accept: 'text/html' } })
    expect(html.status()).toBe(HTTP_NOT_FOUND)
    expect(html.headers()['content-type']).toContain('text/html')
    expect(await html.text()).toMatch(/<!doctype html>/iu)
  })

  test(`localizes the excluded 404 regardless of Accept in ${locale}`, async ({
    request
  }) => {
    const path = `/${locale}/__agent-readiness-excluded-page`
    const response = await request.get(path, {
      headers: { accept: 'application/json', cookie: '' }
    })
    expect(response.status()).toBe(HTTP_NOT_FOUND)
    expect(response.headers()['content-type']).toContain('text/html')
    expect(response.headers()['content-language']).toBe(locale)
    expect(response.headers()['cache-control']).toBe('private, no-store')
    expect(response.headers().vary?.toLowerCase().split(/,\s*/u)).toContain(
      'cookie'
    )
    const html = await response.text()
    const htmlTag = /<html\b[^>]*>/u.exec(html)?.[0]
    expect(htmlTag).toContain(`lang="${tag}"`)
    const head = await request.head(path, {
      headers: { accept: 'application/json', cookie: '' }
    })
    expect(head.status()).toBe(HTTP_NOT_FOUND)
    expect(head.headers()['content-language']).toBe(locale)
    expect(await head.body()).toHaveLength(0)
  })
}

test('preserves language negotiation and Markdown across the root redirect', async ({
  request
}) => {
  const headers = {
    accept: 'text/markdown',
    'accept-language': 'pt-BR',
    cookie: ''
  }
  const redirect = await request.get('/', { headers, maxRedirects: 0 })
  expect(redirect.status()).toBe(HTTP_REDIRECT)
  expect(new URL(redirect.headers().location ?? '').pathname).toBe('/pt')
  expect(redirect.headers().vary).toBe('Cookie, Accept-Language')
  expect(redirect.headers()['cache-control']).toBe('private, no-store')
  const markdown = await request.get('/', { headers })
  expect(markdown.status()).toBe(HTTP_OK)
  expect(markdown.headers()['content-type']).toContain('text/markdown')
  expect(markdown.headers().vary?.toLowerCase().split(/,\s*/u)).toContain(
    'accept'
  )
  expect(markdown.headers()['content-language']).toBe('pt')
  expect(await markdown.text()).toMatch(/^# .+$/mu)
  const html = await request.get('/', { headers: { accept: 'text/html' } })
  expect(html.status()).toBe(HTTP_OK)
  expect(html.headers()['content-type']).toContain('text/html')
  expect(html.headers().vary?.toLowerCase().split(/,\s*/u)).toContain('accept')
})

test('serves a Markdown 404 after an unprefixed missing-page redirect', async ({
  request
}) => {
  const response = await request.get('/__ora-404-probe-agent-readiness', {
    headers: { accept: 'text/markdown' }
  })
  expect(response.status()).toBe(HTTP_NOT_FOUND)
  expect(response.headers()['content-type']).toContain('text/markdown')
  expect(response.headers().vary?.toLowerCase().split(/,\s*/u)).toContain(
    'accept'
  )
  expect(await response.text()).toMatch(/^# .+$/mu)
})

// oxlint-disable-next-line vitest/prefer-each -- Playwright has no test.each.
for (const page of [
  { path: '/', status: HTTP_NOT_ACCEPTABLE, contentType: 'text/plain' },
  {
    path: '/__agent-readiness-unprefixed-excluded',
    status: HTTP_NOT_FOUND,
    contentType: 'text/html'
  }
]) {
  test(`localizes ${page.path} before handling an unsupported Accept`, async ({
    request
  }) => {
    const headers = {
      accept: 'application/json',
      'accept-language': 'es',
      cookie: ''
    }
    const redirect = await request.get(page.path, { headers, maxRedirects: 0 })
    expect(redirect.status()).toBe(HTTP_REDIRECT)
    expect(new URL(redirect.headers().location ?? '').pathname).toBe(
      page.path === '/' ? '/es' : `/es${page.path}`
    )
    const response = await request.get(page.path, { headers })
    expect(response.status()).toBe(page.status)
    expect(response.headers()['content-language']).toBe('es')
    expect(response.headers()['content-type']).toContain(page.contentType)
  })
}

// oxlint-disable-next-line vitest/prefer-each -- Playwright has no test.each.
for (const preference of [
  { accept: 'text/markdown;q=0.9, text/html;q=0.4', expected: 'text/markdown' },
  { accept: 'text/markdown, */*', expected: 'text/markdown' },
  { accept: 'text/*, text/html;q=0', expected: 'text/markdown' },
  { accept: 'text/markdown;q=0, text/html', expected: 'text/html' },
  { accept: 'text/markdown;q=0.2, text/*;q=0.8', expected: 'text/html' },
  { accept: '*/*', expected: 'text/html' }
]) {
  test(`honors Accept ${preference.accept}`, async ({ request }) => {
    const response = await request.get('/pt', {
      headers: { accept: preference.accept }
    })
    expect(response.status()).toBe(HTTP_OK)
    expect(response.headers()['content-type']).toContain(preference.expected)
  })
}

// oxlint-disable-next-line vitest/prefer-each -- Playwright has no test.each.
for (const accept of [
  'text/html;q=0, text/markdown;q=0',
  '*/*;q=0',
  'application/json',
  ''
]) {
  test(`rejects unacceptable page representations with Accept ${accept}`, async ({
    request
  }) => {
    const response = await request.get('/pt', { headers: { accept } })
    expect(response.status()).toBe(HTTP_NOT_ACCEPTABLE)
    expect(response.headers().vary?.toLowerCase().split(/,\s*/u)).toContain(
      'accept'
    )
    expect(response.headers()['cache-control']).toBe('private, no-store')
    expect(await response.text()).toBe('text/html\ntext/markdown\n')
    const head = await request.head('/pt', { headers: { accept } })
    expect(head.status()).toBe(HTTP_NOT_ACCEPTABLE)
    expect(await head.body()).toHaveLength(0)
  })
}

// oxlint-disable-next-line vitest/prefer-each -- Playwright has no test.each.
for (const endpoint of [
  { path: '/llms.txt', contentType: 'text/markdown' },
  { path: '/sitemap.xml', contentType: 'application/xml' },
  { path: '/robots.txt', contentType: 'text/plain' },
  { path: '/images/og.png', contentType: 'image/png' },
  { path: '/favicon/favicon.svg', contentType: 'image/svg+xml' }
]) {
  test(`preserves the non-page endpoint ${endpoint.path}`, async ({
    request
  }) => {
    const response = await request.get(endpoint.path, {
      maxRedirects: 0,
      headers: { accept: 'text/markdown', cookie: '', 'accept-language': 'es' }
    })
    expect(response.status()).toBe(HTTP_OK)
    expect(response.headers()['content-type']).toContain(endpoint.contentType)
    expect(response.headers()['set-cookie']).toBeUndefined()
    expect(response.headers().location).toBeUndefined()
    const body = await response.body()
    expect(body.length).toBeGreaterThan(0)
  })
}

test('localizes an uncached Markdown 404 for unknown URLs', async ({
  request
}) => {
  const response = await request.get('/pt/login.md', {
    maxRedirects: 0,
    headers: {
      accept: 'text/markdown',
      'accept-language': 'es',
      cookie: 'locale=en'
    }
  })
  expect(response.status()).toBe(HTTP_NOT_FOUND)
  expect(response.headers()['content-type']).toBe(
    'text/markdown; charset=utf-8'
  )
  expect(response.headers()['content-language']).toBe('pt')
  expect(response.headers()['cache-control']).toBe('private, no-store')
  expect(response.headers()['set-cookie']).toBe(
    'locale=pt; Path=/; Max-Age=34560000; SameSite=Lax'
  )
  expect(response.headers().vary?.toLowerCase().split(/,\s*/u)).toContain(
    'cookie'
  )
  expect(response.headers()['x-robots-tag']).toBe('noindex')
  expect(response.headers().location).toBeUndefined()
  expect(await response.text()).toContain('# Página não encontrada!')
  const head = await request.head('/pt/login.md', {
    headers: { cookie: 'locale=pt' }
  })
  expect(head.status()).toBe(HTTP_NOT_FOUND)
  expect(head.headers()['content-language']).toBe('pt')
  expect(head.headers()['set-cookie']).toBeUndefined()
  expect(await head.body()).toHaveLength(0)
})

test('keeps server-function dispatch outside page negotiation', async ({
  request
}) => {
  const response = await request.get('/_server/agent-readiness-missing', {
    maxRedirects: 0,
    headers: { accept: 'text/markdown' }
  })
  expect(response.status()).toBe(HTTP_NOT_FOUND)
  expect(response.headers()['content-type'] ?? '').not.toContain(
    'text/markdown'
  )
  expect(response.headers().location).toBeUndefined()
  expect(await response.text()).not.toContain('](/llms.txt)')
})
