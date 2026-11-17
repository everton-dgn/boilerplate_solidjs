import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

test.use({ locale: 'pt-BR' })

const THEME_KEY = 'app-theme'

// The listener of the page was registered before this one; when this one fires,
// the theme already had the chance to react to the change.
function watchDarkScheme(): void {
  matchMedia('(prefers-color-scheme: dark)').addEventListener(
    'change',
    event => Reflect.set(globalThis, '__darkSchemeChanged', event.matches),
    { once: true }
  )
}

function hasDarkSchemeChanged(): boolean {
  return Reflect.get(globalThis, '__darkSchemeChanged') === true
}

test.describe('application theme', () => {
  for (const colorScheme of ['dark', 'light'] as const) {
    test(`follows the ${colorScheme} system on the first load`, async ({
      page
    }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto('/')
      await expect(page.locator('html')).toHaveClass(colorScheme)
      expect(await page.context().cookies(page.url())).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: THEME_KEY })])
      )
      await page.getByRole('button', { name: 'Selecionar tema' }).click()
      await expect(
        page.getByRole('menuitemradio', { name: 'Sistema' })
      ).toHaveAttribute('aria-checked', 'true')
    })
  }

  test('syncs two tabs both ways and persists after a reload', async ({
    context,
    page
  }) => {
    await page.goto('/')
    const other = await context.newPage()
    await other.goto('/')
    await page.getByRole('button', { name: 'Selecionar tema' }).click()
    await page.getByRole('menuitemradio', { name: 'Escuro' }).click()
    await expect(other.locator('html')).toHaveClass('dark')
    await other.getByRole('button', { name: 'Selecionar tema' }).click()
    await other
      .getByRole('menuitemradio', { name: 'Claro', exact: true })
      .click()
    await expect(page.locator('html')).toHaveClass('light')
    await page.reload()
    await expect(page.locator('html')).toHaveClass('light')
  })

  test('follows system changes only in system mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveClass('light')
    await page.getByRole('button', { name: 'Selecionar tema' }).click()
    await page
      .getByRole('menuitemradio', { name: 'Claro', exact: true })
      .click()
    await page.evaluate(watchDarkScheme)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => page.evaluate(hasDarkSchemeChanged)).toBe(true)
    await expect(page.locator('html')).toHaveClass('light')
  })

  test('applies a saved preference before hydrating', async ({
    page,
    context,
    baseURL
  }) => {
    if (!baseURL) throw new Error('Missing test base URL')
    await page.emulateMedia({ colorScheme: 'dark' })
    await context.addCookies([
      { name: THEME_KEY, value: 'light', url: baseURL }
    ])
    await page.route(/\/assets\/.*\.js(?:\?.*)?$/u, route => route.abort())
    await page.goto('/')
    await expect(page.locator('html')).toHaveClass('light')
    await expect(
      page.getByRole('button', { name: 'Selecionar tema' })
    ).toBeDisabled()
  })

  test('reads the cookie again with a simulated focus event without BroadcastChannel', async ({
    context,
    page
  }) => {
    await context.addInitScript(() => {
      Object.defineProperty(globalThis, 'BroadcastChannel', {
        value: undefined
      })
    })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const other = await context.newPage()
    await other.emulateMedia({ colorScheme: 'light' })
    await other.goto('/')
    for (const tab of [page, other]) {
      await expect(
        tab.getByRole('button', { name: 'Selecionar tema' })
      ).toBeEnabled()
    }
    await expect(other.locator('html')).toHaveClass('light')
    await page.getByRole('button', { name: 'Selecionar tema' }).click()
    await page.getByRole('menuitemradio', { name: 'Escuro' }).click()
    await expect(page.locator('html')).toHaveClass('dark')
    await expect(other.locator('html')).toHaveClass('light')
    expect(await context.cookies(page.url())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: THEME_KEY, value: 'dark' })
      ])
    )
    await other.evaluate(() =>
      globalThis.dispatchEvent(new FocusEvent('focus'))
    )
    await expect(other.locator('html')).toHaveClass('dark')
  })

  for (const colorScheme of ['dark', 'light'] as const) {
    for (const preference of ['system', 'missing']) {
      test(`resolves ${preference} as ${colorScheme} in the script before the hydration`, async ({
        page,
        context,
        baseURL,
        pageErrors
      }) => {
        if (!baseURL) throw new Error('Missing test base URL')
        if (preference === 'system') {
          await context.addCookies([
            { name: THEME_KEY, value: preference, url: baseURL }
          ])
        }
        await page.emulateMedia({ colorScheme })
        await page.route(/\/assets\/.*\.js(?:\?.*)?$/u, route => route.abort())
        await page.goto('/')
        await expect(page.locator('html')).toHaveClass(colorScheme)
        await expect(page.locator('html')).toHaveCSS(
          'color-scheme',
          colorScheme
        )
        await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
          'content',
          colorScheme === 'dark' ? '#09090b' : '#ffffff'
        )
        await expect(
          page.getByRole('button', { name: 'Selecionar tema' })
        ).toBeDisabled()
        expect(pageErrors).toStrictEqual([])
      })
    }
  }
})
