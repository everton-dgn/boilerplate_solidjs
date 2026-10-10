import { expect, test } from '@playwright/test'

import english from '@/components/organisms/ErrorFallback/messages/en.json' with { type: 'json' }
import spanish from '@/components/organisms/ErrorFallback/messages/es.json' with { type: 'json' }
import portuguese from '@/components/organisms/ErrorFallback/messages/pt.json' with { type: 'json' }

const HTTP_INTERNAL_SERVER_ERROR = 500
const LANGUAGES = [
  { locale: 'pt', messages: portuguese },
  { locale: 'en', messages: english },
  { locale: 'es', messages: spanish }
]

// oxlint-disable-next-line vitest/prefer-each -- O Playwright não oferece test.each.
for (const { locale, messages } of LANGUAGES) {
  test(`runtime errors publish translated ${locale} metadata without JavaScript`, async ({
    browser,
    baseURL
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL
    })
    try {
      const page = await context.newPage()
      const response = await page.goto(
        `/${locale}/outside-error?case=render-root&id=${crypto.randomUUID()}`
      )
      expect(response?.status()).toBe(HTTP_INTERNAL_SERVER_ERROR)
      await expect(page).toHaveTitle(messages.errorFallback_runtimeTitle)
      await expect(
        page.locator('head meta[name="description"]')
      ).toHaveAttribute('content', messages.errorFallback_runtimeDescription)
      await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex'
      )
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        messages.errorFallback_runtimeTitle
      )
    } finally {
      await context.close()
    }
  })
}

test('a server function keeps the page locale when the cookie disagrees', async ({
  page,
  context,
  baseURL
}) => {
  if (!baseURL) throw new Error('Missing test URL')
  await context.addCookies([{ name: 'locale', value: 'es', url: baseURL }])
  await page.goto('/en/i18n-action')
  await expect(page.getByRole('button', { name: 'Select theme' })).toBeEnabled()
  await context.addCookies([{ name: 'locale', value: 'es', url: baseURL }])
  const response = page.waitForResponse(candidate =>
    new URL(candidate.url()).pathname.startsWith('/_server/')
  )
  await page.getByRole('button', { name: 'Read server locale' }).focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByText('A clean foundation for modern products', { exact: true })
  ).toBeVisible()
  const actionResponse = await response
  expect(actionResponse.headers()['content-language']).toBe('en')
  await expect(page).toHaveURL('/en/i18n-action')
})
