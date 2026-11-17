import { render, type JSX } from '@solidjs/web'
import { Loading } from 'solid-js'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import App from '../App.tsx'
import { recordChunkFailure } from '../primitives/createOutdatedPageGuard/index.ts'

const { renderHome, checkProvider, checkTopbar } = vi.hoisted(() => ({
  renderHome: vi.fn<() => JSX.Element>(),
  checkProvider: vi.fn<() => void>(),
  checkTopbar: vi.fn<() => void>()
}))

vi.mock(
  import('../components/molecules/Provider/index.tsx'),
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
  import('../components/organisms/Topbar/index.tsx'),
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

// Warm-up deadline: covers the cold loading of the modules, not the behavior
// the cases check.
const WARM_UP_TIMEOUT_MS = 5000
// The root fallback replaces the blank screen with the error page in 10 s; the
// test checks one point before and another after the deadline.
const BEFORE_STALL_MS = 8000
const PAST_STALL_MS = 2000

// TODO: In development, Solid's Errored logs to the console the error that the
// boundary caught when the fallback receives no
// parameters. The test pins that behavior instead of leaving it in stderr.
function expectBoundaryReport(message: string): void {
  const { calls } = vi.mocked(console.error).mock
  expect(calls).toHaveLength(1)
  const reported: unknown = calls[0]?.[0]
  expect(reported).toBeInstanceOf(Error)
  expect(reported).toHaveProperty('message', message)
}

function renderApp(): HTMLDivElement {
  return renderComponent(
    () => (
      <Loading>
        <App />
      </Loading>
    ),
    { hasProviders: false }
  )
}

describe('application error feedback', () => {
  // The first render of the Router loads the lazy routes. Without a warm-up, that
  // cost falls on the first case that reaches the layout and exceeds expect.poll
  // when the suite runs in parallel with coverage.
  beforeAll(async () => {
    const consoleError = vi.spyOn(console, 'error')
    renderHome.mockReturnValue(<h1>Home page</h1>)
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
          assert(host.querySelector('h1'), 'The home page must render')
        },
        { timeout: WARM_UP_TIMEOUT_MS }
      )
      assert.lengthOf(
        consoleError.mock.calls,
        0,
        'The warm-up must not report errors'
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
  ] as const)('offers a reload after a failure in %s', async (_name, check) => {
    onTestFinished(() => {
      check.mockReset()
      renderHome.mockReset()
    })
    renderHome.mockReturnValue(<h1>Home page</h1>)
    check.mockImplementation(() => {
      throw new Error('Internal detail that must not appear')
    })

    const host = renderComponent(
      () => (
        <Loading>
          <App />
        </Loading>
      ),
      { hasProviders: false }
    )

    await expect
      .poll(() => host.querySelector('h1')?.textContent)
      .toBe('Something went wrong!')
    expect(host.textContent).not.toContain('Internal detail')

    expect(host.querySelector('header')).toBeNull()
    const reload = host.querySelector<HTMLAnchorElement>(
      '[data-error-variant="runtime"] a'
    )
    assert(reload, 'The failure must allow reloading the page')
    expect(reload.textContent).toBe('Reload page')
    expect(reload.href).toBe(globalThis.location.href)
    expect(reload.target).toBe('_self')
    expectBoundaryReport('Internal detail that must not appear')
  })

  it('reloads once on a version error and shows the error page if it comes back', async () => {
    globalThis.sessionStorage.clear()
    const reload = vi
      .spyOn(globalThis.location, 'reload')
      .mockImplementation(() => {
        /* Stays in the test document. */
      })
    onTestFinished(() => {
      renderHome.mockReset()
    })
    renderHome.mockImplementation(() => {
      throw Object.assign(new Error('Function outside the build'), {
        unknownFunction: true
      })
    })
    const recovering = renderApp()
    await expect.poll(() => reload.mock.calls.length).toBe(1)
    expect(recovering.textContent).toBe('')

    const failing = renderApp()
    await expect
      .poll(() => failing.querySelector('h1')?.textContent)
      .toBe('Something went wrong!')
    expect(reload).toHaveBeenCalledOnce()
  })

  it('reloads when the incoming error is the recorded chunk failure', async () => {
    globalThis.sessionStorage.clear()
    const reload = vi
      .spyOn(globalThis.location, 'reload')
      .mockImplementation(() => {
        /* Stays in the test document. */
      })
    onTestFinished(() => {
      renderHome.mockReset()
    })
    // The preload helper dispatches the same error that the import rejects.
    const chunkFailure = new TypeError(
      'Failed to fetch dynamically imported module'
    )
    recordChunkFailure(chunkFailure)
    renderHome.mockImplementation(() => {
      throw chunkFailure
    })
    const recovering = renderApp()
    await expect.poll(() => reload.mock.calls.length).toBe(1)
    expect(recovering.textContent).toBe('')
  })

  it('shows the error page if the reload does not replace the document', async () => {
    globalThis.sessionStorage.clear()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    onTestFinished(() => {
      vi.useRealTimers()
      renderHome.mockReset()
    })
    // A beforeunload that cancels the reload leaves the document in place.
    const reload = vi
      .spyOn(globalThis.location, 'reload')
      .mockImplementation(() => {
        /* Stays in the test document. */
      })
    renderHome.mockImplementation(() => {
      throw Object.assign(new Error('Function outside the build'), {
        unknownFunction: true
      })
    })
    const host = renderApp()
    await vi.waitFor(() => {
      expect(reload).toHaveBeenCalledOnce()
    })
    await vi.advanceTimersByTimeAsync(BEFORE_STALL_MS)
    expect(host.textContent).toBe('')
    await vi.advanceTimersByTimeAsync(PAST_STALL_MS)
    expect(host.querySelector('h1')?.textContent).toBe('Something went wrong!')
  })
})
