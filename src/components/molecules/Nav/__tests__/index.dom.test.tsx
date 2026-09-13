import { renderWithProviders } from '@/tests/providers/component/index.tsx'

import { Nav } from '../index.tsx'

describe('navegação principal', () => {
  it.each([
    { label: 'Início', href: '/' },
    { label: 'Página de erro', href: '/404' }
  ])('aponta $label para $href usando o router', ({ label, href }) => {
    const host = renderWithProviders(() => <Nav />)

    const link = [...host.querySelectorAll('a')].find(
      anchor => anchor.textContent === label
    )

    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', href)
  })

  it('rotula a navegação para leitores de tela', () => {
    const host = renderWithProviders(() => <Nav />)

    expect(host.querySelector('nav')).toHaveAccessibleName(
      'Navegação principal'
    )
  })
})
