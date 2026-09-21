import { SITE } from '@/constants/site.ts'

import { resolveRouteSeo } from '../index.ts'

describe('resolução dos metadados de SEO na cadeia de rotas', () => {
  const defaults = {
    title: SITE.title,
    description: SITE.description,
    noindex: false,
    type: 'website',
    image: SITE.image
  }

  it('usa os valores de SITE quando nenhuma rota declara metadados', () => {
    expect(resolveRouteSeo([])).toStrictEqual(defaults)
    expect(resolveRouteSeo([undefined, {}])).toStrictEqual(defaults)
  })

  it('sobrescreve campo a campo, da rota mais genérica para a mais específica', () => {
    const seo = resolveRouteSeo([
      { title: 'Documentação', description: 'Guias do projeto.' },
      undefined,
      { title: 'Visão geral' },
      { noindex: true }
    ])

    expect(seo).toStrictEqual({
      ...defaults,
      title: 'Visão geral',
      description: 'Guias do projeto.',
      noindex: true
    })
  })

  it('herda o tipo do layout e mescla a imagem atributo a atributo', () => {
    const seo = resolveRouteSeo([
      { type: 'article', image: { path: '/images/blog.png' } },
      { image: { alt: 'Capa do artigo' } }
    ])

    expect(seo.type).toBe('article')
    expect(seo.image).toStrictEqual({
      path: '/images/blog.png',
      width: SITE.image.width,
      height: SITE.image.height,
      alt: 'Capa do artigo'
    })
  })

  it('mescla as datas de artigo e omite a chave quando ninguém as declara', () => {
    const seo = resolveRouteSeo([
      { type: 'article', article: { datePublished: '2026-09-01' } },
      { article: { dateModified: '2026-09-21', datePublished: undefined } }
    ])

    expect(seo.article).toStrictEqual({
      datePublished: '2026-09-01',
      dateModified: '2026-09-21'
    })
    expect('article' in resolveRouteSeo([{ type: 'article' }])).toBe(false)
  })

  it('não compartilha o objeto de imagem de SITE com o resultado', () => {
    const seo = resolveRouteSeo([])
    seo.image.alt = 'alterado'

    expect(SITE.image.alt).not.toBe('alterado')
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
