import { expect, test } from '@playwright/test'

test.describe('cores CSS sem JavaScript', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`CSS segue o sistema ${colorScheme} sem JavaScript`, async ({
      browser
    }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        colorScheme
      })
      try {
        const page = await context.newPage()
        await page.goto('/')
        await expect(page.locator('html')).not.toHaveClass(/light|dark/u)
        await expect(page.locator('body')).toHaveCSS(
          'background-color',
          colorScheme === 'light'
            ? 'oklch(1 0 0)'
            : 'oklch(0.141 0.005 285.823)'
        )
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      } finally {
        await context.close()
      }
    })
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`SSR aplica cookie ${theme} sem JavaScript e contra o sistema`, async ({
      browser,
      baseURL
    }) => {
      if (!baseURL) throw new Error('Missing test base URL')
      const context = await browser.newContext({
        baseURL,
        javaScriptEnabled: false,
        colorScheme: theme === 'light' ? 'dark' : 'light'
      })
      try {
        await context.addCookies([
          { name: 'app-theme', value: theme, url: baseURL }
        ])
        const page = await context.newPage()
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
      } finally {
        await context.close()
      }
    })
  }
})

test('escolha explícita altera as cores computadas e prevalece sobre o sistema', async ({
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

test('preserva foco visível no menu em alto contraste', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Selecionar tema' }).click()
  const option = page.getByRole('menuitemradio', { name: 'Claro', exact: true })
  await expect(option).toBeFocused()
  await expect(option).toHaveCSS('outline-style', 'solid')
  await expect(option).toHaveCSS('outline-width', '3px')
})
