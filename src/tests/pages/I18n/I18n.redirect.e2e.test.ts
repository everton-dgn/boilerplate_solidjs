import { expect, test } from '@playwright/test'

import { watchCspViolations } from '@/tests/helpers/watchCspViolations/index.ts'

const REDIRECT = 302
const OK = 200

// oxlint-disable-next-line vitest/prefer-each -- Playwright has no test.each.
for (const [kind, destination] of [
  ['query', '/pt/i18n-redirect?saved=1'],
  ['parent', '/pt/next'],
  ['fragment', '/pt/i18n-redirect?filter=active#target'],
  ['empty', '/pt/i18n-redirect?filter=active']
] as const) {
  test(`RPC relative ${kind} redirect resolves against the referring page`, async ({
    page
  }) => {
    await page.goto('/pt/i18n-redirect?filter=active#old')
    await expect(
      page.getByRole('button', { name: 'Selecionar tema' })
    ).toBeEnabled()
    await page
      .getByRole('button', { name: `Relative ${kind} redirect` })
      .click()
    await expect(page).toHaveURL(destination)
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  })
}
const STREAM_REDIRECT =
  /<script nonce="(?<nonce>[^"]+)">window\.location="\/es\/i18n-redirect\?from=query#target"<\/script>/u

// oxlint-disable-next-line vitest/prefer-each -- Playwright has no test.each.
for (const source of ['action', 'query']) {
  test(`${source} redirects across locales load a new document with matching messages`, async ({
    page
  }) => {
    const violations = await watchCspViolations(page)
    await page.goto('/pt/i18n-redirect')
    await expect(
      page.getByRole('button', { name: 'Selecionar tema' })
    ).toBeEnabled()
    await page.evaluate(() => {
      document.documentElement.dataset.previousDocument = 'pt'
    })
    const documentResponse = page.waitForResponse(
      response =>
        response.request().isNavigationRequest() &&
        new URL(response.url()).pathname === '/es/i18n-redirect'
    )
    await page
      .getByRole('button', { name: `Spanish ${source} redirect` })
      .click()
    await documentResponse
    await expect(page).toHaveURL(`/es/i18n-redirect?from=${source}#target`)
    await expect(page.locator('html')).toHaveAttribute('lang', 'es-ES')
    await expect(page.getByTestId('locale')).toHaveText('es')
    await expect(page.getByTestId('message')).toHaveText(
      'Una base limpia para productos modernos'
    )
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-previous-document'
    )
    expect(violations).toStrictEqual([])
  })
}

test('same-locale action redirects preserve the document and SPA history retains state', async ({
  page
}) => {
  await page.goto('/pt/i18n-redirect')
  await expect(
    page.getByRole('button', { name: 'Selecionar tema' })
  ).toBeEnabled()
  await page.evaluate(() => {
    document.documentElement.dataset.sameDocument = 'kept'
  })
  await page.getByRole('button', { name: 'Portuguese action redirect' }).click()
  await expect(page).toHaveURL('/pt/i18n-redirect?from=action#target')
  await page.getByRole('button', { name: 'Same locale state' }).click()
  await expect(page.getByTestId('state')).toContainText('"marker":"kept"')
  await page.goBack()
  await expect(page).toHaveURL('/pt/i18n-redirect?from=action#target')
  await page.goForward()
  await expect(page).toHaveURL('/pt/i18n-redirect?from=state#target')
  await expect(page.getByTestId('state')).toContainText('"marker":"kept"')
  await expect(page.locator('html')).toHaveAttribute(
    'data-same-document',
    'kept'
  )
})

test('back and forward across locale history entries reload the selected document', async ({
  page
}) => {
  await page.goto('/pt/i18n-redirect')
  await expect(
    page.getByRole('button', { name: 'Selecionar tema' })
  ).toBeEnabled()
  // Simulate existing same-document entries from a previous integration.
  await page.evaluate(() => {
    globalThis.history.pushState(
      { marker: 'es' },
      '',
      '/es/i18n-redirect?history=1#target'
    )
    globalThis.history.pushState(
      { marker: 'pt' },
      '',
      '/pt/i18n-redirect?history=2#target'
    )
  })
  await page.goBack()
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-ES')
  await expect(page.getByTestId('locale')).toHaveText('es')
  await expect(page).toHaveURL('/es/i18n-redirect?history=1#target')
  await page.goForward()
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  await expect(page.getByTestId('locale')).toHaveText('pt')
  await expect(page).toHaveURL('/pt/i18n-redirect?history=2#target')
})

test('SSR query redirect preserves HTTP metadata or a nonce-bearing streamed redirect', async ({
  request
}) => {
  const response = await request.get('/pt/i18n-redirect?initial=1', {
    maxRedirects: 0
  })
  if (response.status() === REDIRECT) {
    expect(response.headers().location).toBe(
      '/es/i18n-redirect?from=query#target'
    )
    return
  }
  expect(response.status()).toBe(OK)
  const nonce = STREAM_REDIRECT.exec(await response.text())?.groups?.nonce
  expect(nonce).toBeDefined()
  expect(response.headers()['content-security-policy']).toContain(
    `'nonce-${nonce}'`
  )
})
test('localized fragment and empty navigation retain the page and query', async ({
  page
}) => {
  await page.goto('/pt/i18n-redirect?filter=active#old')
  await expect(
    page.getByRole('button', { name: 'Selecionar tema' })
  ).toBeEnabled()
  await page.evaluate(() => {
    document.documentElement.dataset.sameDocument = 'kept'
  })
  await page.getByRole('button', { name: 'Navigate fragment' }).click()
  await expect(page).toHaveURL('/pt/i18n-redirect?filter=active#target')
  await page.getByRole('button', { name: 'Navigate empty' }).click()
  await expect(page).toHaveURL('/pt/i18n-redirect?filter=active')
  await expect(page.locator('html')).toHaveAttribute(
    'data-same-document',
    'kept'
  )
})
