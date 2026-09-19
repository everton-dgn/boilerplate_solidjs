import * as v from 'valibot'

import { requestJson } from '../index.ts'

const options = {
  url: 'https://backend.invalid/data',
  schema: v.object({ message: v.string() })
}
const PUBLIC_MESSAGE = 'Não foi possível concluir a solicitação.'
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

describe('transporte JSON protegido', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('omite campos extras no sucesso e repassa url, init e timeout ao fetch', async () => {
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

  it('combina o timeout com o signal do chamador', async () => {
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

  it('cancela o corpo de uma falha HTTP sem lê-lo', async () => {
    const cancel = vi.fn<() => void>()
    const response = new Response(new ReadableStream({ cancel }), {
      status: 500
    })
    const json = vi.spyOn(response, 'json')
    fetchMock(response)
    await expect(requestJson(options)).rejects.toThrow(PUBLIC_MESSAGE)
    expect(cancel).toHaveBeenCalledOnce()
    expect(json).not.toHaveBeenCalled()
  })

  it('recusa corpos acima do limite sem lê-los inteiros', async () => {
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

  it('protege status HTTP, corpo JSON inválido, schema inválido e falha de rede', async () => {
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
