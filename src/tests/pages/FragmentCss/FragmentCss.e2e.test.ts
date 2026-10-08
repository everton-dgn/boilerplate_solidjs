import { once } from 'node:events'
import { createServer, request as proxyRequest, type Server } from 'node:http'

import { expect, test, type Page } from '@playwright/test'

import { watchCspViolations } from '@/tests/helpers/watchCspViolations/index.ts'

const HTTP_OK = 200
const HTTP_BAD_GATEWAY = 502
const PAGE_URL = '/fragment-css'
const PANEL_TEXT = 'Painel com CSS própria'
// A ordem dos atributos não faz parte do contrato do runtime.
const FRAGMENT_STYLESHEET =
  /<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="(?<href>\/assets\/[^"]+\.css)")[^>]*>/gu
const FRAGMENT_KEY = /\bdata-dfc="(?<key>[^"]+)"/u
const SCRIPT_NONCE = /script-src 'nonce-(?<nonce>[^']+)' 'strict-dynamic'/u

// O preview revalida os assets entre documentos. Este proxy preserva o
// streaming, o status e os cabeçalhos, mudando só o cache das folhas CSS para
// exercitar o carregamento imediato que ocorre com assets cacheáveis no host.
async function startCachingProxy(target: string): Promise<Server> {
  const server = createServer((incoming, outgoing) => {
    const url = new URL(incoming.url ?? '/', target)
    const upstream = proxyRequest(
      url,
      { method: incoming.method, headers: incoming.headers },
      response => {
        const headers = { ...response.headers }
        if (
          url.pathname.startsWith('/assets/') &&
          url.pathname.endsWith('.css')
        ) {
          headers['cache-control'] = 'public, max-age=3600, immutable'
        }
        outgoing.writeHead(response.statusCode ?? HTTP_BAD_GATEWAY, headers)
        response.on('error', () => {
          outgoing.destroy()
        })
        response.pipe(outgoing)
      }
    )
    upstream.on('error', () => {
      outgoing.destroy()
    })
    outgoing.on('close', () => {
      upstream.destroy()
    })
    incoming.pipe(upstream)
  })
  const listening = once(server, 'listening')
  server.listen(0, '127.0.0.1')
  await listening
  return server
}

async function stopCachingProxy(server: Server): Promise<void> {
  const closed = once(server, 'close')
  server.close()
  server.closeAllConnections()
  await closed
}

function readFragmentStylesheets(html: string): RegExpMatchArray[] {
  const headEnd = html.indexOf('</head>')
  expect(headEnd).toBeGreaterThan(0)
  const stylesheets = [...html.matchAll(FRAGMENT_STYLESHEET)].filter(
    stylesheet => stylesheet.index > headEnd
  )
  expect(stylesheets.length).toBeGreaterThan(0)
  for (const stylesheet of stylesheets) {
    expect(html.slice(0, headEnd)).not.toContain(stylesheet.groups?.href)
  }
  return stylesheets
}

async function expectStyledPanel(page: Page): Promise<void> {
  await expect(page.getByText(PANEL_TEXT, { exact: true })).toBeVisible()
  await expect(page.getByText(PANEL_TEXT, { exact: true })).toHaveCSS(
    'padding-block-start',
    '8px'
  )
  await expect(
    page.getByText('Carregando fragmento...', { exact: true })
  ).not.toBeVisible()
}

// O template deve existir antes de uma folha em cache disparar o evento load.
test('envia o template antes da CSS do fragmento, sem handlers inline', async ({
  request
}) => {
  const response = await request.get(PAGE_URL, {
    headers: { accept: 'text/html' }
  })
  expect(response.status()).toBe(HTTP_OK)
  const html = await response.text()
  const stylesheets = readFragmentStylesheets(html)

  for (const stylesheet of stylesheets) {
    const key = FRAGMENT_KEY.exec(stylesheet[0])?.groups?.key
    expect(key).toBeDefined()
    const templateStart = html.indexOf(`<template id="${key}">`)
    const templateEnd = html.indexOf('</template>', templateStart)
    expect(templateStart).toBeGreaterThan(html.indexOf('</head>'))
    expect(templateEnd).toBeGreaterThan(templateStart)
    expect(templateEnd).toBeLessThan(stylesheet.index ?? 0)
  }
  expect(html).not.toMatch(/<[a-z][^>]*\son[a-z]+=/iu)

  const policy = response.headers()['content-security-policy'] ?? ''
  const nonce = SCRIPT_NONCE.exec(policy)?.groups?.nonce
  expect(nonce).toBeDefined()
  const scripts = html.match(/<script\b[^>]*>/gu) ?? []
  expect(scripts.length).toBeGreaterThan(0)
  for (const script of scripts) {
    expect(script).toContain(`nonce="${nonce}"`)
  }
})

test('revela o painel com CSS nova e em cache, sem violação de CSP', async ({
  page,
  baseURL
}) => {
  if (!baseURL) throw new Error('Missing test base URL')
  const server = await startCachingProxy(baseURL)
  try {
    const address = server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('Missing caching proxy address')
    }
    const url = `http://127.0.0.1:${address.port}${PAGE_URL}`
    const errors: string[] = []
    const violations = await watchCspViolations(page)
    page.on('pageerror', error => {
      errors.push(error.message)
    })

    const response = await page.goto(url)
    expect(response?.status()).toBe(HTTP_OK)
    await expectStyledPanel(page)
    expect(violations).toStrictEqual([])
    const html = (await response?.text()) ?? ''
    const stylesheetUrls = readFragmentStylesheets(html).map(stylesheet => {
      const href = stylesheet.groups?.href
      if (!href) throw new Error('Missing fragment stylesheet URL')
      return new URL(href, url).href
    })

    // A primeira navegação termina com a folha carregada. A segunda usa a
    // mesma origem e URL, sem modificar o DOM nem interceptar requests.
    await page.goto('about:blank')
    const cachedResponse = await page.goto(url)
    expect(cachedResponse?.status()).toBe(HTTP_OK)
    await expectStyledPanel(page)
    const timings = await page.evaluate(hrefs => {
      const urls = new Set(hrefs)
      return performance
        .getEntriesByType('resource')
        .filter(
          (entry): entry is PerformanceResourceTiming =>
            entry instanceof PerformanceResourceTiming && urls.has(entry.name)
        )
        .map(entry => ({
          transferSize: entry.transferSize,
          decodedBodySize: entry.decodedBodySize
        }))
    }, stylesheetUrls)

    expect(timings).toHaveLength(stylesheetUrls.length)
    for (const timing of timings) {
      expect(timing.transferSize).toBe(0)
      expect(timing.decodedBodySize).toBeGreaterThan(0)
    }
    expect(violations).toStrictEqual([])
    expect(errors).toStrictEqual([])
  } finally {
    await stopCachingProxy(server)
  }
})
