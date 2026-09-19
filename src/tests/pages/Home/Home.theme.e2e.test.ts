import { expect, test } from '@playwright/test'

const THEME_KEY = 'app-theme'

test.describe('tema da aplicação', () => {
  for (const colorScheme of ['dark', 'light'] as const) {
    test(`segue o sistema ${colorScheme} no primeiro carregamento`, async ({
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

  test('sincroniza duas abas nos dois sentidos e persiste após recarga', async ({
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

  test('acompanha mudanças do sistema somente no modo sistema', async ({
    page
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveClass('light')
    await page.getByRole('button', { name: 'Selecionar tema' }).click()
    await page.getByRole('menuitemradio', { name: 'Escuro' }).click()
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveClass('dark')
  })

  test('aplica preferência salva antes de hidratar', async ({
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

  test('relê o cookie com evento de foco simulado sem BroadcastChannel', async ({
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
      test(`resolve ${preference} como ${colorScheme} no script antes da hidratação`, async ({
        page,
        context,
        baseURL
      }) => {
        if (!baseURL) throw new Error('Missing test base URL')
        if (preference === 'system') {
          await context.addCookies([
            { name: THEME_KEY, value: preference, url: baseURL }
          ])
        }
        const scriptErrors: string[] = []
        page.on('pageerror', error => scriptErrors.push(error.message))
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
        expect(scriptErrors).toStrictEqual([])
      })
    }
  }
})
