import { expect, test } from '@playwright/test'

const HTTP_OK = 200
const HTTP_NOT_FOUND = 404

test.describe('layout na árvore de produção', () => {
  test('renderiza Home e 404 com barra no SSR', async ({
    browser,
    baseURL
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL
    })
    const page = await context.newPage()
    try {
      const home = await page.goto('/')
      expect(home?.status()).toBe(HTTP_OK)
      await expect(page.getByRole('banner')).toHaveCount(1)
      await expect(
        page.getByRole('heading', {
          name: 'Uma base limpa para produtos modernos'
        })
      ).toBeVisible()
      await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1)

      const missing = await page.goto('/pagina-inexistente')
      expect(missing?.status()).toBe(HTTP_NOT_FOUND)
      await expect(page.getByRole('banner')).toHaveCount(1)
      await expect(page).toHaveTitle('Página não encontrada')
      await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex'
      )
      await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0)
    } finally {
      await context.close()
    }
  })

  test('preserva a mesma barra ao navegar entre Home e 404', async ({
    page
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Selecionar tema' }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    const topbar = await page.getByRole('banner').elementHandle()
    expect(topbar).not.toBeNull()

    await page.getByRole('link', { name: '404', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Página não encontrada!' })
    ).toBeVisible()
    expect(
      await topbar.evaluate(
        element => element === document.querySelector('header')
      )
    ).toBe(true)
    await page.getByRole('link', { name: 'Voltar ao início' }).click()
    await expect(page).toHaveURL('/')
    await expect(
      page.getByRole('heading', {
        name: 'Uma base limpa para produtos modernos'
      })
    ).toBeVisible()
    expect(
      await topbar.evaluate(
        element => element === document.querySelector('header')
      )
    ).toBe(true)
  })
})

// O build E2E monta a cadeia pela fábrica; aqui passa o export padrão real.
test.describe('middleware na entrada de produção', () => {
  test('aplica os cabeçalhos de segurança', async ({ request }) => {
    const response = await request.get('/')

    expect(response.status()).toBe(HTTP_OK)
    expect(response.headers()).toMatchObject({
      'strict-transport-security':
        'max-age=63072000; includeSubDomains; preload',
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
      'cross-origin-resource-policy': 'same-origin',
      'content-security-policy': expect.stringContaining("script-src 'nonce-")
    })
  })
})
