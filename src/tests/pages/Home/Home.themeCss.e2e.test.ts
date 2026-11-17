import { expect, test } from '@playwright/test'

test.use({ locale: 'pt-BR' })

test.describe('colors in the initial HTML', () => {
  test.use({ javaScriptEnabled: false })

  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${colorScheme} system`, () => {
      test.use({ colorScheme })

      test(`initial CSS follows the ${colorScheme} system`, async ({
        page
      }) => {
        await page.goto('/')
        await expect(page.locator('html')).not.toHaveClass(/light|dark/u)
        await expect(page.locator('body')).toHaveCSS(
          'background-color',
          colorScheme === 'light'
            ? 'oklch(1 0 0)'
            : 'oklch(0.141 0.005 285.823)'
        )
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      })
    })
  }

  for (const theme of ['light', 'dark'] as const) {
    test.describe(`cookie ${theme}`, () => {
      test.use({ colorScheme: theme === 'light' ? 'dark' : 'light' })

      test(`SSR applies the ${theme} cookie against the system before the hydration`, async ({
        page,
        context,
        baseURL
      }) => {
        if (!baseURL) throw new Error('Missing test base URL')
        await context.addCookies([
          { name: 'app-theme', value: theme, url: baseURL }
        ])
        await page.goto('/')
        await expect(page.locator('html')).toHaveClass(theme)
        await expect(page.locator('html')).toHaveCSS('color-scheme', theme)
        await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
          'content',
          theme === 'light' ? '#ffffff' : '#09090b'
        )
        await expect(page.locator('body')).toHaveCSS(
          'background-color',
          theme === 'light' ? 'oklch(1 0 0)' : 'oklch(0.141 0.005 285.823)'
        )
      })
    })
  }
})

test('an explicit choice changes the computed colors and wins over the system', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Selecionar tema' }).click()
  await page.getByRole('menuitemradio', { name: 'Claro', exact: true }).click()
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'oklch(1 0 0)'
  )
  await page.getByRole('button', { name: 'Selecionar tema' }).click()
  await page.getByRole('menuitemradio', { name: 'Escuro' }).click()
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'oklch(0.141 0.005 285.823)'
  )
})

test('keeps the visible focus in the menu in high contrast', async ({
  page
}) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Selecionar tema' }).click()
  const option = page.getByRole('menuitemradio', { name: 'Claro', exact: true })
  await expect(option).toBeFocused()
  await expect(option).toHaveCSS('outline-style', 'solid')
  await expect(option).toHaveCSS('outline-width', '3px')
})
