import { readFile } from 'node:fs/promises'
import { env } from 'node:process'

import type { APIRequestContext } from '@playwright/test'

import {
  readBackendState,
  readGatedBody,
  releaseFixtureGate,
  waitForGate
} from '@/tests/helpers/fixtureGate/index.ts'
import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

test.use({ locale: 'pt-BR' })

const HTTP_OK = 200
const HTTP_INTERNAL_SERVER_ERROR = 500
// A server that stops emitting bytes fails on the read, not on the generic
// timeout of the runner.
const REQUEST_TIMEOUT = 15_000
const LOADING_TEXT = 'Loading fixture...'
// The public message follows the locale of the request. The Node fetch does not
// ask for a supported locale and gets the base locale; the browser, with pt-BR,
// opens the page in pt.
const PUBLIC_MESSAGE = 'The request could not be completed.'
const PAGE_PUBLIC_MESSAGE = 'Não foi possível concluir a solicitação.'
// Messages that the browser can throw when hydrating, depending on the order
// between the hydration and the arrival of the rejected fragment: the list
// accepts each one without requiring it. The rejection of the async source is
// serialized with the default policy of the runtime before any hook; the boundary
// fragment carries the public message defined by the hook.
const RUNTIME_MESSAGE = 'Internal Server Error'
const MIDDLEWARE_LOG =
  '[middleware] Unexpected failure; private details omitted'
const SERVER_ERROR_LOG =
  '[server-error] Unexpected failure; private details omitted'

type Gate = 'none' | 'before' | 'stream'
type FixtureCase = {
  name: string
  gate: Gate
  status: number
  content: string
  pageErrors: string[]
}
type RawRequest = {
  request: APIRequestContext
  id: string
  baseURL: string
  fixture: FixtureCase
}
type RawResponse = { body: string; headers: string; status: number }
type LogCount = { file: string; message: string }

const CASES: FixtureCase[] = [
  {
    name: 'render-local',
    gate: 'none',
    status: HTTP_OK,
    content: 'Contained failure',
    pageErrors: []
  },
  {
    name: 'render-root',
    gate: 'none',
    status: HTTP_INTERNAL_SERVER_ERROR,
    content: 'Algo deu errado!',
    pageErrors: []
  },
  {
    name: 'render-stream',
    gate: 'stream',
    status: HTTP_OK,
    content: 'Algo deu errado!',
    pageErrors: [PAGE_PUBLIC_MESSAGE]
  },
  {
    name: 'async-ssr',
    gate: 'before',
    status: HTTP_INTERNAL_SERVER_ERROR,
    content: 'Algo deu errado!',
    pageErrors: [RUNTIME_MESSAGE]
  },
  {
    name: 'async-direct',
    gate: 'stream',
    status: HTTP_OK,
    content: 'Algo deu errado!',
    pageErrors: [RUNTIME_MESSAGE, PAGE_PUBLIC_MESSAGE]
  },
  {
    name: 'async-element',
    gate: 'stream',
    status: HTTP_OK,
    content: 'Algo deu errado!',
    pageErrors: [RUNTIME_MESSAGE, PAGE_PUBLIC_MESSAGE]
  }
]

// Reads the raw document outside the browser. In streaming, the failure is only
// released after the fixture reached the async source.
async function readRawDocument({
  request,
  id,
  baseURL,
  fixture
}: RawRequest): Promise<RawResponse> {
  if (fixture.gate === 'before') await releaseFixtureGate({ request, id })
  const response = await fetch(
    `${baseURL}/outside-error?case=${fixture.name}&id=${id}`,
    { signal: AbortSignal.timeout(REQUEST_TIMEOUT) }
  )
  const body =
    fixture.gate === 'stream'
      ? await readGatedBody({
          request,
          id,
          response,
          shellText: LOADING_TEXT,
          shouldWaitForGate: true
        })
      : await response.text()
  return {
    body,
    headers: JSON.stringify(Object.fromEntries(response.headers)),
    status: response.status
  }
}

// The server-logs project runs this file alone and in order, after the others
// (tooling/playwright.ts): no other request writes lines during a count.
async function countLogLines({ file, message }: LogCount): Promise<number> {
  const log = await readFile(file, 'utf8')
  return log.split('\n').filter(line => line.includes(message)).length
}

for (const fixture of CASES) {
  test.describe(`error outside a server function: ${fixture.name}`, () => {
    test('the raw document does not carry the marker', async ({
      request,
      baseURL
    }) => {
      if (!baseURL) throw new Error('baseURL is required')
      const id = `outside:${crypto.randomUUID()}`
      const { marker } = await readBackendState({ request, id })
      // The throw in the root render goes through the production error hook,
      // which writes one fixed [server-error] line per request.
      const logFile =
        fixture.name === 'render-root' ? env.SERVER_LOG_FILE : undefined
      if (fixture.name === 'render-root' && !logFile) {
        throw new Error('E2E environment is incomplete')
      }
      const hookLogBefore = logFile
        ? await countLogLines({ file: logFile, message: SERVER_ERROR_LOG })
        : 0

      const raw = await readRawDocument({ request, id, baseURL, fixture })

      if (logFile) {
        await expect
          .poll(async () =>
            countLogLines({ file: logFile, message: SERVER_ERROR_LOG })
          )
          .toBe(hookLogBefore + 1)
      }

      expect(raw.status).toBe(fixture.status)
      expect(raw.body).not.toContain(marker)
      // The error hook replaces the error that the boundary serializes with the
      // public message. The async source still carries the runtime message.
      expect(raw.body).toContain(PUBLIC_MESSAGE)
      expect(raw.headers).not.toContain(marker)
      // Positive controls: the fixture received the marker, threw with it and,
      // in the cases with a gate, only failed after the release. Without
      // streaming the record comes back in a header; with a gate, through the
      // synthetic backend.
      expect(raw.headers).toContain('"x-fixture-marker":"loaded"')
      const state = await readBackendState({ request, id })
      expect(state.attempts).toBe(1)
      expect(state.gate).toBe(fixture.gate === 'none' ? 'none' : 'released')
      if (fixture.gate === 'none') {
        expect(raw.headers).toContain('"x-fixture-thrown":"real"')
      } else {
        expect(state.real).toBe(true)
      }
      if (fixture.gate === 'stream') expect(raw.body).toContain(LOADING_TEXT)
    })

    test('the browser shows the fallback without the marker', async ({
      page,
      request,
      pageErrors
    }) => {
      const id = `outside:${crypto.randomUUID()}`
      const { marker } = await readBackendState({ request, id })
      if (fixture.gate === 'before') await releaseFixtureGate({ request, id })

      const response = await page.goto(
        `/outside-error?case=${fixture.name}&id=${id}`,
        { waitUntil: fixture.gate === 'stream' ? 'commit' : 'load' }
      )
      if (fixture.gate === 'stream') {
        await expect(page.getByText(LOADING_TEXT)).toBeVisible()
        await waitForGate({ request, id })
        await releaseFixtureGate({ request, id })
      }

      await expect(page.getByText(fixture.content)).toBeVisible()
      expect(await page.content()).not.toContain(marker)
      expect(pageErrors.join(' ')).not.toContain(marker)
      expect(
        pageErrors.filter(message => !fixture.pageErrors.includes(message))
      ).toStrictEqual([])
      const state = await readBackendState({ request, id })
      if (fixture.gate === 'none') {
        expect(response?.headers()['x-fixture-thrown']).toBe('real')
      } else {
        expect(state.real).toBe(true)
      }
    })
  })
}

// hasErrorPage: the navigation gets the error page of the app. After next() the
// render already happened and the plugin does not allow another one, so the
// response is the text 500, as outside a navigation.
type MiddlewareCase = {
  phase: 'before' | 'after'
  isNavigation: boolean
  hasErrorPage: boolean
}

const MIDDLEWARE_CASES: MiddlewareCase[] = [
  { phase: 'before', isNavigation: true, hasErrorPage: true },
  { phase: 'after', isNavigation: true, hasErrorPage: false },
  { phase: 'before', isNavigation: false, hasErrorPage: false }
]

test.describe('middleware exceptions', () => {
  for (const { phase, isNavigation, hasErrorPage } of MIDDLEWARE_CASES) {
    test(`exception ${phase === 'before' ? 'before' : 'after'} next() ${isNavigation ? 'in a navigation' : 'outside a navigation'} ${hasErrorPage ? 'shows the error page' : 'becomes a text 500'}`, async ({
      request,
      baseURL
    }) => {
      const logFile = env.SERVER_LOG_FILE
      if (!baseURL || !logFile) throw new Error('E2E environment is incomplete')
      const id = `outside:${crypto.randomUUID()}`
      const { marker } = await readBackendState({ request, id })
      const logBefore = await countLogLines({
        file: logFile,
        message: MIDDLEWARE_LOG
      })

      const response = await fetch(
        `${baseURL}/outside-error?case=middleware-${phase}&id=${id}`,
        { headers: { accept: isNavigation ? 'text/html' : 'application/json' } }
      )
      const body = await response.text()

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      if (hasErrorPage) {
        expect(response.headers.get('content-type')).toContain('text/html')
        expect(response.headers.get('content-language')).toBe('en')
        expect(body).toContain('Something went wrong!')
      } else {
        expect(body).toBe(PUBLIC_MESSAGE)
      }
      expect(body).not.toContain(marker)
      expect(
        JSON.stringify(Object.fromEntries(response.headers))
      ).not.toContain(marker)
      // Positive control: the fixture threw with the loaded marker.
      const state = await readBackendState({ request, id })
      expect(state.attempts).toBe(1)
      expect(state.real).toBe(true)
      // One fixed middleware line per request. The global teardown refuses the
      // marker in the whole file after the suite.
      await expect
        .poll(async () =>
          countLogLines({ file: logFile, message: MIDDLEWARE_LOG })
        )
        .toBe(logBefore + 1)
    })
  }

  // The error render would call the plugin dispatcher, which runs server
  // functions and answers API routes with its own body.
  for (const path of ['/robots.txt', '/_server/fixture']) {
    test(`exception before next() on ${path} becomes a text 500 even with an HTML accept`, async ({
      request,
      baseURL
    }) => {
      if (!baseURL) throw new Error('baseURL is required')
      const id = `outside:${crypto.randomUUID()}`

      const response = await fetch(
        `${baseURL}${path}?case=middleware-before&id=${id}`,
        { headers: { accept: 'text/html' } }
      )

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
      await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
      const state = await readBackendState({ request, id })
      expect(state.real).toBe(true)
    })
  }

  test('the middleware error page hydrates in the browser', async ({
    page,
    request,
    pageErrors
  }) => {
    const id = `outside:${crypto.randomUUID()}`
    const { marker } = await readBackendState({ request, id })

    const response = await page.goto(
      `/outside-error?case=middleware-before&id=${id}`
    )

    expect(response?.status()).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(
      page.getByRole('link', { name: 'Recarregar página' })
    ).toBeVisible()
    await expect.poll(async () => hydrationFinished(page)).toBe(true)
    expect(await page.content()).not.toContain(marker)
    // Only the public message can show up again when hydrating the fallback.
    expect(
      pageErrors.filter(message => message !== PAGE_PUBLIC_MESSAGE)
    ).toStrictEqual([])
  })
})
