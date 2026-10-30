import { once } from 'node:events'
import {
  createServer,
  request as proxyRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'

import {
  releaseFixtureGate,
  releaseFixtureGateQuietly
} from '@/tests/helpers/fixtureGate/index.ts'
import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'
import { watchEntryLoad } from '@/tests/helpers/watchEntryLoad/index.ts'

type DocumentStream = {
  response: IncomingMessage
  outgoing: ServerResponse
  released: Promise<null>
}
type ShellStream = {
  response: IncomingMessage
  outgoing: ServerResponse
}
type ParserProxy = {
  server: Server
  release: () => void
  truncate: () => void
}

const HTTP_BAD_GATEWAY = 502
const INDEX_NOT_FOUND = -1
const PANEL_COUNT = 2
// Script que o servidor acrescenta ao fim do shell; sem ele, hydrate() espera
// o DOMContentLoaded.
const SHELL_MARKER = '_$HY.s['
const SHELL_TAIL = 1024

// Envia o shell até antes do marcador e mantém a resposta aberta até o teste
// truncar o documento.
async function streamUntilShellMarker({
  response,
  outgoing
}: ShellStream): Promise<void> {
  response.setEncoding('utf8')
  let pending = ''
  for await (const chunk of response) {
    pending += String(chunk)
    const marker = pending.indexOf(SHELL_MARKER)
    if (marker === INDEX_NOT_FOUND) {
      const flushed = pending.length - SHELL_TAIL
      if (flushed > 0) {
        outgoing.write(pending.slice(0, flushed))
        pending = pending.slice(flushed)
      }
      continue
    }
    outgoing.write(pending.slice(0, pending.lastIndexOf('<script', marker)))
    response.destroy()
    return
  }
  throw new Error('Shell marker not found')
}

async function streamHead({
  response,
  outgoing,
  released
}: DocumentStream): Promise<void> {
  response.setEncoding('utf8')
  let prefix = ''
  let hasHead = false
  for await (const chunk of response) {
    if (hasHead) {
      outgoing.write(chunk)
      continue
    }
    prefix += String(chunk)
    const headEnd = prefix.indexOf('</head>')
    if (headEnd === INDEX_NOT_FOUND) continue
    const offset = headEnd + '</head>'.length
    outgoing.write(prefix.slice(0, offset))
    await released
    outgoing.write(prefix.slice(offset))
    hasHead = true
  }
  if (!hasHead) outgoing.write(prefix)
  outgoing.end()
}

async function startParserProxy(target: string): Promise<ParserProxy> {
  const gate = Promise.withResolvers<null>()
  let truncate: (() => void) | undefined
  const server = createServer((incoming, outgoing) => {
    const url = new URL(incoming.url ?? '/', target)
    const upstream = proxyRequest(
      url,
      { method: incoming.method, headers: incoming.headers },
      async response => {
        outgoing.writeHead(
          response.statusCode ?? HTTP_BAD_GATEWAY,
          response.headers
        )
        if (url.pathname === '/en') {
          try {
            await streamHead({ response, outgoing, released: gate.promise })
          } catch {
            outgoing.destroy()
          }
          return
        }
        if (
          url.pathname === '/en/hydration' &&
          url.searchParams.get('cut') === 'shell'
        ) {
          truncate = () => outgoing.end()
          try {
            await streamUntilShellMarker({ response, outgoing })
          } catch {
            outgoing.destroy()
          }
          return
        }
        if (url.pathname === '/en/hydration') {
          truncate = () => {
            response.unpipe(outgoing)
            outgoing.end()
          }
        }
        response.on('error', () => outgoing.destroy())
        response.pipe(outgoing)
      }
    )
    upstream.on('error', () => outgoing.destroy())
    outgoing.on('close', () => upstream.destroy())
    incoming.pipe(upstream)
  })
  const listening = once(server, 'listening')
  server.listen(0, '127.0.0.1')
  await listening
  return {
    server,
    release: () => gate.resolve(null),
    truncate: () => {
      if (!truncate) throw new Error('Document stream has not started')
      truncate()
    }
  }
}

async function stopProxy(server: Server): Promise<void> {
  const closed = once(server, 'close')
  server.close()
  server.closeAllConnections()
  await closed
}

test('não marca antes do shell quando a entrada async já executou', async ({
  page,
  baseURL,
  pageErrors,
  cspViolations
}) => {
  if (!baseURL) throw new Error('Missing test base URL')
  const proxy = await startParserProxy(baseURL)
  await watchEntryLoad(page)
  try {
    const address = proxy.server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('Missing proxy address')
    }
    await page.goto(`http://127.0.0.1:${address.port}/en`, {
      waitUntil: 'commit'
    })
    await expect(page.locator('html')).toHaveAttribute(
      'data-entry-loaded',
      'loading'
    )
    await expect(page.locator('body')).toHaveCount(0)
    expect(await hydrationFinished(page)).toBe(false)

    proxy.release()
    await expect.poll(() => hydrationFinished(page)).toBe(true)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'SolidJS Boilerplate for web applications'
    )
    await page.getByRole('button', { name: 'Select theme' }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    expect(pageErrors).toStrictEqual([])
    expect(cspViolations).toStrictEqual([])
  } finally {
    proxy.release()
    await page.close()
    await stopProxy(proxy.server)
  }
})

test('encerra a hidratação e recupera dados pelo cliente após truncamento', async ({
  page,
  baseURL,
  request,
  pageErrors,
  cspViolations
}) => {
  if (!baseURL) throw new Error('Missing test base URL')
  const proxy = await startParserProxy(baseURL)
  const id = crypto.randomUUID()
  let clientLoads = 0
  page.on('request', resource => {
    if (
      resource.method() === 'POST' &&
      new URL(resource.url()).pathname.startsWith('/_server/')
    ) {
      clientLoads += 1
    }
  })
  await watchEntryLoad(page)
  try {
    const address = proxy.server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('Missing proxy address')
    }
    await page.goto(`http://127.0.0.1:${address.port}/en/hydration?id=${id}`, {
      waitUntil: 'commit'
    })
    await expect(page.locator('html')).toHaveAttribute(
      'data-entry-loaded',
      'loading'
    )
    await expect(
      page.getByText('Waiting for First', { exact: true })
    ).toBeVisible()
    await expect(
      page.getByText('Waiting for Second', { exact: true })
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Shell count: 0', exact: true })
      .press('Enter')
    await expect(
      page.getByRole('button', { name: 'Shell count: 1', exact: true })
    ).toBeVisible()
    expect(await hydrationFinished(page)).toBe(false)
    expect(clientLoads).toBe(0)

    proxy.truncate()
    await page.waitForLoadState('domcontentloaded')
    await expect.poll(() => clientLoads).toBe(PANEL_COUNT)
    await expect.poll(() => hydrationFinished(page)).toBe(true)
    await expect(
      page.getByText('Waiting for First', { exact: true })
    ).toBeVisible()
    await expect(
      page.getByText('Waiting for Second', { exact: true })
    ).toBeVisible()
    await releaseFixtureGate({ request, id: `${id}-first` })
    await releaseFixtureGate({ request, id: `${id}-second` })
    await expect(
      page.getByRole('heading', { name: 'First', exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Second', exact: true })
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Shell count: 1', exact: true })
      .press('Enter')
    await expect(
      page.getByRole('button', { name: 'Shell count: 2', exact: true })
    ).toBeVisible()
    expect(cspViolations).toStrictEqual([])
    expect(pageErrors).toStrictEqual([])
  } finally {
    await releaseFixtureGateQuietly({ request, id: `${id}-first` })
    await releaseFixtureGateQuietly({ request, id: `${id}-second` })
    await page.close()
    await stopProxy(proxy.server)
  }
})

test('recupera dados pelo cliente quando o truncamento antecede o fim do shell', async ({
  page,
  baseURL,
  request,
  pageErrors,
  cspViolations
}) => {
  if (!baseURL) throw new Error('Missing test base URL')
  const proxy = await startParserProxy(baseURL)
  const id = crypto.randomUUID()
  let clientLoads = 0
  page.on('request', resource => {
    if (
      resource.method() === 'POST' &&
      new URL(resource.url()).pathname.startsWith('/_server/')
    ) {
      clientLoads += 1
    }
  })
  await watchEntryLoad(page)
  try {
    const address = proxy.server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('Missing proxy address')
    }
    await page.goto(
      `http://127.0.0.1:${address.port}/en/hydration?id=${id}&cut=shell`,
      { waitUntil: 'commit' }
    )
    await expect(page.locator('html')).toHaveAttribute(
      'data-entry-loaded',
      'loading'
    )
    await expect(
      page.getByText('Waiting for First', { exact: true })
    ).toBeVisible()
    expect(await hydrationFinished(page)).toBe(false)
    expect(clientLoads).toBe(0)

    proxy.truncate()
    await page.waitForLoadState('domcontentloaded')
    await expect.poll(() => clientLoads).toBe(PANEL_COUNT)
    await expect.poll(() => hydrationFinished(page)).toBe(true)
    await releaseFixtureGate({ request, id: `${id}-first` })
    await releaseFixtureGate({ request, id: `${id}-second` })
    await expect(
      page.getByRole('heading', { name: 'First', exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Second', exact: true })
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Shell count: 0', exact: true })
      .press('Enter')
    await expect(
      page.getByRole('button', { name: 'Shell count: 1', exact: true })
    ).toBeVisible()
    expect(cspViolations).toStrictEqual([])
    expect(pageErrors).toStrictEqual([])
  } finally {
    await releaseFixtureGateQuietly({ request, id: `${id}-first` })
    await releaseFixtureGateQuietly({ request, id: `${id}-second` })
    await page.close()
    await stopProxy(proxy.server)
  }
})
