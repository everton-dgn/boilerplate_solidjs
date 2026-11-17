import {
  readGatedBody,
  releaseFixtureGate
} from '@/tests/helpers/fixtureGate/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

const HTTP_OK = 200
// A server that stops emitting bytes fails on the read, not on the generic
// timeout of the runner.
const REQUEST_TIMEOUT = 15_000
const PAGE_URL = '/pt/late-redirect'
const LOADING_TEXT = 'Loading...'
const LATE_REDIRECT_SCRIPT =
  /<script nonce="(?<nonce>[^"]+)">window\.location="\/pt\?from=late-redirect"<\/script>/u

// After the shell the status already went out, and the runtime follows the
// Location through a script at the end of the document. It needs the CSP nonce of
// the response.
test('the redirect script after the shell carries the CSP nonce', async ({
  request,
  baseURL
}) => {
  if (!baseURL) throw new Error('baseURL is required')
  const id = `late-redirect:${crypto.randomUUID()}`
  const response = await fetch(`${baseURL}${PAGE_URL}?id=${id}`, {
    headers: { accept: 'text/html' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  })
  const body = await readGatedBody({
    request,
    id,
    response,
    shellText: LOADING_TEXT
  })
  expect(response.status).toBe(HTTP_OK)
  const nonce = LATE_REDIRECT_SCRIPT.exec(body)?.groups?.nonce
  expect(nonce).toBeDefined()
  expect(response.headers.get('content-security-policy')).toContain(
    `'nonce-${nonce}'`
  )
})

test('the browser follows the redirect after the shell without a CSP violation', async ({
  page,
  request,
  cspViolations
}) => {
  const id = `late-redirect:${crypto.randomUUID()}`

  await page.goto(`${PAGE_URL}?id=${id}`, { waitUntil: 'commit' })
  await expect(page.getByText(LOADING_TEXT, { exact: true })).toBeVisible()
  await releaseFixtureGate({ request, id })
  await expect(page).toHaveURL(/\/pt\?from=late-redirect$/u)

  expect(cspViolations).toStrictEqual([])
})
