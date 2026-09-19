import { readdir, readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'
import * as v from 'valibot'

const BACKEND = 'http://127.0.0.1:4318'
const HTTP_OK = 200
const HTTP_INTERNAL_SERVER_ERROR = 500
const ATTEMPTS_AFTER_RETRY = 2
const backendState = v.object({ attempts: v.number(), marker: v.string() })
type ServerResponse = {
  body: string
  headers: Record<string, string>
  status: number
}

async function captureServerFunctions(page: Page): Promise<ServerResponse[]> {
  const responses: ServerResponse[] = []
  // O decoder cancela o stream HTTP ao receber a exceção. Capturamos o corpo
  // real antes de entregá-lo ao browser, sem substituir dados ou status.
  await page.route('**/_server/**', async route => {
    const response = await route.fetch()
    responses.push({
      body: await response.text(),
      headers: response.headers(),
      status: response.status()
    })
    await route.fulfill({ response })
  })
  return responses
}

const SCENARIOS = [
  { phase: 'ssr', javaScriptEnabled: true },
  { phase: 'action', javaScriptEnabled: true },
  { phase: 'stream', javaScriptEnabled: true },
  { phase: 'ssr', javaScriptEnabled: false }
] as const

test('o bundle cliente não inclui a implementação do servidor', async () => {
  const directory = new URL(
    '../../../../.vercel/output/static/',
    import.meta.url
  )
  const entries = await readdir(directory, { recursive: true })
  const files = entries.filter(file => file.endsWith('.js'))
  expect(files.length).toBeGreaterThan(0)
  for (const file of files) {
    const source = await readFile(new URL(file, directory), 'utf8')
    expect(source).not.toContain('[server-operation]')
    expect(source).not.toContain('127.0.0.1:4318')
  }
})

for (const { phase, javaScriptEnabled } of SCENARIOS) {
  test.describe(`erro de backend: ${phase}, JavaScript ${javaScriptEnabled ? 'ativo' : 'desativado'}`, () => {
    test.use({ javaScriptEnabled })

    test('recarrega a página com falha e após o backend voltar', async ({
      page,
      request
    }, testInfo) => {
      const id = crypto.randomUUID()
      const initialState = await request.get(`${BACKEND}/control?id=${id}`)
      const privateMarker = v.parse(
        backendState,
        await initialState.json()
      ).marker
      const browserErrors: string[] = []
      const serverResponses = await captureServerFunctions(page)
      page.on('pageerror', error => browserErrors.push(error.message))

      const response = await page.goto(`/backend-error?phase=${phase}&id=${id}`)
      expect(await response?.text()).not.toContain(privateMarker)
      expect(JSON.stringify(response?.headers())).not.toContain(privateMarker)
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
      expect(await failedReload.text()).not.toContain(privateMarker)
      expect(JSON.stringify(failedReload.headers())).not.toContain(
        privateMarker
      )
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

      // A exceção pública pode se repetir ao hidratar o fallback, no payload
      // inicial e no stream. Ao atualizar o runtime, reproduza
      // com Emulation.setCPUThrottlingRate em 20x e remova esta exceção se o
      // erro não chegar mais ao navegador.
      const rendersOnServer = phase !== 'action'
      expect(
        browserErrors.filter(
          message =>
            !rendersOnServer ||
            message !== 'Não foi possível concluir a solicitação.'
        )
      ).toStrictEqual([])
      browserErrors.length = 0

      await request.post(`${BACKEND}/control?id=${id}`)
      const recoveryResponse = page.waitForResponse(candidate =>
        candidate.request().isNavigationRequest()
      )
      await page.getByRole('link', { name: 'Recarregar página' }).click()
      const recoveredReload = await recoveryResponse
      expect(await recoveredReload.text()).not.toContain(privateMarker)
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
      if (phase === 'action') {
        expect(serverResponses).toHaveLength(ATTEMPTS_AFTER_RETRY + 1)
      }
      expect(JSON.stringify(serverResponses)).not.toContain(privateMarker)
    })
  })
}

for (const phase of ['ssr', 'stream', 'action']) {
  // oxlint-disable-next-line vitest/prefer-each -- O runner do Playwright não oferece test.each.
  for (const failure of ['http', 'throw', 'result', 'public', 'success']) {
    test(`confidencialidade: ${phase}, ${failure}`, async ({
      page,
      request
    }) => {
      const id = `${failure}:${crypto.randomUUID()}`
      const state = await request.get(`${BACKEND}/control?id=${id}`)
      const { marker } = v.parse(backendState, await state.json())
      const browserErrors: string[] = []
      const serverResponses = await captureServerFunctions(page)
      page.on('pageerror', error => browserErrors.push(error.message))
      const response = await page.goto(`/backend-error?phase=${phase}&id=${id}`)
      const document = await response?.text()
      expect(document).not.toContain(marker)
      expect(JSON.stringify(response?.headers())).not.toContain(marker)
      expect(response?.status()).toBe(
        phase === 'ssr' && failure !== 'success'
          ? HTTP_INTERNAL_SERVER_ERROR
          : HTTP_OK
      )
      if (phase === 'stream') expect(document).toContain('Carregando dados...')
      if (phase === 'action') {
        await page.getByRole('button', { name: 'Consultar backend' }).click()
      }
      const content =
        failure === 'success'
          ? page.getByText('Backend recuperado', { exact: true })
          : page.getByRole('heading', { name: 'Algo deu errado!' })
      await expect(content).toBeVisible()
      expect(await page.content()).not.toContain(marker)
      if (phase === 'action') {
        expect(serverResponses).toHaveLength(1)
        expect(serverResponses[0]?.status).toBe(
          failure === 'success' ? HTTP_OK : HTTP_INTERNAL_SERVER_ERROR
        )
      }
      expect(JSON.stringify(serverResponses)).not.toContain(marker)
      expect(browserErrors.join(' ')).not.toContain(marker)
      // A hidratação tolera somente a repetição da mensagem pública fixa.
      expect(
        browserErrors.filter(
          message =>
            phase === 'action' ||
            message !== 'Não foi possível concluir a solicitação.'
        )
      ).toStrictEqual([])
    })
  }
}
