import { requestTiming } from '../index.ts'

const TEST_ORIGIN = 'http://localhost'
// Entrada que o runtime grava no Server-Timing com um traceparent amostrado.
const TRACE_TIMING =
  'traceparent;desc="00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"'

describe('medição do tempo da requisição', () => {
  it('mede o tempo e preserva a resposta do próximo handler', async () => {
    const started = 100
    const finished = 112.5
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(started)
      .mockReturnValueOnce(finished)
    const response = new Response('conteúdo')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)

    await expect(requestTiming(new Request(TEST_ORIGIN), next)).resolves.toBe(
      response
    )
    expect(response.headers.get('server-timing')).toBe('app;dur=12.5')
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })

  it('acrescenta o server-timing sem apagar as métricas do runtime', async () => {
    const started = 100
    const finished = 112.5
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(started)
      .mockReturnValueOnce(finished)
    const response = new Response('conteúdo', {
      headers: { 'server-timing': TRACE_TIMING }
    })
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(response)

    await requestTiming(new Request(TEST_ORIGIN), next)

    expect(response.headers.get('server-timing')).toBe(
      `${TRACE_TIMING}, app;dur=12.5`
    )
  })
})
