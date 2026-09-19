import { expect, test } from '@playwright/test'

const HTTP_NOT_FOUND = 404

test.describe('aplicação', () => {
  test('responde com status 404 e permite voltar ao início', async ({
    page
  }) => {
    const response = await page.goto('/pagina-inexistente')

    expect(response?.status()).toBe(HTTP_NOT_FOUND)
    await expect(
      page.getByRole('heading', { name: 'Página não encontrada!' })
    ).toBeVisible()

    await page.getByRole('link', { name: 'Voltar ao início' }).click()

    await expect(page).toHaveURL('/')
    await expect(
      page.getByRole('heading', {
        name: 'Uma base limpa para produtos modernos'
      })
    ).toBeVisible()
  })
})
