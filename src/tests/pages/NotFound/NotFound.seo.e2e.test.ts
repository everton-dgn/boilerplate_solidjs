import { env } from 'node:process'

import { expect, test } from '@playwright/test'

test.describe('página inexistente', () => {
  test.use({ javaScriptEnabled: false })

  test('pede noindex e mantém canonical absoluta na carga direta', async ({
    page
  }) => {
    const siteUrl = new URL(String(env.VITE_SITE_URL)).origin
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
