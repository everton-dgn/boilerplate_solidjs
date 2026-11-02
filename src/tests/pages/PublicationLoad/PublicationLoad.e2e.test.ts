import { readFile } from 'node:fs/promises'
import { get as getHttp, type IncomingMessage } from 'node:http'
import { env } from 'node:process'

import { expect, test, type APIRequestContext } from '@playwright/test'
import * as v from 'valibot'

import {
  readBackendState,
  releaseFixtureGateQuietly
} from '@/tests/helpers/fixtureGate/index.ts'

type HttpResult = { status: number; headers: Headers; bytes: number }
type RequestState = { result?: HttpResult; error?: Error }
type PendingRequest = {
  id: string
  response: Promise<void>
  state: RequestState
}
type StartOptions = { baseURL: string; signal: AbortSignal }
type ReadOptions = StartOptions & { id: string; state: RequestState }
type WaitOptions = { request: APIRequestContext; pending: PendingRequest }
type ReleaseOptions = { request: APIRequestContext; pending: PendingRequest[] }
type TimedPageOptions = { request: APIRequestContext; samples: number }
type ProbeOptions = { request: APIRequestContext; baseURL?: string }

const MAX_ADMISSION_PROBE = 32
const REQUEST_TIMEOUT_MS = 20_000
const BASELINE_SAMPLES = 16
const LOAD_SAMPLES = 8
const MAX_EVENT_LOOP_DELAY_MS = 250
const MAX_ADDED_HTML_DELAY_MS = 500
const MIN_LARGE_BODY_BYTES = 1_000_000
const MAX_REJECTION_BYTES = 1024
const HTTP_OK = 200
const HTTP_NO_CONTENT = 204
const HTTP_UNAVAILABLE = 503
const HTTP_NOT_FOUND = 404
const JSON_INDENT = 2
const ADMISSION_TIMEOUT_MS = 3000
const INITIAL_POLL_MS = 10
const SECOND_POLL_MS = 20
const MAX_POLL_MS = 50
const STREAM_RESERVATION_BYTES = 16_777_216
const ProbeSchema = v.object({
  publication: v.object({
    active: v.number(),
    markdown: v.number(),
    sources: v.number(),
    outputs: v.number(),
    reservedBytes: v.number(),
    rejected: v.number()
  }),
  eventLoopMaxMs: v.number(),
  eventLoopSamples: v.number(),
  eventLoopMeanMs: v.number(),
  memory: v.object({
    rss: v.number(),
    heapUsed: v.number(),
    external: v.number()
  }),
  maxRssBytes: v.number()
})

async function readRequest({
  baseURL,
  signal,
  id,
  state
}: ReadOptions): Promise<void> {
  try {
    const url = new URL('/pt/markdown-contract/sample.md', baseURL)
    url.searchParams.set('id', id)
    const response = await fetch(url, { signal })
    const body = await response.arrayBuffer()
    state.result = {
      status: response.status,
      headers: response.headers,
      bytes: body.byteLength
    }
  } catch (error) {
    state.error =
      error instanceof Error ? error : new Error('HTTP probe failed')
  }
}

function startRequest({ baseURL, signal }: StartOptions): PendingRequest {
  const id = crypto.randomUUID()
  const state: RequestState = {}
  return { id, state, response: readRequest({ baseURL, signal, id, state }) }
}

function pausedRequest(url: URL): Promise<IncomingMessage> {
  const { promise, resolve, reject } = Promise.withResolvers<IncomingMessage>()
  const request = getHttp(
    url,
    { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    response => {
      response.pause()
      response.on('error', () => response.destroy())
      resolve(response)
    }
  )
  request.on('error', reject)
  return promise
}

async function waitForAdmission({
  request,
  pending
}: WaitOptions): Promise<void> {
  await expect
    .poll(
      async () => {
        if (pending.state.error) throw pending.state.error
        if (pending.state.result) return 'responded'
        const state = await readBackendState({
          request,
          id: `${pending.id}:first`
        })
        return state.gate === 'waiting' ? 'admitted' : 'pending'
      },
      {
        timeout: ADMISSION_TIMEOUT_MS,
        intervals: [INITIAL_POLL_MS, SECOND_POLL_MS, MAX_POLL_MS]
      }
    )
    .not.toBe('pending')
}

async function releaseAll({ request, pending }: ReleaseOptions): Promise<void> {
  await Promise.all(
    pending.flatMap(({ id }) =>
      ['first', 'second'].map(label =>
        releaseFixtureGateQuietly({ request, id: `${id}:${label}` })
      )
    )
  )
}

async function readProbe({ request, baseURL }: ProbeOptions) {
  const path = baseURL
    ? new URL('/publication-probe', baseURL).href
    : '/publication-probe'
  const response = await request.get(path)
  expect(response.status()).toBe(HTTP_OK)
  return v.parse(ProbeSchema, await response.json())
}

async function timedPages({
  request,
  samples
}: TimedPageOptions): Promise<number[]> {
  const durations: number[] = []
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now()
    const response = await request.get('/pt/about')
    expect(response.status()).toBe(HTTP_OK)
    expect(response.headers()['content-type']).toContain('text/html')
    durations.push(performance.now() - started)
  }
  return durations
}

test('rejects excess publication before SSR, preserves normal HTML and recovers', async ({
  request,
  baseURL
}, testInfo) => {
  if (!baseURL) throw new Error('Missing test base URL')
  const secondaryURL = env.PUBLICATION_SECONDARY_URL
  if (!secondaryURL) throw new Error('Missing secondary test URL')
  const controller = new AbortController()
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  ])
  const pending: PendingRequest[] = []
  let rejected: PendingRequest | undefined
  const before = await readProbe({ request })
  try {
    for (let index = 0; index < MAX_ADMISSION_PROBE; index += 1) {
      const current = startRequest({ baseURL, signal })
      pending.push(current)
      await waitForAdmission({ request, pending: current })
      if (current.state.result) {
        rejected = current
        break
      }
    }
    expect(
      rejected,
      'publication must have a finite admission limit'
    ).toBeDefined()
    if (!rejected) throw new Error('Publication admission was not reached')
    expect(rejected.state.result?.status).toBe(HTTP_UNAVAILABLE)
    expect(rejected.state.result?.headers.get('cache-control')).toContain(
      'no-store'
    )
    expect(rejected.state.result?.headers.get('retry-after')).toMatch(/^\d+$/u)
    expect(rejected.state.result?.bytes).toBeLessThan(MAX_REJECTION_BYTES)
    for (const label of ['first', 'second']) {
      const state = await readBackendState({
        request,
        id: `${rejected.id}:${label}`
      })
      expect(state.gate).toBe('none')
      expect(state.attempts).toBe(0)
    }
    const loaded = await readProbe({ request })
    expect(loaded.publication.markdown).toBe(pending.length - 1)
    expect(loaded.publication.rejected).toBeGreaterThan(
      before.publication.rejected
    )
    const admittedPerInstance = pending.length - 1
    for (let index = 0; index < admittedPerInstance; index += 1) {
      const current = startRequest({ baseURL: secondaryURL, signal })
      pending.push(current)
      await waitForAdmission({ request, pending: current })
      expect(current.state.result).toBeUndefined()
    }
    const secondary = await readProbe({ request, baseURL: secondaryURL })
    expect(secondary.publication.markdown).toBe(admittedPerInstance)
    const htmlDurationsMs = await timedPages({ request, samples: LOAD_SAMPLES })
    await testInfo.attach('publication-saturation.json', {
      body: JSON.stringify(
        { before, loaded, secondary, admittedPerInstance, htmlDurationsMs },
        null,
        JSON_INDENT
      ),
      contentType: 'application/json'
    })
  } finally {
    await releaseAll({ request, pending })
    const settled = await Promise.allSettled(pending.map(item => item.response))
    controller.abort()
    for (const result of settled) expect(result.status).toBe('fulfilled')
  }
  for (const item of pending) {
    expect(item.state.error).toBeUndefined()
    if (item !== rejected) expect(item.state.result?.status).toBe(HTTP_OK)
  }
  await expect
    .poll(async () => {
      const probe = await readProbe({ request })
      return probe.publication.active
    })
    .toBe(0)
  await expect
    .poll(async () => {
      const probe = await readProbe({ request })
      return probe.publication.outputs
    })
    .toBe(0)
  const idle = await readProbe({ request })
  expect(idle.publication.reservedBytes).toBe(0)
  const secondaryIdle = await readProbe({ request, baseURL: secondaryURL })
  expect(secondaryIdle.publication.active).toBe(0)
  expect(secondaryIdle.publication.outputs).toBe(0)
  expect(secondaryIdle.publication.reservedBytes).toBe(0)
  const healthy = await request.get('/en/markdown-contract/sample.md')
  expect(healthy.status()).toBe(HTTP_OK)
  expect(await healthy.text()).toContain('first:en:resolved')
})

test('measures a large admitted conversion alongside normal SSR', async ({
  request
}, testInfo) => {
  const warm = await request.get('/pt/publication-cpu/small.md')
  expect(warm.status()).toBe(HTTP_OK)
  const baselineMs = await timedPages({ request, samples: BASELINE_SAMPLES })
  const monitor = await request.post('/publication-probe')
  expect(monitor.status()).toBe(HTTP_NO_CONTENT)
  try {
    await expect
      .poll(async () => {
        const probe = await readProbe({ request })
        return probe.eventLoopSamples
      })
      .toBeGreaterThan(0)
    const before = await readProbe({ request })
    const started = performance.now()
    const largePromise = request.get('/pt/publication-cpu/large.md')
    const loadedMsPromise = timedPages({ request, samples: LOAD_SAMPLES })
    const [large, loadedMs] = await Promise.all([largePromise, loadedMsPromise])
    const body = await large.body()
    const after = await readProbe({ request })
    await testInfo.attach('publication-cpu-pilot.json', {
      body: JSON.stringify(
        {
          baselineMs,
          loadedMs,
          elapsedMs: performance.now() - started,
          bodyBytes: body.byteLength,
          before,
          after,
          criteria: { MAX_EVENT_LOOP_DELAY_MS, MAX_ADDED_HTML_DELAY_MS }
        },
        null,
        JSON_INDENT
      ),
      contentType: 'application/json'
    })
    expect(large.status()).toBe(HTTP_OK)
    expect(body.byteLength).toBeGreaterThan(MIN_LARGE_BODY_BYTES)
    expect(after.eventLoopMaxMs).toBeLessThan(MAX_EVENT_LOOP_DELAY_MS)
    expect(after.eventLoopSamples).toBeGreaterThan(before.eventLoopSamples)
    expect(Math.max(...loadedMs)).toBeLessThan(
      Math.max(...baselineMs) + MAX_ADDED_HTML_DELAY_MS
    )
    expect(after.publication.active).toBe(0)
  } finally {
    const stopped = await request.delete('/publication-probe')
    expect(stopped.status()).toBe(HTTP_NO_CONTENT)
  }
})

test('retains backend work after disconnect and releases it after settlement', async ({
  request,
  baseURL
}) => {
  if (!baseURL) throw new Error('Missing test base URL')
  const serverLog = env.SERVER_LOG_FILE
  if (!serverLog) throw new Error('Missing server log file')
  const previousLog = await readFile(serverLog, 'utf8')
  const controller = new AbortController()
  const pending = startRequest({ baseURL, signal: controller.signal })
  try {
    await waitForAdmission({ request, pending })
    const working = await readProbe({ request })
    expect(working.publication.active).toBe(1)
    controller.abort()
    await pending.response
    expect(pending.state.error?.name).toBe('AbortError')
    const abandoned = await readProbe({ request })
    expect(abandoned.publication.active).toBe(1)
    await releaseAll({ request, pending: [pending] })
    await expect
      .poll(async () => {
        const probe = await readProbe({ request })
        return probe.publication.active
      })
      .toBe(0)
    const idle = await readProbe({ request })
    expect(idle.publication.reservedBytes).toBe(0)
    const currentLog = await readFile(serverLog, 'utf8')
    expect(currentLog.startsWith(previousLog)).toBe(true)
    expect(currentLog.slice(previousLog.length)).not.toContain(
      '[middleware] Unexpected failure; private details omitted'
    )
  } finally {
    controller.abort()
    await releaseAll({ request, pending: [pending] })
    await pending.response
  }
})

test('retains output for a paused HTTP consumer and cancels it at the deadline', async ({
  request,
  baseURL
}) => {
  if (!baseURL) throw new Error('Missing test base URL')
  const response = await pausedRequest(new URL('/publication-stream', baseURL))
  try {
    expect(response.statusCode).toBe(HTTP_OK)
    const waiting = await readProbe({ request })
    expect(waiting.publication.active).toBe(0)
    expect(waiting.publication.outputs).toBe(1)
    expect(waiting.publication.reservedBytes).toBe(STREAM_RESERVATION_BYTES)
    const rejected = await request.get('/pt/publication-cpu/small.md')
    expect(rejected.status()).toBe(HTTP_UNAVAILABLE)
    await expect
      .poll(async () => {
        const probe = await readProbe({ request })
        return probe.publication.outputs
      })
      .toBe(0)
    const idle = await readProbe({ request })
    expect(idle.publication.reservedBytes).toBe(0)
    expect(response.complete).toBe(false)
  } finally {
    response.destroy()
  }
})

test('sitemap GET and HEAD preserve independent bodies and metadata concurrently', async ({
  request
}) => {
  const [get, head] = await Promise.all([
    request.get('/sitemaps/catalog/a.xml'),
    request.head('/sitemaps/catalog/a.xml')
  ])
  expect(get.status()).toBe(HTTP_OK)
  expect(head.status()).toBe(get.status())
  for (const header of [
    'content-type',
    'cache-control',
    'x-content-type-options'
  ]) {
    expect(head.headers()[header]).toBe(get.headers()[header])
  }
  expect(await get.text()).toContain('/pt/catalog/a-1')
  expect(await head.body()).toHaveLength(0)
  const idle = await readProbe({ request })
  expect(idle.publication).toMatchObject({
    active: 0,
    sources: 0,
    outputs: 0,
    reservedBytes: 0
  })
})

test('sitemap tolerates removing a partition after its index and then rolling back', async ({
  request
}) => {
  const original = await request.get('/sitemap.xml')
  expect(original.status()).toBe(HTTP_OK)
  expect(await original.text()).toContain('/sitemaps/catalog/a.xml')
  try {
    const changed = await request.post('/publication-source?removed=1')
    expect(changed.status()).toBe(HTTP_NO_CONTENT)
    const removed = await request.get('/sitemaps/catalog/a.xml')
    expect(removed.status()).toBe(HTTP_NOT_FOUND)
    expect(removed.headers()['cache-control']).toBe('no-store')
    const current = await request.get('/sitemap.xml')
    expect(current.status()).toBe(HTTP_OK)
    expect(await current.text()).not.toContain('/sitemaps/catalog/a.xml')
    const retained = await request.get('/sitemaps/catalog/b.xml')
    expect(retained.status()).toBe(HTTP_OK)
    expect(await retained.text()).toContain('/pt/catalog/b-1')
  } finally {
    const restored = await request.post('/publication-source?removed=0')
    expect(restored.status()).toBe(HTTP_NO_CONTENT)
  }
  const restored = await request.get('/sitemaps/catalog/a.xml')
  expect(restored.status()).toBe(HTTP_OK)
  expect(await restored.text()).toContain('/pt/catalog/a-1')
})
