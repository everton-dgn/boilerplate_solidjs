import { renderWithProviders } from '@/tests/providers/component/index.tsx'

import { getServerInfo } from '../../api.ts'
import Home from '../index.tsx'

vi.mock(import('../../api.ts'), () => ({
  getServerInfo: vi.fn<typeof getServerInfo>()
}))

describe('contador', () => {
  it.each([
    { result: 'Node de teste', error: undefined, expected: 'Node de teste' },
    {
      result: undefined,
      error: new Error('Servidor indisponível'),
      expected: 'Servidor indisponível'
    },
    {
      result: undefined,
      error: 'falha desconhecida',
      expected: 'Erro ao chamar o servidor'
    }
  ])(
    'exibe o resultado da chamada: $expected',
    async ({ result, error, expected }) => {
      if (result === undefined) {
        vi.mocked(getServerInfo).mockRejectedValueOnce(error)
      } else {
        vi.mocked(getServerInfo).mockResolvedValueOnce(result)
      }
      const host = renderWithProviders(() => <Home />)
      const button = host.querySelectorAll('button').item(1)
      button.click()

      await expect.poll(() => host.textContent).toContain(expected)
      expect(getServerInfo).toHaveBeenCalledExactlyOnceWith()
    }
  )

  it('incrementa o contador', async () => {
    const host = renderWithProviders(() => <Home />)

    const button = host.querySelector('button.counter')

    if (!(button instanceof HTMLButtonElement)) {
      throw new TypeError('Counter button not found')
    }

    button.click()

    await expect.poll(() => button.textContent).toBe('Count is 1')
  })
})
