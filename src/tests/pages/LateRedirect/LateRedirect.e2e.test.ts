import {
  readGatedBody,
  releaseFixtureGate
} from '@/tests/helpers/fixtureGate/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

const HTTP_OK = 200
// Um servidor que pare de emitir bytes falha na leitura, e não no timeout
// genérico do runner.
const REQUEST_TIMEOUT = 15_000
const PAGE_URL = '/pt/late-redirect'
const LOADING_TEXT = 'Carregando...'
const LATE_REDIRECT_SCRIPT =
  /<script nonce="(?<nonce>[^"]+)">window\.location="\/pt\?from=late-redirect"<\/script>/u

// Depois do shell o status já saiu, e o runtime segue o Location por um
// script no fim do documento. Ele precisa do nonce da CSP da resposta.
test('o script do redirect depois do shell leva o nonce da CSP', async ({
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

test('o navegador segue o redirect depois do shell sem violação de CSP', async ({
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
