import {
  createRouter,
  memoryHistory,
  useLocation,
  useNavigate
} from '@solidjs/router'
import { flush } from 'solid-js'
import type { MockInstance } from 'vite-plus/test'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import {
  claimOutdatedPageReload,
  createOutdatedPageGuard,
  isVersionError,
  markPageOutdated,
  recordChunkFailure
} from '../index.ts'

type Navigate = ReturnType<typeof useNavigate>
type GuardedRouter = { host: HTMLDivElement; navigate: () => Navigate }
type LocationWrite = MockInstance<(url: string | URL) => void>
type DocumentNavigation = { assign: LocationWrite; replace: LocationWrite }

const RELOAD_WINDOW_MS = 30_000
const START_MS = 1_000_000

type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>

function throwBlocked(): never {
  throw new DOMException('Bloqueado', 'SecurityError')
}

function readNothing(): null {
  return null
}

function writeNothing(): void {
  /* A escrita não importa quando a leitura já foi recusada. */
}

function spyDocumentNavigation(): DocumentNavigation {
  return {
    assign: vi.spyOn(globalThis.location, 'assign').mockImplementation(() => {
      /* Permanece no documento do teste. */
    }),
    replace: vi.spyOn(globalThis.location, 'replace').mockImplementation(() => {
      /* Permanece no documento do teste. */
    })
  }
}

async function renderGuardedRouter(
  history = memoryHistory('/en/start')
): Promise<GuardedRouter> {
  let navigate: Navigate | undefined
  function Page() {
    navigate = useNavigate()
    const location = useLocation()
    return (
      <output>
        {location.pathname}
        {location.search}
      </output>
    )
  }
  const Router = createRouter({
    history,
    routes: [{ path: '*all', component: Page }]
  })
  const host = renderComponent(
    () => (
      <Router>
        {props => {
          createOutdatedPageGuard()
          return props.children
        }}
      </Router>
    ),
    { providers: false }
  )
  await expect.poll(() => host.textContent).toBe('/en/start')
  return {
    host,
    navigate: () => {
      assert(navigate)
      return navigate
    }
  }
}

// A marca vale até a próxima carga de documento e não volta atrás no módulo.
// O caso da aba ainda atual fica em outdatedPage.initial.dom.test.tsx, que
// carrega o módulo isolado.
describe('guard de página desatualizada', () => {
  beforeEach(markPageOutdated)

  it('troca por documento a navegação que muda o caminho', async () => {
    const { assign } = spyDocumentNavigation()
    const { host, navigate } = await renderGuardedRouter()
    navigate()('/en/other?q=1#part')
    flush()
    expect(assign).toHaveBeenCalledWith(
      `${globalThis.location.origin}/en/other?q=1#part`
    )
    expect(host.textContent).toBe('/en/start')
  })

  it('preserva o replace na navegação de documento', async () => {
    const { assign, replace } = spyDocumentNavigation()
    const { navigate } = await renderGuardedRouter()
    navigate()('/en/other', { replace: true })
    flush()
    expect(replace).toHaveBeenCalledWith(
      `${globalThis.location.origin}/en/other`
    )
    expect(assign).not.toHaveBeenCalled()
  })

  it.each([
    ['a query', '/en/start?q=1', '/en/start?q=1'],
    ['o hash', '/en/start#part', '/en/start'],
    ['o idioma do mesmo caminho', '/pt/start', '/pt/start']
  ])('deixa no client a troca só de %s', async (_change, href, rendered) => {
    const { assign, replace } = spyDocumentNavigation()
    const { host, navigate } = await renderGuardedRouter()
    navigate()(href)
    await expect.poll(() => host.textContent).toBe(rendered)
    expect(assign).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('deixa no client o voltar entre entradas do mesmo documento', async () => {
    const { assign, replace } = spyDocumentNavigation()
    const history = memoryHistory('/en/start')
    const { host, navigate } = await renderGuardedRouter(history)
    navigate()('/en/start?q=1')
    await expect.poll(() => host.textContent).toBe('/en/start?q=1')
    history.back()
    await expect.poll(() => host.textContent).toBe('/en/start')
    expect(assign).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('deixa a navegação no client sem conexão', async () => {
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(false)
    const { assign } = spyDocumentNavigation()
    const { host, navigate } = await renderGuardedRouter()
    navigate()('/en/next')
    await expect.poll(() => host.textContent).toBe('/en/next')
    expect(assign).not.toHaveBeenCalled()
  })
})

describe('reconhecimento de erro de versão', () => {
  it('reconhece a falha de chunk registrada e a função desconhecida', () => {
    const chunkFailure = new TypeError('Failed to fetch module')
    const unknownFunction = Object.assign(new Error('Recusada'), {
      unknownFunction: true
    })
    recordChunkFailure(chunkFailure)
    expect(isVersionError(chunkFailure)).toBe(true)
    expect(isVersionError(unknownFunction)).toBe(true)
  })

  it.each([
    ['um erro comum', new Error('Detalhe interno')],
    ['um erro com unknownFunction falso', { unknownFunction: false }],
    ['uma string', 'falha'],
    ['undefined', undefined]
  ])('recusa %s', (_case, error) => {
    expect(isVersionError(error)).toBe(false)
  })
})

describe('trava da recarga automática', () => {
  beforeEach(() => {
    globalThis.sessionStorage.clear()
  })

  it('libera uma recarga por janela e volta a liberar depois dela', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(START_MS)
    expect(claimOutdatedPageReload()).toBe(true)
    expect(claimOutdatedPageReload()).toBe(false)
    now.mockReturnValue(START_MS + RELOAD_WINDOW_MS - 1)
    expect(claimOutdatedPageReload()).toBe(false)
    now.mockReturnValue(START_MS + RELOAD_WINDOW_MS)
    expect(claimOutdatedPageReload()).toBe(true)
  })

  it.each([
    ['não numérica', 'x'],
    ['no futuro', String(Number.MAX_SAFE_INTEGER)]
  ])('libera a recarga com a marca %s', (_case, stored) => {
    globalThis.sessionStorage.setItem('outdated-page-reload', stored)
    expect(claimOutdatedPageReload()).toBe(true)
  })

  // O Storage do happy-dom é um Proxy que não desfaz o spy; o stub global é
  // restaurado entre os casos.
  it.each([
    ['a leitura', { getItem: throwBlocked, setItem: writeNothing }],
    ['a escrita', { getItem: readNothing, setItem: throwBlocked }]
  ])(
    'não recarrega quando o sessionStorage recusa %s',
    (_case, storage: StorageAccess) => {
      vi.stubGlobal('sessionStorage', storage)
      expect(claimOutdatedPageReload()).toBe(false)
    }
  )

  it('não recarrega sem conexão', () => {
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(false)
    expect(claimOutdatedPageReload()).toBe(false)
    expect(globalThis.sessionStorage.getItem('outdated-page-reload')).toBeNull()
  })
})
