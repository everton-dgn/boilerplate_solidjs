import { expect, test } from '@playwright/test'

const MOBILE_WIDTH = 375
const DESKTOP_WIDTH = 1280

test.describe('layout responsivo', () => {
  for (const width of [MOBILE_WIDTH, DESKTOP_WIDTH]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`${width}px no tema ${colorScheme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 })
        await page.emulateMedia({ colorScheme })
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        await page.goto('/')
        await page.getByRole('button', { name: 'Selecionar tema' }).waitFor()
        await expect(page.locator('html')).toHaveClass(colorScheme)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        ).toBeTruthy()
        await page.getByRole('button', { name: 'Selecionar tema' }).click()
        await expect(page.getByRole('menu')).toBeVisible()
        await page.keyboard.press('Escape')
        await page.getByRole('link', { name: '404', exact: true }).click()
        await expect(
          page.getByRole('heading', { name: 'Página não encontrada!' })
        ).toBeVisible()
        await expect(
          page.getByRole('link', { name: '404', exact: true })
        ).toHaveAttribute('aria-current', 'page')
        await expect(
          page.getByRole('link', { name: 'Início', exact: true })
        ).not.toHaveAttribute('aria-current')
        expect(errors).toEqual([])
      })
    }
  }
})
