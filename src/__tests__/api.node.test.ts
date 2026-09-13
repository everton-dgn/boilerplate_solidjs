import { provideRequestEvent } from '@solidjs/web/storage'

import { getServerInfo } from '../api.ts'

describe('informações do servidor', () => {
  it('usa o identificador padrão sem contexto de requisição', async () => {
    await expect(getServerInfo()).resolves.toBe(
      `Node ${process.version} · request sem id`
    )
  })

  it('usa o identificador padrão quando locals não contém requestId', async () => {
    const result = provideRequestEvent(
      {
        request: new Request('http://localhost'),
        locals: {},
        response: { headers: new Headers() }
      },
      getServerInfo
    )

    await expect(result).resolves.toBe(
      `Node ${process.version} · request sem id`
    )
  })

  it('executa em Node sem carregar um ambiente DOM', () => {
    expect(globalThis).not.toHaveProperty('window')
    expect(globalThis).not.toHaveProperty('document')
  })

  it('retorna as informações do servidor', async () => {
    const result = provideRequestEvent(
      {
        request: new Request('http://localhost'),
        locals: { requestId: 'test-request' },
        response: { headers: new Headers() }
      },
      getServerInfo
    )

    await expect(result).resolves.toBe(
      `Node ${process.version} · request test-request`
    )
  })
})
