import { SITE } from '@/constants/site.ts'

import { resolveRouteSeo } from '../index.ts'

describe('resolução dos metadados de SEO na cadeia de rotas', () => {
  it('usa os valores de SITE quando nenhuma rota declara metadados', () => {
    expect(resolveRouteSeo([])).toStrictEqual({
      title: SITE.title,
      description: SITE.description,
      noindex: false
    })
    expect(resolveRouteSeo([undefined, {}])).toStrictEqual({
      title: SITE.title,
      description: SITE.description,
      noindex: false
    })
  })

  it('sobrescreve campo a campo, da rota mais genérica para a mais específica', () => {
    const seo = resolveRouteSeo([
      { title: 'Documentação', description: 'Guias do projeto.' },
      undefined,
      { title: 'Visão geral' },
      { noindex: true }
    ])

    expect(seo).toStrictEqual({
      title: 'Visão geral',
      description: 'Guias do projeto.',
      noindex: true
    })
  })

  it('permite que a rota filha reative a indexação com noindex: false', () => {
    const seo = resolveRouteSeo([{ noindex: true }, { noindex: false }])

    expect(seo.noindex).toBe(false)
  })

  it('não altera os objetos recebidos', () => {
    const layout = { title: 'Layout' }
    const child = { description: 'Filha.' }

    resolveRouteSeo([layout, child])

    expect(layout).toStrictEqual({ title: 'Layout' })
    expect(child).toStrictEqual({ description: 'Filha.' })
  })
})
