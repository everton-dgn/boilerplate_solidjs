import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

const HTTP_NOT_FOUND = 404
const SOCIAL_TAGS = 'head meta[property^="og:"], head meta[name^="twitter:"]'

test.describe('página inexistente', () => {
  test.use({ javaScriptEnabled: false })

  test('pede noindex e omite canonical, Open Graph e JSON-LD na carga direta', async ({
    page
  }) => {
    await page.goto('/pagina-inexistente')

    await expect(page).toHaveTitle('Page not found')
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
      'content',
      'The requested page was not found.'
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
  test('responde 404, mantém só robots, título e descrição depois de hidratar e volta ao início', async ({
    page,
    pageErrors
  }) => {
    const response = await page.goto('/pagina-inexistente')
    expect(response?.status()).toBe(HTTP_NOT_FOUND)

    // O menu de tema só abre com o JavaScript hidratado.
    await page.getByRole('button', { name: 'Select theme' }).click()
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

    await page.getByRole('link', { name: 'Back to home' }).click()
    await expect(page).toHaveURL('/en')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'SolidJS Boilerplate for web applications'
    )
    expect(pageErrors).toStrictEqual([])
  })
})
