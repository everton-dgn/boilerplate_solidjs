import { expect, test } from '@playwright/test'

const HTTP_OK = 200
const HTTP_REDIRECT = 307
const HTTP_NOT_FOUND = 404
const HTTP_NOT_ACCEPTABLE = 406
const MINIMUM_PAGE_LENGTH = 500
const MINIMUM_ERROR_LENGTH = 20
const LOCALES = ['pt', 'en', 'es']
const PAGE_PATHS = ['', '/about', '/contact', '/privacy']

// oxlint-disable-next-line vitest/prefer-each -- Playwright has no test.each.
for (const locale of LOCALES) {
  // oxlint-disable-next-line vitest/prefer-each -- Playwright has no test.each.
  for (const path of PAGE_PATHS) {
    test(`negotiates HTML and Markdown at /${locale}${path}`, async ({
      request
    }) => {
      const pathname = `/${locale}${path}`
      const markdown = await request.get(pathname, {
        maxRedirects: 0,
        headers: { accept: 'text/markdown' }
      })
      expect(markdown.status()).toBe(HTTP_OK)
      expect(markdown.headers()['content-type']).toBe(
        'text/markdown; charset=utf-8'
      )
      expect(markdown.headers()['content-language']).toBe(locale)
      expect(markdown.headers().vary?.toLowerCase().split(/,\s*/u)).toContain(
        'accept'
      )
      expect(markdown.headers().vary?.toLowerCase().split(/,\s*/u)).toContain(
        'cookie'
      )
      expect(markdown.headers()['content-security-policy']).toContain(
        "script-src 'none'"
      )
      const body = await markdown.text()
      expect(body.trim().length).toBeGreaterThanOrEqual(MINIMUM_PAGE_LENGTH)
      expect(body).toMatch(/^# .+\n/u)
      expect(body).toContain('\n## ')
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
      expect(await html.text()).toMatch(/<!doctype html>/iu)

      const head = await request.head(pathname, {
        headers: { accept: 'text/markdown' }
      })
      expect(head.status()).toBe(HTTP_OK)
      expect(head.headers()['content-type']).toBe(
        'text/markdown; charset=utf-8'
      )
      expect(head.headers().vary?.toLowerCase().split(/,\s*/u)).toContain(
        'accept'
      )
      expect(await head.body()).toHaveLength(0)
    })
  }

  test(`serves actual Markdown and HTML 404s in ${locale}`, async ({
    request
  }) => {
    const path = `/${locale}/__agent-readiness-missing-page`
    const markdown = await request.get(path, {
      headers: { accept: 'text/markdown' }
    })
    expect(markdown.status()).toBe(HTTP_NOT_FOUND)
    expect(markdown.headers()['content-type']).toBe(
      'text/markdown; charset=utf-8'
    )
    expect(markdown.headers()['content-language']).toBe(locale)
    expect(markdown.headers().vary?.toLowerCase().split(/,\s*/u)).toContain(
      'accept'
    )
    expect(markdown.headers()['content-security-policy']).toContain(
      "script-src 'none'"
    )
    const body = await markdown.text()
    expect(body.trim().length).toBeGreaterThan(MINIMUM_ERROR_LENGTH)
    expect(body).toMatch(/^# .+\n/u)
    expect(body).toContain('](/llms.txt)')
    expect(body).not.toMatch(/<!doctype|<script/iu)

    const head = await request.head(path, {
      headers: { accept: 'text/markdown' }
    })
    expect(head.status()).toBe(HTTP_NOT_FOUND)
    expect(head.headers()['content-type']).toBe('text/markdown; charset=utf-8')
    expect(await head.body()).toHaveLength(0)

    const html = await request.get(path, { headers: { accept: 'text/html' } })
    expect(html.status()).toBe(HTTP_NOT_FOUND)
    expect(html.headers()['content-type']).toContain('text/html')
    expect(await html.text()).toMatch(/<!doctype html>/iu)
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
  expect(redirect.headers().vary).toBe('Cookie, Accept-Language, Accept')
  expect(redirect.headers()['cache-control']).toBe('private, no-store')
  const markdown = await request.get('/', { headers })
  expect(markdown.status()).toBe(HTTP_OK)
  expect(markdown.headers()['content-type']).toContain('text/markdown')
  expect(markdown.headers()['content-language']).toBe('pt')
  expect(await markdown.text()).toMatch(/^# .+\n/u)
  const html = await request.get('/', { headers: { accept: 'text/html' } })
  expect(html.status()).toBe(HTTP_OK)
  expect(html.headers()['content-type']).toContain('text/html')
  expect(html.headers().vary?.toLowerCase().split(/,\s*/u)).toContain('accept')
})

test('returns a Markdown 404 after an unprefixed missing-page redirect', async ({
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
  expect(await response.text()).toContain('](/llms.txt)')
})

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
