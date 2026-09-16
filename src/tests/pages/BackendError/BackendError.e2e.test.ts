import { expect, test } from '@playwright/test'
import * as v from 'valibot'

const BACKEND = 'http://127.0.0.1:4318'
const HTTP_OK = 200
const HTTP_INTERNAL_SERVER_ERROR = 500
const ATTEMPTS_AFTER_RETRY = 2
const backendState = v.object({ attempts: v.number() })

const SCENARIOS = [
  { phase: 'ssr', javaScriptEnabled: true },
  { phase: 'action', javaScriptEnabled: true },
  { phase: 'stream', javaScriptEnabled: true },
  { phase: 'ssr', javaScriptEnabled: false }
] as const

for (const { phase, javaScriptEnabled } of SCENARIOS) {
  test.describe(`erro de backend: ${phase}, JavaScript ${javaScriptEnabled ? 'ativo' : 'desativado'}`, () => {
    test.use({ javaScriptEnabled })

    test('recarrega a página com falha e após o backend voltar', async ({
      page,
      request
    }, testInfo) => {
      const id = crypto.randomUUID()
      const browserErrors: string[] = []
      page.on('pageerror', error => browserErrors.push(error.message))

      const response = await page.goto(`/backend-error?phase=${phase}&id=${id}`)
      const pageUrl = page.url()
      expect(response?.status()).toBe(
        phase === 'ssr' ? HTTP_INTERNAL_SERVER_ERROR : HTTP_OK
      )
      if (phase === 'action') {
        await expect(page.getByText('Pronto para consultar')).toBeVisible()
        await page.getByRole('button', { name: 'Consultar backend' }).click()
      }

      await expect(
        page.getByRole('heading', { name: 'Algo deu errado!' })
      ).toBeVisible()
      await expect(page.locator('header')).toHaveCount(0)
      await page.screenshot({
        path: testInfo.outputPath('backend-error.png'),
        fullPage: true
      })

      // Uma navegação completa precisa funcionar sem hidratação nem invalidação de query.
      const retryResponse = page.waitForResponse(candidate =>
        candidate.request().isNavigationRequest()
      )
      await page.getByRole('link', { name: 'Recarregar página' }).click()
      const failedReload = await retryResponse
      expect(failedReload.status()).toBe(
        phase === 'ssr' ? HTTP_INTERNAL_SERVER_ERROR : HTTP_OK
      )
      await expect(page).toHaveURL(pageUrl)
      if (phase === 'action') {
        await expect(page.getByText('Pronto para consultar')).toBeVisible()
        await page.getByRole('button', { name: 'Consultar backend' }).click()
      }
      await expect
        .poll(async () => {
          const state = await request.get(`${BACKEND}/control?id=${id}`)
          return v.parse(backendState, await state.json()).attempts
        })
        .toBe(ATTEMPTS_AFTER_RETRY)
      await expect(
        page.getByRole('heading', { name: 'Algo deu errado!' })
      ).toBeVisible()

      // TODO: no Solid 2.0.0-rc.8 a exceção do servidor é repetida ao hidratar
      // o fallback, no payload inicial e no stream. Ao subir a versão, reproduza
      // com Emulation.setCPUThrottlingRate em 20x e remova esta exceção se o
      // erro não chegar mais ao navegador.
      const rendersOnServer = phase !== 'action'
      expect(
        browserErrors.filter(
          message => !rendersOnServer || message !== 'Backend indisponível'
        )
      ).toStrictEqual([])
      browserErrors.length = 0

      await request.post(`${BACKEND}/control?id=${id}`)
      const recoveryResponse = page.waitForResponse(candidate =>
        candidate.request().isNavigationRequest()
      )
      await page.getByRole('link', { name: 'Recarregar página' }).click()
      const recoveredReload = await recoveryResponse
      expect(recoveredReload.status()).toBe(HTTP_OK)
      if (phase === 'action') {
        await expect(page.getByText('Pronto para consultar')).toBeVisible()
        await page.getByRole('button', { name: 'Consultar backend' }).click()
      }
      await expect(
        page.getByText('Backend recuperado', { exact: true })
      ).toBeVisible()
      await expect(page.locator('[data-error-variant="runtime"]')).toHaveCount(
        0
      )
      expect(browserErrors).toStrictEqual([])
    })
  })
}
