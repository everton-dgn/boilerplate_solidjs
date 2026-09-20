import { env } from 'node:process'

import { expect, test } from '@playwright/test'

test.describe('página inexistente', () => {
  test('pede noindex e mantém canonical absoluta na carga direta', async ({
    page,
    baseURL
  }) => {
    const siteUrl = new URL(env.VITE_SITE_URL ?? String(baseURL)).origin
    await page.goto('/pagina-inexistente')

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
