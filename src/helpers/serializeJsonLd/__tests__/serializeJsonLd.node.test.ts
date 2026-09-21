import { serializeJsonLd } from '../index.ts'

describe('serialização de JSON-LD', () => {
  it('escapa HTML para não encerrar o script que envolve o JSON', () => {
    const json = serializeJsonLd({ description: '</script><b>&</b>' })

    expect(json).not.toMatch(/[<>&]/u)
    expect(JSON.parse(json)).toStrictEqual({ description: '</script><b>&</b>' })
  })

  it('preserva o restante do JSON sem alteração', () => {
    const json = serializeJsonLd({ '@type': 'Thing', name: 'Título', n: 1 })

    expect(json).toBe('{"@type":"Thing","name":"Título","n":1}')
  })
})
