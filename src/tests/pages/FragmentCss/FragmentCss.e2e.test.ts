import { expect, test } from '@playwright/test'

import { watchCspViolations } from '@/tests/helpers/watchCspViolations/index.ts'

const HTTP_OK = 200
const PAGE_URL = '/fragment-css'
// Link de CSS que o runtime grava no fragmento em streaming, com os handlers
// inline que liberam o fragmento quando a folha carrega.
const FRAGMENT_STYLESHEET =
  /<link rel="stylesheet" href="\/assets\/[^"]+\.css"[^>]*\sonload="\$dfc\('[^']+'\)"/u

// Garante que a fixture percorre o caminho do limite: a CSS do componente
// lazy chega no fragmento, depois do shell, e não no <head>.
test('anuncia a CSS do componente lazy no fragmento, fora do head', async ({
  request
}) => {
  const response = await request.get(PAGE_URL, {
    headers: { accept: 'text/html' }
  })
  expect(response.status()).toBe(HTTP_OK)
  const html = await response.text()
  const headEnd = html.indexOf('</head>')

  expect(headEnd).toBeGreaterThan(0)
  expect(html.slice(0, headEnd)).not.toMatch(FRAGMENT_STYLESHEET)
  expect(html.slice(headEnd)).toMatch(FRAGMENT_STYLESHEET)
})

// Limite do @solidjs/web (sink.fragment em dist/server.js): o <link> da CSS
// do fragmento usa onload e onerror inline, que não aceitam nonce, e a CSP
// com 'strict-dynamic' os bloqueia (solidjs/solid#3747). test.fail() registra o
// limite; quando o runtime liberar o fragmento por um script com nonce, o teste
// passa a falhar e o marcador deve sair. A correção proposta em
// solidjs/solid#3755 também grava o template antes dos links: hoje uma folha
// em cache pode carregar antes dele e a troca é descartada.
test('carrega a CSS do fragmento sem violação de CSP', async ({ page }) => {
  test.fail()
  const violations = await watchCspViolations(page)

  const response = await page.goto(PAGE_URL)
  expect(response?.status()).toBe(HTTP_OK)
  // O load do documento espera a folha do fragmento, cujo evento dispara o
  // handler inline.
  await page.waitForLoadState('load')

  expect(violations).toStrictEqual([])
})
