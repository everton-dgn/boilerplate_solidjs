import { expect, test, type APIRequestContext } from '@playwright/test'
import * as v from 'valibot'

const HTTP_OK = 200
const HTTP_REDIRECT = 307
const HTTP_INTERNAL_SERVER_ERROR = 500

const BACKEND = 'http://127.0.0.1:4318'
const PAGE = '/pt/markdown-contract/sample'
const REQUEST_TIMEOUT = 15_000
const stateSchema = v.object({
  gate: v.picklist(['none', 'waiting', 'released']),
  real: v.boolean()
})
type Gate = { request: APIRequestContext; id: string }

async function waitForGates({ request, id }: Gate): Promise<void> {
  for (const label of ['first', 'second']) {
    await expect
      .poll(async () => {
        const response = await request.get(
          `${BACKEND}/control?id=${id}:${label}`
        )
        return v.parse(stateSchema, await response.json()).gate
      })
      .toBe('waiting')
  }
}

async function releaseGates({ request, id }: Gate): Promise<void> {
  for (const label of ['second', 'first']) {
    const response = await request.post(`${BACKEND}/release?id=${id}:${label}`)
    expect(response.ok()).toBe(true)
  }
}

test('waits for both fragments and publishes them in DOM order', async ({
  request
}) => {
  const id = crypto.randomUUID()
  const responsePromise = request.get(`${PAGE}.md?id=${id}`)
  try {
    await waitForGates({ request, id })
  } finally {
    await releaseGates({ request, id })
  }
  const response = await responsePromise
  expect(response.status()).toBe(HTTP_OK)
  const body = await response.text()
  expect(body).toContain('first:pt:resolved')
  expect(body).toContain('second:pt:resolved')
  expect(body.indexOf('first:pt:resolved')).toBeLessThan(
    body.indexOf('second:pt:resolved')
  )
  expect(body).not.toMatch(/FALLBACK|<template|<script/u)
})

test('normal HTML sends the loading shell while both sources remain blocked', async ({
  request,
  baseURL
}) => {
  const id = crypto.randomUUID()
  const controller = new AbortController()
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(REQUEST_TIMEOUT)
  ])
  try {
    const response = await fetch(`${baseURL}${PAGE}?id=${id}`, {
      signal,
      headers: { accept: 'text/html' }
    })
    expect(response.status).toBe(HTTP_OK)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Missing HTML response body')
    const decoder = new TextDecoder()
    let shell = ''
    while (
      !shell.includes('FIRST_FALLBACK') ||
      !shell.includes('SECOND_FALLBACK')
    ) {
      const chunk = await reader.read()
      expect(chunk.done).toBe(false)
      if (chunk.done) break
      shell += decoder.decode(chunk.value, { stream: true })
    }
    await waitForGates({ request, id })
    expect(shell).toContain('FIRST_FALLBACK')
    expect(shell).toContain('SECOND_FALLBACK')
    await releaseGates({ request, id })
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
    }
  } finally {
    controller.abort()
    await releaseGates({ request, id })
  }
})

test('failed async fragment returns a public 500 instead of partial Markdown', async ({
  request
}) => {
  const id = crypto.randomUUID()
  const marker = `PRIVATE_MARKDOWN_${crypto.randomUUID()}`
  const responsePromise = request.get(`${PAGE}.md?id=${id}&scenario=error`, {
    headers: { 'x-markdown-private': marker }
  })
  try {
    await waitForGates({ request, id })
    const state = await request.get(`${BACKEND}/control?id=${id}:first`)
    expect(v.parse(stateSchema, await state.json()).real).toBe(true)
  } finally {
    await releaseGates({ request, id })
  }
  const response = await responsePromise
  expect(response.status()).toBe(HTTP_INTERNAL_SERVER_ERROR)
  expect(response.headers()['cache-control']).toBe('private, no-store')
  expect(response.headers()['content-type'] ?? '').not.toContain(
    'text/markdown'
  )
  const body = await response.text()
  expect(body).not.toContain(marker)
  expect(JSON.stringify(response.headers())).not.toContain(marker)
  expect(body).not.toContain('second:pt:resolved')
  expect(body).not.toContain('HTML Markdown contract: sample')
  const healthy = await request.get(`${PAGE}.md`)
  expect(healthy.status()).toBe(HTTP_OK)
})

test('late same-origin redirect preserves explicit Markdown intent', async ({
  request
}) => {
  const id = crypto.randomUUID()
  const responsePromise = request.get(`${PAGE}.md?id=${id}&scenario=redirect`, {
    maxRedirects: 0
  })
  try {
    await waitForGates({ request, id })
  } finally {
    await releaseGates({ request, id })
  }
  const response = await responsePromise
  expect(response.status()).toBe(HTTP_REDIRECT)
  expect(response.headers().location).toBe('/pt/about.md')
  expect(await response.text()).not.toContain('HTML Markdown contract: sample')
})

test('a cancelled pending render does not contaminate the next request', async ({
  request,
  baseURL
}) => {
  const id = crypto.randomUUID()
  const controller = new AbortController()
  const pending = (async () => {
    const response = await fetch(`${baseURL}${PAGE}.md?id=${id}`, {
      signal: AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(REQUEST_TIMEOUT)
      ])
    })
    return response.text()
  })()
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  try {
    await waitForGates({ request, id })
    controller.abort()
    await rejected
  } finally {
    controller.abort()
    await releaseGates({ request, id })
  }
  const healthy = await request.get('/en/markdown-contract/sample.md')
  expect(healthy.status()).toBe(HTTP_OK)
  expect(await healthy.text()).toContain('first:en:resolved')
})

test('the same Error instance fails both sequential Markdown requests publicly', async ({
  request
}) => {
  const marker = `PRIVATE_MARKDOWN_REUSED_${crypto.randomUUID()}`
  for (const attempt of ['first', 'second']) {
    const id = `${crypto.randomUUID()}:${attempt}`
    const pending = request.get(`${PAGE}.md?id=${id}&scenario=shared-error`, {
      headers: { 'x-markdown-private': marker }
    })
    try {
      await waitForGates({ request, id })
      const state = await request.get(`${BACKEND}/control?id=${id}:first`)
      expect(v.parse(stateSchema, await state.json()).real).toBe(true)
    } finally {
      await releaseGates({ request, id })
    }
    const response = await pending
    expect(response.status(), attempt).toBe(HTTP_INTERNAL_SERVER_ERROR)
    expect(response.headers()['cache-control']).toBe('private, no-store')
    expect(response.headers()['content-type'] ?? '').not.toContain(
      'text/markdown'
    )
    expect(JSON.stringify(response.headers())).not.toContain(marker)
    const body = await response.text()
    expect(body).not.toContain(marker)
    expect(body).not.toContain('HTML Markdown contract: sample')
    expect(body).not.toContain('second:pt:resolved')
  }
})

test('propagated server-function rejection fails Markdown while caught rejection stays healthy', async ({
  request
}) => {
  const backendSchema = v.object({ attempts: v.number(), marker: v.string() })
  for (const scenario of ['server-error', 'server-caught']) {
    const id = crypto.randomUUID()
    const controlURL = `${BACKEND}/control?id=throw:${id}:first`
    const before = await request.get(controlURL)
    const initial = v.parse(backendSchema, await before.json())
    expect(initial.attempts).toBe(0)
    const pending = request.get(`${PAGE}.md?id=${id}&scenario=${scenario}`)
    try {
      await waitForGates({ request, id })
    } finally {
      await releaseGates({ request, id })
    }
    const response = await pending
    const after = await request.get(controlURL)
    expect(v.parse(backendSchema, await after.json()).attempts).toBeGreaterThan(
      0
    )
    const body = await response.text()
    expect(body).not.toContain(initial.marker)
    expect(JSON.stringify(response.headers())).not.toContain(initial.marker)
    expect(body).not.toContain('FIRST_FALLBACK')
    expect(response.headers()['cache-control']).toBe('private, no-store')
    if (scenario === 'server-error') {
      expect(response.status()).toBe(HTTP_INTERNAL_SERVER_ERROR)
      expect(response.headers()['content-type'] ?? '').not.toContain(
        'text/markdown'
      )
      expect(body).not.toContain('HTML Markdown contract: sample')
      expect(body).not.toContain('second:pt:resolved')
      continue
    }
    expect(response.status()).toBe(HTTP_OK)
    expect(response.headers()['content-type']).toContain('text/markdown')
    expect(body).toContain('# HTML Markdown contract: sample')
    expect(body).toContain('Recovered server function content')
    expect(body).toContain('second:pt:resolved')
    expect(body.indexOf('Recovered server function content')).toBeLessThan(
      body.indexOf('second:pt:resolved')
    )
  }
})
