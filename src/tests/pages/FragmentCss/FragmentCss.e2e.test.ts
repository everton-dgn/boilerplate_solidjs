import { once } from 'node:events'
import { createServer, request as proxyRequest, type Server } from 'node:http'

import type { Page } from '@playwright/test'

import {
  readGatedBody,
  releaseFixtureGate
} from '@/tests/helpers/fixtureGate/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

const HTTP_OK = 200
const HTTP_BAD_GATEWAY = 502
const PAGE_URL = '/fragment-css'
const PANEL_TEXT = 'Panel with its own CSS'
const LOADING_TEXT = 'Loading fragment...'
// The order of the attributes is not part of the runtime contract.
const FRAGMENT_STYLESHEET =
  /<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="(?<href>\/assets\/[^"]+\.css)")[^>]*>/gu
const FRAGMENT_KEY = /\bdata-dfc="(?<key>[^"]+)"/u
const SCRIPT_NONCE = /script-src 'nonce-(?<nonce>[^']+)' 'strict-dynamic'/u

// The preview revalidates the assets between documents. This proxy keeps the
// streaming, the status and the headers, changing only the cache of the CSS
// stylesheets to exercise the immediate loading that happens with cacheable assets
// on the host.
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
  await expect(page.getByText(LOADING_TEXT, { exact: true })).not.toBeVisible()
}

function fragmentId(): string {
  return `fragment-css:${crypto.randomUUID()}`
}

// The template must exist before a cached stylesheet fires the load event.
test('sends the template before the fragment CSS, without inline handlers', async ({
  request,
  baseURL
}) => {
  if (!baseURL) throw new Error('Missing test base URL')
  const id = fragmentId()
  const response = await fetch(`${baseURL}${PAGE_URL}?id=${id}`, {
    headers: { accept: 'text/html' }
  })
  const html = await readGatedBody({
    request,
    id,
    response,
    shellText: LOADING_TEXT
  })
  expect(response.status).toBe(HTTP_OK)
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

  const policy = response.headers.get('content-security-policy') ?? ''
  const nonce = SCRIPT_NONCE.exec(policy)?.groups?.nonce
  expect(nonce).toBeDefined()
  const scripts = html.match(/<script\b[^>]*>/gu) ?? []
  expect(scripts.length).toBeGreaterThan(0)
  for (const script of scripts) {
    expect(script).toContain(`nonce="${nonce}"`)
  }
})

test('reveals the panel with new and cached CSS, without a CSP violation', async ({
  page,
  request,
  baseURL,
  pageErrors,
  cspViolations
}) => {
  if (!baseURL) throw new Error('Missing test base URL')
  const server = await startCachingProxy(baseURL)
  try {
    const address = server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('Missing caching proxy address')
    }
    const url = `http://127.0.0.1:${address.port}${PAGE_URL}`

    // Each navigation uses a new gate: an id already released would resolve the
    // data before the shell and bring the CSS into the <head>.
    const firstId = fragmentId()
    const response = await page.goto(`${url}?id=${firstId}`, {
      waitUntil: 'commit'
    })
    expect(response?.status()).toBe(HTTP_OK)
    await expect(page.getByText(LOADING_TEXT, { exact: true })).toBeVisible()
    await releaseFixtureGate({ request, id: firstId })
    await expectStyledPanel(page)
    expect(cspViolations).toStrictEqual([])
    const html = (await response?.text()) ?? ''
    const stylesheetUrls = readFragmentStylesheets(html).map(stylesheet => {
      const href = stylesheet.groups?.href
      if (!href) throw new Error('Missing fragment stylesheet URL')
      return new URL(href, url).href
    })

    // The first navigation ends with the stylesheet loaded. The second one uses
    // the same origin and the same stylesheets, without changing the DOM or
    // intercepting requests.
    await page.goto('about:blank')
    const cachedId = fragmentId()
    const cachedResponse = await page.goto(`${url}?id=${cachedId}`, {
      waitUntil: 'commit'
    })
    expect(cachedResponse?.status()).toBe(HTTP_OK)
    await expect(page.getByText(LOADING_TEXT, { exact: true })).toBeVisible()
    await releaseFixtureGate({ request, id: cachedId })
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
    expect(cspViolations).toStrictEqual([])
    expect(pageErrors).toStrictEqual([])
  } finally {
    await stopCachingProxy(server)
  }
})
