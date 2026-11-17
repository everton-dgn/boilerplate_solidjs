import type { APIRequestContext } from '@playwright/test'

import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

test.use({ locale: 'pt-BR' })

const HTTP_OK = 200
// Inline theme script, HydrationScript and the client entry; the data scripts of
// the runtime come on top of them.
const DOCUMENT_SCRIPTS = 3
const NONCE_FORMAT = /^[A-Za-z0-9+/]{22}==$/u
const SCRIPT_SRC = /^script-src 'nonce-(?<nonce>[^']+)' 'strict-dynamic'$/u
const HTML_TAG = /<html\b[^>]*>/u
const THEME_KEY = 'app-theme'

type CspDocument = { nonce: string; html: string }

function directives(policy: string): string[] {
  return policy.split('; ')
}

// Reads the raw document: once the CSP applies, Chromium hides the nonce
// attribute from the DOM, so the scripts are checked in the received HTML.
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
  if (!nonce) throw new Error('The Home CSP did not carry the script nonce')
  return { nonce, html: await response.text() }
}

test.describe('CSP with a nonce on the production entry', () => {
  test('writes the CSP nonce on every script and modulepreload of the HTML', async ({
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
    // The literal path of Document becomes the hashed asset in the build.
    expect(html).toMatch(/<script type="module" src="\/assets\/[^"]+\.js"/u)
    // Handlers in on*= attributes do not accept a nonce and would be blocked.
    expect(html).not.toMatch(/<[a-z][^>]*\son[a-z]+=/iu)
  })

  test('changes the nonce on each request', async ({ request }) => {
    const first = await readCspDocument(request)
    const second = await readCspDocument(request)

    expect(first.nonce).toMatch(NONCE_FORMAT)
    expect(second.nonce).toMatch(NONCE_FORMAT)
    expect(second.nonce).not.toBe(first.nonce)
  })

  test('keeps the other directives, without unsafe-inline in scripts and styles', async ({
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
      "style-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ])
  })

  test('hydrates the Home without a CSP violation', async ({
    page,
    pageErrors,
    cspViolations
  }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(HTTP_OK)
    await expect.poll(async () => hydrationFinished(page)).toBe(true)
    // The theme menu only opens with hydrated JavaScript.
    await page.getByRole('button', { name: 'Selecionar tema' }).click()
    await expect(page.getByRole('menu')).toBeVisible()

    expect(cspViolations).toStrictEqual([])
    expect(pageErrors).toStrictEqual([])
  })

  // Without 'unsafe-inline' in style-src, a style attribute in the HTML is blocked.
  // The cookie theme reaches <html> only through the class, and color-scheme comes
  // from the .light/.dark rules of colors.css.
  for (const theme of ['dark', 'light'] as const) {
    test(`applies the ${theme} theme of the cookie in the SSR without a CSP violation`, async ({
      page,
      context,
      baseURL,
      pageErrors,
      cspViolations
    }) => {
      if (!baseURL) throw new Error('Missing test base URL')
      await context.addCookies([
        { name: THEME_KEY, value: theme, url: baseURL }
      ])
      // With the system on the opposite theme, the class can only come from the cookie.
      await page.emulateMedia({
        colorScheme: theme === 'dark' ? 'light' : 'dark'
      })

      const response = await page.goto('/')
      expect(response?.status()).toBe(HTTP_OK)
      const root = HTML_TAG.exec((await response?.text()) ?? '')?.[0]
      expect(root).toContain(`class="${theme}"`)
      expect(root).not.toContain('style=')
      await expect.poll(async () => hydrationFinished(page)).toBe(true)
      await expect(page.locator('html')).toHaveClass(theme)
      await expect(page.locator('html')).toHaveCSS('color-scheme', theme)

      expect(cspViolations).toStrictEqual([])
      expect(pageErrors).toStrictEqual([])
    })
  }
})
