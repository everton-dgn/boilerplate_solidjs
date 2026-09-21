import type { LlmsPage } from '@/@types/llms.ts'

import { buildLlmsText } from '../index.ts'

type PageOverrides = Partial<LlmsPage> & Pick<LlmsPage, 'path'>

function page(overrides: PageOverrides): LlmsPage {
  return {
    title: overrides.path,
    description: '',
    section: 'Páginas',
    optional: false,
    ...overrides
  }
}

describe('geração do llms.txt', () => {
  it('publica título, resumo e a lista de páginas com URLs absolutas', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Resumo do site.',
      pages: [page({ path: '/' }), page({ path: '/docs' })],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(
      [
        '# Site',
        '',
        '> Resumo do site.',
        '',
        '## Páginas',
        '',
        '- [/](https://example.com/)',
        '- [/docs](https://example.com/docs)',
        ''
      ].join('\n')
    )
  })

  it('publica só o cabeçalho quando nenhuma página foi selecionada', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Resumo do site.',
      pages: [],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(['# Site', '', '> Resumo do site.', ''].join('\n'))
  })

  it('agrupa por seção na ordem do manifesto e publica as opcionais por último', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Resumo do site.',
      pages: [
        page({ path: '/', title: 'Início', description: 'Apresentação.' }),
        page({ path: '/docs/a', title: 'A', section: 'Guias' }),
        page({ path: '/changelog', title: 'Changelog', optional: true }),
        page({ path: '/about', title: 'Sobre' }),
        page({ path: '/docs/b', title: 'B', section: 'Guias', optional: true })
      ],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(
      [
        '# Site',
        '',
        '> Resumo do site.',
        '',
        '## Páginas',
        '',
        '- [Início](https://example.com/): Apresentação.',
        '- [Sobre](https://example.com/about)',
        '',
        '## Guias',
        '',
        '- [A](https://example.com/docs/a)',
        '',
        '## Optional',
        '',
        '- [Changelog](https://example.com/changelog)',
        '- [B](https://example.com/docs/b)',
        ''
      ].join('\n')
    )
  })

  it('escapa só o que quebra a estrutura e mantém o restante legível', () => {
    const text = buildLlmsText({
      title: 'Site [beta]\nTítulo',
      description: 'Resumo\ncom *ênfase* e <tags>.',
      pages: [
        page({
          path: '/docs(v2)',
          title: 'Guia [v2]\r\nExemplos',
          description: 'Use `code`\ncom _cuidado_.',
          section: 'C++ [API]'
        })
      ],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(
      [
        String.raw`# Site \[beta\] Título`,
        '',
        '> Resumo com *ênfase* e <tags>.',
        '',
        String.raw`## C++ \[API\]`,
        '',
        '- [Guia \\[v2\\] Exemplos](https://example.com/docs%28v2%29): Use \\`code\\` com _cuidado_.',
        ''
      ].join('\n')
    )
  })

  it('impede que crases e autolinks no rótulo absorvam o fechamento do link', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Resumo.',
      pages: [
        page({
          path: '/guia',
          title: 'Como usar `',
          description: 'O caractere ` abre código.'
        }),
        page({ path: '/tipos', title: 'Lista<T> e <https://x.test>' })
      ],
      siteUrl: 'https://example.com'
    })

    expect(text).toContain(
      '- [Como usar \\`](https://example.com/guia): O caractere \\` abre código.\n'
    )
    expect(text).toContain(
      '- [Lista\\<T\\> e \\<https://x.test\\>](https://example.com/tipos)\n'
    )
  })

  it('funde uma seção chamada Optional ao bucket opcional, sempre por último', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Resumo.',
      pages: [
        page({ path: '/a', title: 'A', section: 'Optional' }),
        page({ path: '/b', title: 'B', section: 'Guias' }),
        page({ path: '/c', title: 'C', optional: true })
      ],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(
      [
        '# Site',
        '',
        '> Resumo.',
        '',
        '## Guias',
        '',
        '- [B](https://example.com/b)',
        '',
        '## Optional',
        '',
        '- [A](https://example.com/a)',
        '- [C](https://example.com/c)',
        ''
      ].join('\n')
    )
  })

  it('omite o separador quando a descrição da página está em branco', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Resumo do site.',
      pages: [page({ path: '/', title: 'Início', description: ' \n ' })],
      siteUrl: 'https://example.com'
    })

    expect(text).toContain('- [Início](https://example.com/)\n')
    expect(text).not.toContain('):')
  })
})
