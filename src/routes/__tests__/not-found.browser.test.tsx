import { renderWithProviders } from '@/tests/providers/component'

import NotFound from '../not-found.tsx'

describe('página não encontrada', () => {
  it('mostra o erro e oferece um link para o início', async () => {
    const host = renderWithProviders(() => <NotFound />)

    expect(host.querySelector('h1')?.textContent).toBe('404')
    expect(host.textContent).toContain('Essa página não existe.')
    await expect
      .poll(() => host.querySelector('a')?.getAttribute('href'))
      .toBe('/')
    expect(host.querySelector('a')?.textContent).toBe('Voltar para o início')
  })
})
