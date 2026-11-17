import {
  createComponent,
  renderToStream,
  renderToString,
  ssr
} from '@solidjs/web'
import { createMemo, Loading } from 'solid-js'

import { UNSAFE_JSON_LD_TEXT } from '@/tests/fixtures/structured-data.ts'

import { createSeo } from '../index.ts'

function Page() {
  createSeo({
    structuredData: () => ({ '@type': 'Thing', name: UNSAFE_JSON_LD_TEXT })
  })
  return ssr('<html><head></head><body><p>Page content</p></body></html>')
}

describe('native JSON-LD serialization on the server', () => {
  it('escapes the JSON-LD in the initial HTML and keeps its content when decoding', () => {
    const html = renderToString(() => createComponent(Page, {}))
    const json =
      /<script\b[^>]*type="application\/ld\+json"[^>]*>(?<json>.*?)<\/script>/su.exec(
        html
      )?.groups?.json
    expect(json).toBeDefined()
    expect(json).not.toContain('<')
    const data: unknown = JSON.parse(json ?? 'null')
    expect(data).toStrictEqual({
      '@context': 'https://schema.org',
      '@type': 'Thing',
      name: UNSAFE_JSON_LD_TEXT
    })
    expect(html).toContain('<p>Page content</p>')
  })

  it('escapes the JSON-LD update released after the first chunk', async () => {
    const pending = Promise.withResolvers<string>()

    function DeferredData() {
      const name = createMemo(() => pending.promise)
      createSeo({ structuredData: () => ({ '@type': 'Thing', name: name() }) })
      return ssr(
        ['', ''],
        createMemo(() => name() && 'Published data')
      )
    }

    const stream = renderToStream(
      () =>
        ssr(
          ['<html><head></head><body>', '</body></html>'],
          createComponent(Loading, {
            fallback: 'Loading data',
            get children() {
              return createComponent(DeferredData, {})
            }
          })
        ),
      { nonce: 'json-ld-test' }
    )
    const reader = stream.readable.getReader()
    onTestFinished(async () => {
      pending.resolve(UNSAFE_JSON_LD_TEXT)
      await reader.cancel()
    })
    const first = await reader.read()
    const shell = new TextDecoder().decode(first.value)
    expect({
      isDone: first.done,
      hasFallback: shell.includes('Loading data'),
      hasJsonLd: shell.includes('application/ld+json')
    }).toStrictEqual({
      isDone: false,
      hasFallback: true,
      hasJsonLd: false
    })

    pending.resolve(UNSAFE_JSON_LD_TEXT)
    const decoder = new TextDecoder()
    let tail = ''
    for (
      let chunk = await reader.read();
      !chunk.done;
      chunk = await reader.read()
    ) {
      tail += decoder.decode(chunk.value, { stream: true })
    }
    tail += decoder.decode()
    expect(tail).toMatch(
      /<script nonce="json-ld-test">.*script:key:structured-data:.*application\/ld\+json/su
    )
    expect(tail).not.toMatch(
      /<script data-json-ld-injected>|<img data-json-ld-injected|<!--<script>/u
    )
    expect(tail).toContain('data-json-ld-injected')
    expect(tail).toContain('Published data')
  })
})
