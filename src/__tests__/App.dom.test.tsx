import { render, type JSX } from '@solidjs/web'
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

  const [layout] = manifest.pageRoutes

  for (const route of layout.children) {
    if (route.id === '/(home)/') {
      route.$component.import = () =>
        Promise.resolve({
          default: renderHome,
          route: route.$$route.require().route
        })
    }
  }

  return manifest
})

// Prazo do aquecimento: cobre o carregamento a frio dos módulos, não o
// comportamento verificado pelos casos.
const WARM_UP_TIMEOUT_MS = 5000

// TODO: Em desenvolvimento, o Errored do Solid registra no console o erro que a
// boundary capturou quando o fallback não recebe
// parâmetros. O teste fixa esse comportamento em vez de deixá-lo no stderr.
function expectBoundaryReport(message: string): void {
  const { calls } = vi.mocked(console.error).mock
  expect(calls).toHaveLength(1)
  const reported: unknown = calls[0]?.[0]
  expect(reported).toBeInstanceOf(Error)
  expect(reported).toHaveProperty('message', message)
}

describe('feedback de erro da aplicação', () => {
  // O primeiro render do Router carrega as rotas lazy. Sem aquecimento, esse
  // custo cai no primeiro caso que chega ao layout e estoura o expect.poll
  // quando a suíte roda em paralelo com cobertura.
  beforeAll(async () => {
    const consoleError = vi.spyOn(console, 'error')
    renderHome.mockReturnValue(<h1>Página inicial</h1>)
    const host = document.createElement('div')
    document.body.append(host)
    const dispose = render(
      () => (
        <Loading>
          <App />
        </Loading>
      ),
      host
    )
    try {
      await vi.waitFor(
        () => {
          assert(
            host.querySelector('h1'),
            'A página inicial precisa renderizar'
          )
        },
        { timeout: WARM_UP_TIMEOUT_MS }
      )
      assert.lengthOf(
        consoleError.mock.calls,
        0,
        'O aquecimento não pode reportar erros'
      )
    } finally {
      dispose()
      host.remove()
      renderHome.mockReset()
      consoleError.mockRestore()
    }
  })
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

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
      expectBoundaryReport('Detalhe interno que não deve aparecer')
    }
  )
})
