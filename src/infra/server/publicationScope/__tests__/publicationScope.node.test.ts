import { protectServerOperation } from '@/infra/server/protectServerOperation/index.ts'
import { createPublicationController } from '@/infra/server/publication/index.ts'

import { withPublicationScope } from '../index.ts'

const CONCURRENT_OPERATIONS = 2

async function ignoreRejection(operation: Promise<unknown>): Promise<void> {
  try {
    await operation
  } catch {
    // Este chamador desacoplado observa a falha sem encerrar a publicação.
  }
}

describe('publication backend ownership', () => {
  it('isolates concurrent scopes and keeps rejected detached operations accounted', async () => {
    const controller = createPublicationController()
    const first = Promise.withResolvers<string>()
    const second = Promise.withResolvers<string>()
    const run = (pending: Promise<string>) =>
      controller.runPublication({
        kind: 'markdown',
        timeoutMs: 1000,
        maxOutputBytes: 100,
        run: () => {
          void ignoreRejection(protectServerOperation({ run: () => pending }))
          return new Response(null)
        }
      })
    await Promise.all([run(first.promise), run(second.promise)])
    expect(controller.getMetrics().active).toBe(CONCURRENT_OPERATIONS)
    first.resolve('done')
    await vi.waitFor(() => expect(controller.getMetrics().active).toBe(1))
    second.reject(new Error('backend failed'))
    await vi.waitFor(() => expect(controller.getMetrics().active).toBe(0))
  })

  it('refuses backend work started after abort and leaves ordinary operations alone', async () => {
    const controller = new AbortController()
    const log = vi.spyOn(console, 'error').mockReturnValue()
    const run = vi.fn<() => string>(() => 'data')
    const observe = vi.fn<(operation: Promise<unknown>) => void>()
    await withPublicationScope({
      signal: controller.signal,
      isActive: () => true,
      observe,
      run: async () => {
        await Promise.resolve()
        controller.abort()
        expect(() => protectServerOperation({ run })).toThrow(
          'The request could not be completed.'
        )
      }
    })
    expect({
      backend: run.mock.calls,
      observed: observe.mock.calls,
      log: log.mock.calls
    }).toStrictEqual({ backend: [], observed: [], log: [] })
    expect(protectServerOperation({ run })).toBe('data')
    expect(run).toHaveBeenCalledOnce()
  })

  it('refuses detached backend work after its publication has completed', async () => {
    const controller = createPublicationController()
    const gate = Promise.withResolvers<boolean>()
    const delayed = Promise.withResolvers<Promise<void>>()
    const backend = vi.fn<() => string>(() => 'data')
    async function later(): Promise<void> {
      await gate.promise
      protectServerOperation({ run: backend })
    }
    await controller.runPublication({
      kind: 'markdown',
      timeoutMs: 1000,
      maxOutputBytes: 100,
      run: () => {
        delayed.resolve(later())
        return new Response(null)
      }
    })
    expect(controller.getMetrics().active).toBe(0)
    gate.resolve(true)
    await expect(delayed.promise).rejects.toThrow(
      'The request could not be completed.'
    )
    expect(backend).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'o motivo do cancelamento', isCancellation: true },
    { name: 'outro erro', isCancellation: false }
  ])(
    'registra a falha da leitura abortada só quando ela não é cancelamento: $name',
    async ({ isCancellation }) => {
      vi.stubEnv('DEV', false)
      const log = vi.spyOn(console, 'error').mockReturnValue()
      const controller = new AbortController()
      await withPublicationScope({
        signal: controller.signal,
        isActive: () => true,
        observe: vi.fn<(operation: Promise<unknown>) => void>(),
        run: async () => {
          const backend = Promise.withResolvers<never>()
          const pending = protectServerOperation({ run: () => backend.promise })
          const reason = new Error('publication cancelled')
          controller.abort(reason)
          backend.reject(isCancellation ? reason : new Error('backend failed'))
          await expect(pending).rejects.toThrow(
            'The request could not be completed.'
          )
        }
      })
      expect(log).toHaveBeenCalledTimes(isCancellation ? 0 : 1)
    }
  )
})
