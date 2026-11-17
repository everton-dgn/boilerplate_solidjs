import { readdir, readFile } from 'node:fs/promises'

import type { Page } from '@playwright/test'

import {
  markBackendRecovered,
  readBackendState,
  releaseFixtureGate,
  waitForGate
} from '@/tests/helpers/fixtureGate/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

test.use({ locale: 'pt-BR' })

const HTTP_OK = 200
const HTTP_FOUND = 302
const HTTP_INTERNAL_SERVER_ERROR = 500
const ATTEMPTS_AFTER_RETRY = 2
// The public message follows the locale of the request; the browser, with pt-BR,
// opens the page and calls the server functions in pt.
const PUBLIC_MESSAGE = 'Não foi possível concluir a solicitação.'
type ServerResponse = {
  body: string
  headers: Record<string, string>
  status: number
}

async function captureServerFunctions(page: Page): Promise<ServerResponse[]> {
  const responses: ServerResponse[] = []
  // The decoder cancels the HTTP stream when it receives the exception. We capture
  // the real body before handing it to the browser, without replacing data or status.
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

test('the client bundle does not include the server implementation', async () => {
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
    expect(source).not.toContain('[server-error]')
    expect(source).not.toContain('127.0.0.1:4318')
  }
})

test('a redirect thrown by a server function in the SSR still redirects', async ({
  page,
  request
}) => {
  const response = await request.get('/pt/control-signal', { maxRedirects: 0 })
  expect(response.status()).toBe(HTTP_FOUND)
  expect(response.headers().location).toBe('/pt?from=control-signal')
  await page.goto('/control-signal')
  await expect(page).toHaveURL(/\/pt\?from=control-signal$/u)
})

test('an envelope returned by a server function in the SSR delivers the value', async ({
  request
}) => {
  const response = await request.get('/control-signal?kind=envelope-return')
  expect(response.status()).toBe(HTTP_OK)
  // The rendered paragraph, not only the value serialized for the hydration.
  expect(await response.text()).toMatch(/<p[^>]*>Returned envelope<\/p>/u)
})

// @solidjs/router regression (https://github.com/solidjs/solid-router/issues/633):
// query() no longer copies the body headers of the envelope, such as content-type,
// to the page.
for (const kind of ['envelope-return', 'envelope-throw']) {
  test(`the document with ${kind} through query in the SSR is still HTML`, async ({
    request
  }) => {
    const response = await request.get(
      `/control-signal?kind=${kind}&id=throw:${crypto.randomUUID()}`
    )
    expect(response.headers()['content-type']).toBe('text/html; charset=utf-8')
  })
}

// The hook receives the thrown envelope as a control; the router then throws the
// value of the envelope in the render, which becomes a render failure with or
// without the hook. The test checks the raw response, outside the browser.
test('an envelope thrown by a server function in the SSR becomes a render failure without exposing the value', async ({
  request
}) => {
  const id = `throw:${crypto.randomUUID()}`
  const { marker } = await readBackendState({ request, id })
  const response = await request.get(
    `/control-signal?kind=envelope-throw&id=${id}`
  )
  const document = await response.text()
  expect(response.status()).toBe(HTTP_INTERNAL_SERVER_ERROR)
  expect(document).not.toContain(marker)
  expect(response.headers()['content-language']).toBe('en')
  expect(document).toContain('Something went wrong!')
  // Positive control: the server function read the marker before throwing.
  const after = await readBackendState({ request, id })
  expect(after.attempts).toBe(1)
})

for (const { phase, javaScriptEnabled } of SCENARIOS) {
  test.describe(`backend error: ${phase}, JavaScript ${javaScriptEnabled ? 'enabled' : 'disabled'}`, () => {
    test.use({ javaScriptEnabled })

    test('reloads the page with a failure and after the backend comes back', async ({
      page,
      request,
      pageErrors
    }) => {
      const id = crypto.randomUUID()
      const { marker: privateMarker } = await readBackendState({ request, id })
      const serverResponses = await captureServerFunctions(page)

      const response = await page.goto(`/backend-error?phase=${phase}&id=${id}`)
      expect(await response?.text()).not.toContain(privateMarker)
      expect(JSON.stringify(response?.headers())).not.toContain(privateMarker)
      const pageUrl = page.url()
      expect(response?.status()).toBe(
        phase === 'ssr' ? HTTP_INTERNAL_SERVER_ERROR : HTTP_OK
      )
      if (phase === 'action') {
        await expect(page.getByText('Ready to read')).toBeVisible()
        await page.getByRole('button', { name: 'Query backend' }).click()
      }

      await expect(
        page.getByRole('heading', { name: 'Algo deu errado!' })
      ).toBeVisible()
      await expect(page.locator('header')).toHaveCount(0)

      // A full navigation must work without hydration or query invalidation.
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
        await expect(page.getByText('Ready to read')).toBeVisible()
        await page.getByRole('button', { name: 'Query backend' }).click()
      }
      await expect
        .poll(async () => {
          const state = await readBackendState({ request, id })
          return state.attempts
        })
        .toBe(ATTEMPTS_AFTER_RETRY)
      await expect(
        page.getByRole('heading', { name: 'Algo deu errado!' })
      ).toBeVisible()

      // The public exception can repeat when hydrating the fallback, in the
      // initial payload and in the stream. When upgrading the runtime, reproduce it
      // with Emulation.setCPUThrottlingRate at 20x and remove this exception if the
      // error no longer reaches the browser.
      const rendersOnServer = phase !== 'action'
      expect(
        pageErrors.filter(
          message => !rendersOnServer || message !== PUBLIC_MESSAGE
        )
      ).toStrictEqual([])
      pageErrors.length = 0

      await markBackendRecovered({ request, id })
      const recoveryResponse = page.waitForResponse(candidate =>
        candidate.request().isNavigationRequest()
      )
      await page.getByRole('link', { name: 'Recarregar página' }).click()
      const recoveredReload = await recoveryResponse
      expect(await recoveredReload.text()).not.toContain(privateMarker)
      expect(recoveredReload.status()).toBe(HTTP_OK)
      if (phase === 'action') {
        await expect(page.getByText('Ready to read')).toBeVisible()
        await page.getByRole('button', { name: 'Query backend' }).click()
      }
      await expect(
        page.getByText('Backend recovered', { exact: true })
      ).toBeVisible()
      await expect(page.locator('[data-error-variant="runtime"]')).toHaveCount(
        0
      )
      expect(pageErrors).toStrictEqual([])
      if (phase === 'action') {
        expect(serverResponses).toHaveLength(ATTEMPTS_AFTER_RETRY + 1)
      }
      expect(JSON.stringify(serverResponses)).not.toContain(privateMarker)
    })
  })
}

for (const phase of ['ssr', 'stream', 'action']) {
  for (const failure of ['http', 'throw', 'result', 'public', 'success']) {
    test(`confidentiality: ${phase}, ${failure}`, async ({
      page,
      request,
      pageErrors
    }) => {
      // In streaming, the backend holds /data until the test sees the fallback. A
      // response before the shell would embed the content in the document.
      const isStream = phase === 'stream'
      const id = `${failure}:${crypto.randomUUID()}${isStream ? ':gated' : ''}`
      const { marker } = await readBackendState({ request, id })
      const serverResponses = await captureServerFunctions(page)
      const response = await page.goto(
        `/backend-error?phase=${phase}&id=${id}`,
        { waitUntil: isStream ? 'commit' : 'load' }
      )
      if (isStream) {
        await expect(
          page.getByText('Loading data...', { exact: true })
        ).toBeVisible()
        await waitForGate({ request, id })
        await releaseFixtureGate({ request, id })
      }
      // Read only after the release: the body ends when /data answers.
      const document = await response?.text()
      expect(document).not.toContain(marker)
      expect(JSON.stringify(response?.headers())).not.toContain(marker)
      expect(response?.status()).toBe(
        phase === 'ssr' && failure !== 'success'
          ? HTTP_INTERNAL_SERVER_ERROR
          : HTTP_OK
      )
      if (isStream) expect(document).toContain('Loading data...')
      if (phase === 'action') {
        await page.getByRole('button', { name: 'Query backend' }).click()
      }
      const content =
        failure === 'success'
          ? page.getByText('Backend recovered', { exact: true })
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
      expect(pageErrors.join(' ')).not.toContain(marker)
      // The hydration only tolerates the repetition of the fixed public message.
      expect(
        pageErrors.filter(
          message => phase === 'action' || message !== PUBLIC_MESSAGE
        )
      ).toStrictEqual([])
    })
  }
}
