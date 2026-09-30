import { expect, test, type APIRequestContext } from '@playwright/test'

import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { watchCspViolations } from '@/tests/helpers/watchCspViolations/index.ts'

const HTTP_OK = 200
// Script inline do tema, HydrationScript e entrada do cliente; os scripts de
// dados do runtime vêm além deles.
const DOCUMENT_SCRIPTS = 3
const NONCE_FORMAT = /^[A-Za-z0-9+/]{22}==$/u
const SCRIPT_SRC = /^script-src 'nonce-(?<nonce>[^']+)' 'strict-dynamic'$/u

type CspDocument = { nonce: string; html: string }

function directives(policy: string): string[] {
  return policy.split('; ')
}

// Lê o documento bruto: depois que a CSP vale, o Chromium esconde o atributo
// nonce do DOM, então a conferência dos scripts é feita no HTML recebido.
async function readCspDocument(
  request: APIRequestContext
): Promise<CspDocument> {
  const response = await request.get('/', { headers: { accept: 'text/html' } })
  expect(response.status()).toBe(HTTP_OK)
  const policy = response.headers()['content-security-policy'] ?? ''
  const scriptSrc = directives(policy).find(directive =>
    directive.startsWith('script-src ')
  )
  const nonce = SCRIPT_SRC.exec(scriptSrc ?? '')?.groups?.nonce
  if (!nonce) throw new Error('A CSP da Home não trouxe o nonce dos scripts')
  return { nonce, html: await response.text() }
}

test.describe('CSP com nonce na entrada de produção', () => {
  test('grava o nonce da CSP em todos os scripts e modulepreload do HTML', async ({
    request
  }) => {
    const { nonce, html } = await readCspDocument(request)
    const scripts = html.match(/<script\b[^>]*>/gu) ?? []
    const preloads = html.match(/<link\b[^>]*rel="modulepreload"[^>]*>/gu) ?? []

    expect(scripts.length).toBeGreaterThanOrEqual(DOCUMENT_SCRIPTS)
    expect(preloads.length).toBeGreaterThan(0)
    for (const tag of [...scripts, ...preloads]) {
      expect(tag).toContain(`nonce="${nonce}"`)
    }
    // O caminho literal do Document vira o asset com hash no build.
    expect(html).toMatch(/<script type="module" src="\/assets\/[^"]+\.js"/u)
    // Handlers em atributos on*= não aceitam nonce e seriam bloqueados.
    expect(html).not.toMatch(/<[a-z][^>]*\son[a-z]+=/iu)
  })

  test('troca o nonce a cada requisição', async ({ request }) => {
    const first = await readCspDocument(request)
    const second = await readCspDocument(request)

    expect(first.nonce).toMatch(NONCE_FORMAT)
    expect(second.nonce).toMatch(NONCE_FORMAT)
    expect(second.nonce).not.toBe(first.nonce)
  })

  test('mantém as demais diretivas, sem unsafe-inline em scripts', async ({
    request
  }) => {
    const response = await request.get('/')
    const policy = directives(
      response.headers()['content-security-policy'] ?? ''
    )

    expect(policy.filter(directive => SCRIPT_SRC.test(directive))).toHaveLength(
      1
    )
    expect(
      policy.filter(directive => !directive.startsWith('script-src '))
    ).toStrictEqual([
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ])
  })

  test('hidrata a Home sem violação de CSP', async ({ page }) => {
    const errors: string[] = []
    const violations = await watchCspViolations(page)
    page.on('pageerror', error => {
      errors.push(error.message)
    })

    const response = await page.goto('/')
    expect(response?.status()).toBe(HTTP_OK)
    await expect.poll(async () => hydrationFinished(page)).toBe(true)
    // O menu de tema só abre com o JavaScript hidratado.
    await page.getByRole('button', { name: 'Selecionar tema' }).click()
    await expect(page.getByRole('menu')).toBeVisible()

    expect(violations).toStrictEqual([])
    expect(errors).toStrictEqual([])
  })
})
