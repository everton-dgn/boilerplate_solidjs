import { expect, test } from '@playwright/test'

import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'

test.describe('página inexistente', () => {
  test.use({ javaScriptEnabled: false })

  test('pede noindex e mantém canonical absoluta na carga direta', async ({
    page
  }) => {
    const siteUrl = readSiteOrigin()
    await page.goto('/pagina-inexistente')

    await expect(page).toHaveTitle('Página não encontrada')
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
      'content',
      'A página solicitada não foi encontrada.'
    )
    await expect(
      page.locator('head meta[property="og:title"]')
    ).toHaveAttribute('content', 'Página não encontrada')
    await expect(
      page.locator('head meta[name="twitter:description"]')
    ).toHaveAttribute('content', 'A página solicitada não foi encontrada.')
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex'
    )
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${siteUrl}/pagina-inexistente`
    )
  })
})
