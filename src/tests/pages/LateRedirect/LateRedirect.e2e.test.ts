import { expect, test } from '@playwright/test'

import { watchCspViolations } from '@/tests/helpers/watchCspViolations/index.ts'

const HTTP_OK = 200
const PAGE_URL = '/pt/late-redirect'
const LATE_REDIRECT_SCRIPT =
  /<script nonce="(?<nonce>[^"]+)">window\.location="\/pt\?from=late-redirect"<\/script>/u

// Depois do shell o status já saiu, e o runtime segue o Location por um
// script no fim do documento. Ele precisa do nonce da CSP da resposta.
test('o script do redirect depois do shell leva o nonce da CSP', async ({
  request
}) => {
  const response = await request.get(PAGE_URL, {
    headers: { accept: 'text/html' }
  })
  expect(response.status()).toBe(HTTP_OK)
  const nonce = LATE_REDIRECT_SCRIPT.exec(await response.text())?.groups?.nonce
  expect(nonce).toBeDefined()
  expect(response.headers()['content-security-policy']).toContain(
    `'nonce-${nonce}'`
  )
})

test('o navegador segue o redirect depois do shell sem violação de CSP', async ({
  page
}) => {
  const violations = await watchCspViolations(page)

  await page.goto(PAGE_URL)
  await expect(page).toHaveURL(/\/pt\?from=late-redirect$/u)

  expect(violations).toStrictEqual([])
})
