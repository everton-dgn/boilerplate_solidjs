import * as v from 'valibot'

import { requestJson } from '../index.ts'

const options = {
  url: 'https://backend.invalid/data',
  schema: v.object({ message: v.string() })
}
// Without the paraglide locale context, the message is in the base locale.
const PUBLIC_MESSAGE = 'The request could not be completed.'
const TIMEOUT_MS = 10_000
const OVERSIZED_LENGTH = '1000001'
const CHUNK_BYTES = 600_000

function fetchMock(
  value: Response | Error
): ReturnType<typeof vi.fn<typeof fetch>> {
  const mock = vi.fn<typeof fetch>()
  if (value instanceof Error) mock.mockRejectedValue(value)
  else mock.mockResolvedValue(value)
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('protected JSON transport', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

  it('leaves out extra fields on success and passes url, init and timeout to fetch', async () => {
    const mock = fetchMock(
      Response.json({ message: 'ok', internalContext: 'PRIVATE' })
    )
    const init = { method: 'POST', headers: { accept: 'application/json' } }
    await expect(requestJson({ ...options, init })).resolves.toStrictEqual({
      message: 'ok'
    })
    expect(mock).toHaveBeenCalledOnce()
    const [url, passed] = mock.mock.calls[0] ?? []
    expect(url).toBe(options.url)
    expect(passed).toMatchObject(init)
    expect(passed?.signal?.aborted).toBe(false)
  })

  it('combines the timeout with the signal of the caller', async () => {
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(AbortSignal.abort())
    const mock = fetchMock(new DOMException('aborted', 'AbortError'))
    await expect(requestJson(options)).rejects.toThrow(PUBLIC_MESSAGE)
    expect(timeout).toHaveBeenCalledExactlyOnceWith(TIMEOUT_MS)
    expect(mock.mock.lastCall?.[1]?.signal?.aborted).toBe(true)
    timeout.mockReturnValue(new AbortController().signal)
    fetchMock(Response.json({ message: 'ok' }))
    const caller = new AbortController()
    const pending = requestJson({ ...options, init: { signal: caller.signal } })
    caller.abort()
    await expect(pending).resolves.toStrictEqual({ message: 'ok' })
    expect(
      vi.mocked<typeof fetch>(fetch).mock.lastCall?.[1]?.signal?.aborted
    ).toBe(true)
  })

  it('keeps the timeout when the caller passes a signal that does not abort', async () => {
    const timeoutController = new AbortController()
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(timeoutController.signal)
    const mock = fetchMock(Response.json({ message: 'ok' }))
    const caller = new AbortController()
    const pending = requestJson({ ...options, init: { signal: caller.signal } })
    timeoutController.abort()
    await expect(pending).resolves.toStrictEqual({ message: 'ok' })
    expect(timeout).toHaveBeenCalledExactlyOnceWith(TIMEOUT_MS)
    expect(caller.signal.aborted).toBe(false)
    expect(mock.mock.lastCall?.[1]?.signal?.aborted).toBe(true)
  })

  it('cancels the body of an HTTP failure without reading it', async () => {
    const cancel = vi.fn<() => void>()
    const pull = vi.fn<(controller: ReadableStreamDefaultController) => void>(
      controller => {
        controller.enqueue(new TextEncoder().encode('{"message":"PRIVATE"}'))
      }
    )
    // Without an initial queue, the stream only calls pull when someone reads the body.
    const body = new ReadableStream(
      { pull, cancel },
      new CountQueuingStrategy({ highWaterMark: 0 })
    )
    fetchMock(new Response(body, { status: 500 }))
    await expect(requestJson(options)).rejects.toThrow(PUBLIC_MESSAGE)
    expect(cancel).toHaveBeenCalledOnce()
    expect(pull).not.toHaveBeenCalled()
  })

  it('refuses bodies over the limit without reading them whole', async () => {
    const declaredCancel = vi.fn<() => void>()
    fetchMock(
      new Response(new ReadableStream({ cancel: declaredCancel }), {
        headers: { 'content-length': OVERSIZED_LENGTH }
      })
    )
    await expect(requestJson(options)).rejects.toThrow(PUBLIC_MESSAGE)
    expect(declaredCancel).toHaveBeenCalledOnce()
    const streamCancel = vi.fn<() => void>()
    const chunk = new Uint8Array(CHUNK_BYTES)
    fetchMock(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(chunk)
            controller.enqueue(chunk)
          },
          cancel: streamCancel
        })
      )
    )
    await expect(requestJson(options)).rejects.toThrow(PUBLIC_MESSAGE)
    expect(streamCancel).toHaveBeenCalledOnce()
  })

  it('protects HTTP status, an invalid JSON body, an invalid schema and a network failure', async () => {
    for (const response of [
      new Response('<html>PRIVATE</html>', { status: 500 }),
      new Response('PRIVATE_JSON'),
      Response.json({ message: { secret: 'PRIVATE_SCHEMA' } })
    ]) {
      fetchMock(response)
      await expect(requestJson(options)).rejects.toThrow(PUBLIC_MESSAGE)
    }
    fetchMock(new Error('PRIVATE_NETWORK'))
    await expect(requestJson(options)).rejects.toThrow(PUBLIC_MESSAGE)
  })
})
