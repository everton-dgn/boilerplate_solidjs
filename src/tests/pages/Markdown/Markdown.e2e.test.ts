import { expect, test } from '@playwright/test'

import { releaseFixtureGate } from '@/tests/helpers/fixtureGate/index.ts'
import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'

test.use({ headless: true })

const HTTP_OK = 200
const HTTP_REDIRECT = 307
const HTTP_BAD_REQUEST = 400
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_NOT_ACCEPTABLE = 406
const HTTP_INTERNAL_SERVER_ERROR = 500

const PAGE = '/pt/markdown-contract/sample'
const LOCALES = ['pt', 'en', 'es']
// A ordem dos atributos não faz parte do contrato do HTML.
const MARKDOWN_ALTERNATE =
  /<link\b(?=[^>]*\brel="alternate")(?=[^>]*\btype="text\/markdown")(?=[^>]*\bhref="(?<href>[^"]+)")[^>]*>/u

function expectPublicMarkdown(body: string) {
  expect(body).toContain('# HTML Markdown contract: sample')
  expect(body.indexOf('Before the title')).toBeLessThan(
    body.indexOf('# HTML Markdown')
  )
  expect(body).toContain('first:pt:resolved')
  expect(body).toContain('second:pt:resolved')
  expect(body.indexOf('first:pt:resolved')).toBeLessThan(
    body.indexOf('second:pt:resolved')
  )
  expect(body.replaceAll(String.raw`\_`, '_')).not.toMatch(
    /MENU_NOISE|BUTTON_NOISE|HIDDEN_NOISE|DECORATIVE_NOISE|EXCLUDED_NOISE|TEMPLATE_NOISE|FALLBACK/u
  )
  expect(body).not.toMatch(/<script|<template|_\$HY|_hk=/u)
  expect(body).toContain('- List item A')
  expect(body).toContain('- List item B')
  expect(body).toMatch(/\|\s*Name\s*\|\s*Value\s*\|/u)
  expect(body).toContain(String.raw`pipe \| literal`)
  expect(body).toContain('```ts\nconst x = `value`;\nconsole.log(x)\n```')
  expect(body).toContain(
    'Contextual citation [reference](https://example.org/reference)'
  )
}

test('converts only native public HTML and resolves links against the public document', async ({
  request
}) => {
  const response = await request.get(`${PAGE}.md`)
  expect(response.status()).toBe(HTTP_OK)
  expect(response.headers()['content-type']).toContain('text/markdown')
  expect(response.headers()['content-language']).toBe('pt')
  expect(response.headers()['cache-control']).toBe('private, no-store')
  expect(response.headers()['content-security-policy']).toContain(
    "script-src 'none'"
  )
  const body = await response.text()
  expectPublicMarkdown(body)
  expect(body).toContain(
    `[contextual link](${new URL('relative?x=1&y=2', `${readSiteOrigin()}${PAGE}`).href})`
  )
})

test('normal HTML hydrates the same ordered fragments and preserves controls', async ({
  page
}) => {
  await page.goto(PAGE)
  await expect.poll(() => hydrationFinished(page)).toBe(true)
  await expect(page.locator('[data-fragment]')).toHaveText([
    'first:pt:resolved',
    'second:pt:resolved'
  ])
  await page.getByRole('button', { name: 'BUTTON_NOISE 0' }).click()
  await expect(
    page.getByRole('button', { name: 'BUTTON_NOISE 1' })
  ).toBeVisible()
})

// oxlint-disable-next-line vitest/prefer-each -- Playwright não oferece test.each.
for (const preference of [
  { accept: 'text/markdown', type: 'text/markdown' },
  { accept: 'text/markdown;q=0, text/html', type: 'text/html' },
  { accept: 'text/markdown;q=0, */*;q=1', type: 'text/html' },
  { accept: 'text/html;q=0, text/*', type: 'text/markdown' },
  { accept: 'text/markdown;q=0.2, text/html;q=0.9', type: 'text/html' }
]) {
  test(`negotiates ${preference.accept} without a file redirect`, async ({
    request
  }) => {
    const response = await request.get(PAGE, {
      headers: { accept: preference.accept },
      maxRedirects: 0
    })
    expect(response.status()).toBe(HTTP_OK)
    expect(response.headers()['content-type']).toContain(preference.type)
    expect(response.headers().vary?.toLowerCase()).toContain('accept')
  })
}

test('explicit Markdown checks acceptability rather than preference for HTML', async ({
  request
}) => {
  const response = await request.get(`${PAGE}.md`, {
    headers: { accept: 'text/html;q=1,text/markdown;q=0.1' }
  })
  expect(response.status()).toBe(HTTP_OK)
  expect(response.headers()['content-type']).toContain('text/markdown')
  for (const accept of ['text/markdown;q=0,*/*', 'text/html', '*/*;q=0']) {
    const rejected = await request.get(`${PAGE}.md`, { headers: { accept } })
    expect(rejected.status()).toBe(HTTP_NOT_ACCEPTABLE)
  }
})

test('rejects unavailable representations and keeps HEAD empty', async ({
  request
}) => {
  for (const path of [PAGE, `${PAGE}.md`]) {
    const head = await request.head(path, {
      headers: { accept: 'text/markdown' }
    })
    expect(head.status()).toBe(HTTP_OK)
    expect(head.headers()['content-type']).toContain('text/markdown')
    expect(await head.body()).toHaveLength(0)
    const rejected = await request.head(path, {
      headers: { accept: 'text/html;q=0,text/markdown;q=0' }
    })
    expect(rejected.status()).toBe(HTTP_NOT_ACCEPTABLE)
    expect(await rejected.body()).toHaveLength(0)
  }
})

test('matches unenumerated parameter values without a Markdown producer', async ({
  request
}) => {
  const slug = `unlisted-${crypto.randomUUID()}`
  const response = await request.get(`/pt/markdown-contract/${slug}.md`)
  expect(response.status()).toBe(HTTP_OK)
  expect(await response.text()).toContain(`# HTML Markdown contract: ${slug}`)
})

// oxlint-disable-next-line vitest/prefer-each -- Playwright não oferece test.each.
for (const locale of LOCALES) {
  test(`preserves the index slug and home Markdown aliases in ${locale}`, async ({
    request
  }) => {
    const pathname = `/${locale}/markdown-contract/index`
    const markdownPath = `${pathname}/index.md`
    const html = await request.get(pathname, {
      headers: { accept: 'text/html' }
    })
    expect(html.status()).toBe(HTTP_OK)
    expect(html.headers()['content-type']).toContain('text/html')
    const alternate = MARKDOWN_ALTERNATE.exec(await html.text())?.groups?.href
    expect(alternate).toBe(`${readSiteOrigin()}${markdownPath}`)

    const markdown = await request.get(`${markdownPath}?version=2`)
    expect(markdown.status()).toBe(HTTP_OK)
    expect(markdown.headers()['content-type']).toContain('text/markdown')
    expect(markdown.headers()['content-language']).toBe(locale)
    expect(await markdown.text()).toContain('# HTML Markdown contract: index')

    // A home é estática: o arquivo gerado no build dispensa a função.
    const home = await request.get(`/${locale}/index.md`)
    expect(home.status()).toBe(HTTP_OK)
    expect(home.headers()['set-cookie']).toBeUndefined()
    const homeBody = await home.text()
    expect(homeBody).toContain('# SolidJS Boilerplate')
    expect(homeBody).not.toContain('# HTML Markdown contract: index')
  })
}

test('isolates simultaneous locale cookies in settled content', async ({
  request
}) => {
  await Promise.all(
    Array.from({ length: 12 }, async (_, index) => {
      const locale = LOCALES[index % LOCALES.length]
      const other = LOCALES[(index + 1) % LOCALES.length]
      const id = crypto.randomUUID()
      for (const label of ['first', 'second']) {
        await releaseFixtureGate({ request, id: `${id}:${label}` })
      }
      const response = await request.get(
        `/${locale}/markdown-contract/sample.md?id=${id}`,
        {
          headers: { cookie: `PARAGLIDE_LOCALE=${other}; locale=${other}` }
        }
      )
      expect(response.status()).toBe(HTTP_OK)
      expect(response.headers()['content-language']).toBe(locale)
      const body = await response.text()
      expect(body).toContain(`first:${locale}:resolved`)
      expect(body).toContain(`second:${locale}:resolved`)
      expect(body).not.toContain(`:${other}:resolved`)
    })
  )
})

test('localizes explicit Markdown URLs without losing their suffix', async ({
  request,
  baseURL
}) => {
  const response = await request.get('/markdown-contract/sample.md', {
    headers: { 'accept-language': 'es', cookie: '' },
    maxRedirects: 0
  })
  expect(response.status()).toBe(HTTP_REDIRECT)
  expect(new URL(response.headers().location ?? '', baseURL).pathname).toBe(
    '/es/markdown-contract/sample.md'
  )
})

// oxlint-disable-next-line vitest/prefer-each -- Playwright não oferece test.each.
for (const path of ['/pt/markdown-noindex', '/pt/markdown-optout']) {
  test(`does not publish ${path}`, async ({ request }) => {
    const html = await request.get(path, { headers: { accept: 'text/html' } })
    expect(html.status()).toBe(HTTP_OK)
    expect(html.headers()['content-type']).toContain('text/html')
    const negotiated = await request.get(path, {
      headers: { accept: 'text/markdown' }
    })
    expect(negotiated.headers()['content-type'] ?? '').not.toContain(
      'text/markdown'
    )
    const explicit = await request.get(`${path}.md`)
    expect(explicit.status()).toBe(HTTP_NOT_FOUND)
    expect(await explicit.text()).not.toMatch(/NOINDEX_CONTENT|OPTOUT_CONTENT/u)
  })
}

test('keeps unknown and invalid paths outside successful Markdown', async ({
  request
}) => {
  for (const path of [
    '/pt/nonexistent-contract.md',
    '/pt/%ZZ.md',
    '/pt/markdown-contract/a/b.md'
  ]) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status()).toBeGreaterThanOrEqual(HTTP_BAD_REQUEST)
    expect(response.status()).toBeLessThan(HTTP_INTERNAL_SERVER_ERROR)
    expect(await response.text()).not.toContain('HTML Markdown contract:')
  }
})

test('does not convert API, assets or server function dispatch', async ({
  request
}) => {
  for (const [path, status] of [
    ['/robots.txt', HTTP_OK],
    ['/sitemap.xml', HTTP_OK],
    ['/favicon/favicon.svg', HTTP_OK],
    ['/_server/markdown-contract-missing', HTTP_NOT_FOUND]
  ] as const) {
    const plain = await request.get(path, {
      headers: { accept: '*/*' },
      maxRedirects: 0
    })
    const markdown = await request.get(path, {
      headers: { accept: 'text/markdown' },
      maxRedirects: 0
    })
    expect(plain.status(), path).toBe(status)
    expect(markdown.status()).toBe(plain.status())
    expect(markdown.headers()['content-type']).toBe(
      plain.headers()['content-type']
    )
    expect(await markdown.body()).toEqual(await plain.body())
  }
})

test('preserves non-read methods instead of rendering Markdown', async ({
  request
}) => {
  for (const path of [PAGE, `${PAGE}.md`]) {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await request.fetch(path, {
        method,
        maxRedirects: 0,
        headers: { accept: 'text/markdown' }
      })
      expect(response.status(), `${method} ${path}`).toBe(
        HTTP_METHOD_NOT_ALLOWED
      )
      expect(response.headers().allow).toBe('GET, HEAD')
      expect(response.headers()['content-type'] ?? '').not.toContain(
        'text/markdown'
      )
      expect(await response.text()).not.toContain('# HTML Markdown contract:')
    }
  }
})
