import { expect, test } from '@playwright/test'

import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { watchCspViolations } from '@/tests/helpers/watchCspViolations/index.ts'

const LOCALES = [
  {
    locale: 'pt',
    tag: 'pt-BR',
    other: 'es',
    otherTag: 'es-ES',
    theme: 'Selecionar tema'
  },
  {
    locale: 'es',
    tag: 'es-ES',
    other: 'pt',
    otherTag: 'pt-BR',
    theme: 'Seleccionar tema'
  }
]

// oxlint-disable-next-line vitest/prefer-each -- O Playwright não oferece test.each.
for (const language of LOCALES) {
  test(`recovers the selected ${language.locale} history entry when its locale changes before hydration`, async ({
    page
  }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const violations = await watchCspViolations(page)
    await page.goto(`/${language.locale}/i18n-redirect`)
    await expect.poll(() => hydrationFinished(page)).toBe(true)
    await page.evaluate(({ locale, other }) => {
      globalThis.history.pushState(
        { marker: other },
        '',
        `/${other}/i18n-redirect?history=1#target`
      )
      globalThis.history.pushState(
        { marker: locale },
        '',
        `/${locale}/i18n-redirect?history=2#target`
      )
    }, language)
    const historyLength = await page.evaluate(() => globalThis.history.length)
    const scriptsRequested = Promise.withResolvers<null>()
    const releaseScripts = Promise.withResolvers<null>()
    await page.route('**/*.js', async route => {
      scriptsRequested.resolve(null)
      await releaseScripts.promise
      await route.continue()
    })

    try {
      await page.goBack({ waitUntil: 'commit' })
      await scriptsRequested.promise
      await expect(page.locator('html')).toHaveAttribute(
        'lang',
        language.otherTag
      )
      expect(await hydrationFinished(page)).toBe(false)
      await page.goForward({ waitUntil: 'commit' })
      await expect(page).toHaveURL(
        `/${language.locale}/i18n-redirect?history=2#target`
      )
      await expect(page.locator('html')).toHaveAttribute(
        'lang',
        language.otherTag
      )
      expect(await hydrationFinished(page)).toBe(false)
      releaseScripts.resolve(null)

      await expect(page.locator('html')).toHaveAttribute('lang', language.tag)
      await expect(page.getByTestId('locale')).toHaveText(language.locale)
      await expect.poll(() => hydrationFinished(page)).toBe(true)
      await expect(page).toHaveURL(
        `/${language.locale}/i18n-redirect?history=2#target`
      )
      expect(
        await page.evaluate(() => ({
          state: globalThis.history.state as unknown,
          length: globalThis.history.length
        }))
      ).toMatchObject({
        state: { marker: language.locale },
        length: historyLength
      })
      await page.getByRole('button', { name: language.theme }).click()
      await expect(page.getByRole('menu')).toBeVisible()
      expect(errors).toEqual([])
      expect(violations).toEqual([])
    } finally {
      releaseScripts.resolve(null)
    }
  })
}

test('keeps the SSR document when history changes within its locale before hydration', async ({
  page
}) => {
  const scriptsRequested = Promise.withResolvers<null>()
  const releaseScripts = Promise.withResolvers<null>()
  await page.route('**/*.js', async route => {
    scriptsRequested.resolve(null)
    await releaseScripts.promise
    await route.continue()
  })
  try {
    await page.goto('/pt/i18n-redirect', { waitUntil: 'commit' })
    await scriptsRequested.promise
    await expect(page.getByTestId('locale')).toHaveText('pt')
    expect(await hydrationFinished(page)).toBe(false)
    await page.evaluate(() => {
      document.documentElement.dataset.ssrDocument = 'kept'
      globalThis.history.pushState(
        { marker: 'kept' },
        '',
        '/pt/i18n-redirect?history=1#target'
      )
    })
    releaseScripts.resolve(null)

    await expect.poll(() => hydrationFinished(page)).toBe(true)
    await expect(page.locator('html')).toHaveAttribute(
      'data-ssr-document',
      'kept'
    )
    await expect(page).toHaveURL('/pt/i18n-redirect?history=1#target')
    expect(
      await page.evaluate(() => globalThis.history.state as unknown)
    ).toMatchObject({ marker: 'kept' })
    await page.getByRole('button', { name: 'Selecionar tema' }).click()
    await expect(page.getByRole('menu')).toBeVisible()
  } finally {
    releaseScripts.resolve(null)
  }
})

test('does not reload an unchanged URL when its SSR language differs', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const violations = await watchCspViolations(page)
  let documentRequests = 0
  await page.route('**/pt/i18n-redirect', async route => {
    documentRequests += 1
    const response = await route.fetch()
    const html = await response.text()
    const body = html.replace('lang="pt-BR"', 'lang="en-US"')
    await route.fulfill({ response, body })
  })

  await page.goto('/pt/i18n-redirect', { waitUntil: 'commit' })
  await expect.poll(() => hydrationFinished(page)).toBe(true)
  await page.getByRole('button', { name: 'Selecionar tema' }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page).toHaveURL('/pt/i18n-redirect')
  expect(documentRequests).toBe(1)
  expect(errors).toEqual([])
  expect(violations).toEqual([])
})
