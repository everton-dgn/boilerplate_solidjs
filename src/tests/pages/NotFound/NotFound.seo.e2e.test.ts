import { expect, test } from '@playwright/test'

const SOCIAL_TAGS = 'head meta[property^="og:"], head meta[name^="twitter:"]'

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
    await expect(page.locator(SOCIAL_TAGS)).toHaveCount(0)
    await expect(
      page.locator('head script[type="application/ld+json"]')
    ).toHaveCount(0)
  })
})

test.describe('página inexistente hidratada', () => {
  test('mantém só robots, título e descrição depois de hidratar', async ({
    page
  }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/pagina-inexistente')

    // O menu de tema só abre com o JavaScript hidratado.
    await page.getByRole('button', { name: 'Selecionar tema' }).click()
    await expect(page.getByRole('menu')).toBeVisible()

    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex'
    )
    await expect(page.locator('head title')).toHaveCount(1)
    await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0)
    await expect(page.locator(SOCIAL_TAGS)).toHaveCount(0)
    await expect(
      page.locator('head script[type="application/ld+json"]')
    ).toHaveCount(0)
    expect(errors).toStrictEqual([])
  })
})
