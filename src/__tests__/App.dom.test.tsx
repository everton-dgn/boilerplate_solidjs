import type { JSX } from '@solidjs/web'
import { Loading } from 'solid-js'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import App from '../App.tsx'

const { renderHome, checkProvider, checkTopbar } = vi.hoisted(() => ({
  renderHome: vi.fn<() => JSX.Element>(),
  checkProvider: vi.fn<() => void>(),
  checkTopbar: vi.fn<() => void>()
}))

vi.mock(
  import('../components/atoms/Provider/index.tsx'),
  async importOriginal => {
    const { Provider } = await importOriginal()
    return {
      Provider: (props: Parameters<typeof Provider>[0]) => {
        checkProvider()
        return <Provider {...props} />
      }
    }
  }
)

vi.mock(
  import('../components/molecules/Topbar/index.tsx'),
  async importOriginal => {
    const { Topbar } = await importOriginal()
    return {
      Topbar: () => {
        checkTopbar()
        return <Topbar />
      }
    }
  }
)

vi.mock(import('virtual:file-routes'), async importOriginal => {
  const manifest = await importOriginal()

  for (const route of manifest.pageRoutes) {
    if (route.path === '/') {
      route.$component.import = () => Promise.resolve({ default: renderHome })
    }
  }

  return manifest
})

describe('feedback de erro da aplicação', () => {
  it.each([
    ['provider', checkProvider],
    ['topbar', checkTopbar],
    ['rota', renderHome]
  ] as const)(
    'oferece recarregamento após falha em %s',
    async (_name, check) => {
      onTestFinished(() => {
        check.mockReset()
        renderHome.mockReset()
      })
      renderHome.mockReturnValue(<h1>Página inicial</h1>)
      check.mockImplementation(() => {
        throw new Error('Detalhe interno que não deve aparecer')
      })

      const host = renderComponent(
        () => (
          <Loading>
            <App />
          </Loading>
        ),
        { providers: false }
      )

      await expect
        .poll(() => host.querySelector('h1')?.textContent)
        .toBe('Algo deu errado!')
      expect(host.textContent).not.toContain('Detalhe interno')

      expect(host.querySelector('header')).toBeNull()
      const reload = host.querySelector<HTMLAnchorElement>(
        '[data-error-variant="runtime"] a'
      )
      assert(reload, 'A falha precisa permitir recarregar a página')
      expect(reload.textContent).toBe('Recarregar página')
      expect(reload.href).toBe(globalThis.location.href)
      expect(reload.target).toBe('_self')
    }
  )
})
