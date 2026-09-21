import { expect, test } from '@playwright/test'

test.describe('página inexistente', () => {
  test.use({ javaScriptEnabled: false })

  test('pede noindex e omite canonical, Open Graph e JSON-LD na carga direta', async ({
    page
  }) => {
    await page.goto('/pagina-inexistente')

    await expect(page).toHaveTitle('Página não encontrada')
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
      'content',
      'A página solicitada não foi encontrada.'
    )
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex'
    )
    await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0)
    await expect(page.locator('head meta[property="og:title"]')).toHaveCount(0)
    await expect(page.locator('head meta[property="og:url"]')).toHaveCount(0)
    await expect(
      page.locator('head meta[name="twitter:description"]')
    ).toHaveCount(0)
    await expect(
      page.locator('head script[type="application/ld+json"]')
    ).toHaveCount(0)
  })
})
