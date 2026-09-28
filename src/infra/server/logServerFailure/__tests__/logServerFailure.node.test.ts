import { logServerFailure } from '../index.ts'

describe('log fixo de falhas do servidor', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

  it.each([
    [
      'server-operation',
      '[server-operation] Unexpected failure; private details omitted'
    ],
    [
      'server-error',
      '[server-error] Unexpected failure; private details omitted'
    ]
  ] as const)('registra %s com um único argumento fixo', (source, message) => {
    logServerFailure(source)
    expect(console.error).toHaveBeenCalledExactlyOnceWith(message)
  })
})
