import { provideRequestEvent } from '@solidjs/web/storage'

import { getServerInfo } from './api.ts'

describe('informações do servidor', () => {
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
