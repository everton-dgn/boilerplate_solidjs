import { expect, test, type Page, type Route } from '@playwright/test'

import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { watchCspViolations } from '@/tests/helpers/watchCspViolations/index.ts'

const HTTP_OK = 200
const PAGE_URL = '/en'
const SCRIPTS = '**/*.js'
const MARKER = 'data-hydration-ended'
const HOME_TITLE = 'SolidJS Boilerplate for web applications'
const ABOUT_TITLE = 'About SolidJS Boilerplate'
const THEME_BUTTON = 'Select theme'
// A ordem dos atributos não faz parte do contrato do plugin.
const ENTRY_SCRIPT =
  /<script\b(?=[^>]*\btype="module")(?=[^>]*\basync\b)[^>]*>/u

type ScriptGate = {
  requested: Promise<null>
  release: () => Promise<void>
}

// Segura todos os scripts até release(): o documento fica no HTML do servidor
// enquanto o bundle não chega, sem depender de tempo.
async function holdScripts(page: Page): Promise<ScriptGate> {
  const requested = Promise.withResolvers<null>()
  const released = Promise.withResolvers<null>()
  async function handler(route: Route): Promise<void> {
    requested.resolve(null)
    await released.promise
    await route.continue()
  }
  await page.route(SCRIPTS, handler)
  return {
    requested: requested.promise,
    release: async () => {
      released.resolve(null)
      await page.unrouteAll({ behavior: 'wait' })
    }
  }
}

async function expectServerDocument(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HOME_TITLE)
  await expect(
    page.getByRole('link', { name: 'Home', exact: true })
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(page.locator('html')).not.toHaveAttribute(MARKER)
  expect(await hydrationFinished(page)).toBe(false)
}

async function expectInteractiveDocument(page: Page): Promise<void> {
  await expect.poll(() => hydrationFinished(page)).toBe(true)
  await page.getByRole('button', { name: THEME_BUTTON }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).not.toBeVisible()
}

test('serves the document without the hydration marker', async ({
  request
}) => {
  const response = await request.get(PAGE_URL)
  const html = await response.text()
  expect(response.status()).toBe(HTTP_OK)
  expect(html).toMatch(/<html\b[^>]*\blang="en-US"/u)
  expect(html).toContain(HOME_TITLE)
  expect(html).toMatch(ENTRY_SCRIPT)
  expect(html).not.toContain(MARKER)
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('keeps the server document unmarked and without handlers', async ({
    page
  }) => {
    await page.goto(PAGE_URL)
    await expectServerDocument(page)
    await expect(
      page.getByRole('button', { name: THEME_BUTTON })
    ).toBeDisabled()
    await expect(page.getByRole('menu')).toHaveCount(0)
    expect(await page.evaluate(() => document.readyState)).toBe('complete')
    expect(await hydrationFinished(page)).toBe(false)
  })
})

test('marks hydration only after the bundle runs, on every document load', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const violations = await watchCspViolations(page)
  let gate = await holdScripts(page)
  try {
    await page.goto(PAGE_URL, { waitUntil: 'commit' })
    await gate.requested
    await expectServerDocument(page)
    await gate.release()
    await expectInteractiveDocument(page)

    gate = await holdScripts(page)
    await page.reload({ waitUntil: 'commit' })
    await gate.requested
    await expectServerDocument(page)
    await gate.release()
    await expectInteractiveDocument(page)
    expect(errors).toEqual([])
    expect(violations).toEqual([])
  } finally {
    await gate.release()
  }
})

test('does not mark hydration when the bundle fails to load', async ({
  page
}) => {
  const entryFailed = page.waitForEvent('requestfailed', request =>
    request.url().endsWith('.js')
  )
  await page.route(SCRIPTS, route => route.abort('failed'))
  await page.goto(PAGE_URL)
  await entryFailed
  expect(await page.evaluate(() => document.readyState)).toBe('complete')
  await expectServerDocument(page)
  await expect(page.getByRole('button', { name: THEME_BUTTON })).toBeDisabled()
  await expect(page.getByRole('menu')).toHaveCount(0)
  expect(await hydrationFinished(page)).toBe(false)
})

test('keeps the marker and interactivity across client-side navigation', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const violations = await watchCspViolations(page)
  let documentRequests = 0
  page.on('request', request => {
    if (request.resourceType() === 'document') documentRequests += 1
  })
  await page.goto(PAGE_URL)
  await expectInteractiveDocument(page)

  const navigation = page.getByRole('navigation', { name: 'Main', exact: true })
  await navigation.getByRole('link', { name: 'About', exact: true }).click()
  await expect(page).toHaveURL('/en/about')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ABOUT_TITLE)
  await expect(
    navigation.getByRole('link', { name: 'About', exact: true })
  ).toHaveAttribute('aria-current', 'page')
  await expectInteractiveDocument(page)

  await navigation.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page).toHaveURL(PAGE_URL)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HOME_TITLE)
  await expectInteractiveDocument(page)
  expect(documentRequests).toBe(1)
  expect(errors).toEqual([])
  expect(violations).toEqual([])
})

test('replays a click captured before hydration after the bundle is released', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const gate = await holdScripts(page)
  try {
    await page.goto(PAGE_URL, { waitUntil: 'commit' })
    await gate.requested
    await page.getByRole('button', { name: 'Select language' }).click()
    await expect(page.getByRole('menu')).toHaveCount(0)
    expect(await hydrationFinished(page)).toBe(false)
    await gate.release()

    await expect.poll(() => hydrationFinished(page)).toBe(true)
    await expect(
      page.getByRole('menu', { name: 'Language', exact: true })
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).not.toBeVisible()
    await expectInteractiveDocument(page)
    expect(errors).toEqual([])
  } finally {
    await gate.release()
  }
})
