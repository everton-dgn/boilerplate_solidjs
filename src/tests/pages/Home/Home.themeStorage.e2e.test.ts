/* oxlint-disable unicorn/no-document-cookie -- Os testes exercitam a persistência e o bloqueio de cookie diretamente. */
import { expect, test } from '@playwright/test'

test('propaga a escolha temporária quando a escrita no cookie é ignorada', async ({
  context,
  page,
  baseURL
}) => {
  if (!baseURL) throw new Error('Missing test base URL')
  await context.addCookies([
    { name: 'app-theme', value: 'light', url: baseURL }
  ])
  await context.addInitScript(() => {
    const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
    Object.defineProperty(document, 'cookie', {
      get() {
        const value: unknown = cookie?.get?.call(document)
        return typeof value === 'string' ? value : ''
      },
      set() {
        /* Simula um navegador que rejeita escritas silenciosamente. */
      },
      configurable: true
    })
  })
  await page.goto('/')
  const other = await context.newPage()
  await other.goto('/')
  await page.getByRole('button', { name: 'Selecionar tema' }).click()
  await page.getByRole('menuitemradio', { name: 'Escuro' }).click()
  await expect(other.locator('html')).toHaveClass('dark')
  await other.bringToFront()
  await other.evaluate(() => globalThis.dispatchEvent(new FocusEvent('focus')))
  await expect(other.locator('html')).toHaveClass('dark')
  await expect(page.locator('html')).toHaveClass('dark')
  expect(await context.cookies(baseURL)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'app-theme', value: 'light' })
    ])
  )
})

test('retorna ao sistema após remover o cookie e simular foco', async ({
  context,
  page,
  baseURL
}) => {
  if (!baseURL) throw new Error('Missing test base URL')
  await context.addCookies([{ name: 'app-theme', value: 'dark', url: baseURL }])
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const other = await context.newPage()
  await other.goto('/')
  for (const tab of [page, other]) {
    await expect(
      tab.getByRole('button', { name: 'Selecionar tema' })
    ).toBeEnabled()
  }
  await expect(page.locator('html')).toHaveClass('dark')
  await other.evaluate(() => {
    document.cookie = 'app-theme=; Path=/; Max-Age=0'
  })
  expect(await context.cookies(baseURL)).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'app-theme' })])
  )
  await expect(page.locator('html')).toHaveClass('dark')
  await page.evaluate(() => globalThis.dispatchEvent(new FocusEvent('focus')))
  await expect(page.locator('html')).toHaveClass('light')
  await page.getByRole('button', { name: 'Selecionar tema' }).click()
  await expect(
    page.getByRole('menuitemradio', { name: 'Sistema' })
  ).toHaveAttribute('aria-checked', 'true')
})

test('alterna imediatamente quando o acesso a document.cookie está bloqueado', async ({
  context,
  page
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get() {
        throw new DOMException('Blocked', 'SecurityError')
      },
      set() {
        throw new DOMException('Blocked', 'SecurityError')
      }
    })
  })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Selecionar tema' }).click()
  await page.getByRole('menuitemradio', { name: 'Escuro' }).click()
  await expect(page.locator('html')).toHaveClass('dark')
  const cookies = await context.cookies(page.url())
  expect(cookies.some(cookie => cookie.name === 'app-theme')).toBe(false)
  expect(cookies.find(cookie => cookie.name === 'locale')?.value).toBe('pt')
  await page.reload()
  await expect(page.locator('html')).toHaveClass('light')
})
