import { expect, test } from '@playwright/test'

const HTTP_NOT_FOUND = 404

test.describe('aplicação', () => {
  test('carrega a página inicial e hidrata o contador', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle('Solid App')
    await expect(
      page.getByRole('heading', { name: 'SolidJS 2 + Vite+' })
    ).toBeVisible()

    await page.getByRole('button', { name: 'Count is 0', exact: true }).click()

    await expect(
      page.getByRole('button', { name: 'Count is 1', exact: true })
    ).toBeVisible()
  })

  test('chama a função do servidor com contexto da requisição', async ({
    page
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Chamar o servidor' }).click()

    await expect(
      page.getByText(/^Node v\d+\.\d+\.\d+ · request [\da-f-]+$/u)
    ).toBeVisible()
  })

  test('responde com status 404 e permite voltar ao início', async ({
    page
  }) => {
    const response = await page.goto('/pagina-inexistente')

    expect(response?.status()).toBe(HTTP_NOT_FOUND)
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible()

    await page.getByRole('link', { name: 'Voltar para o início' }).click()

    await expect(page).toHaveURL('/')
    await expect(
      page.getByRole('heading', { name: 'SolidJS 2 + Vite+' })
    ).toBeVisible()
  })
})
