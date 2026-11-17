import { render } from '@solidjs/web'
import {
  configureServerFunctionsClient,
  createServerReference,
  GET,
  UNKNOWN_HEADER
} from '@solidjs/web/server-functions/client'
import {
  createEffect,
  createRoot,
  Errored,
  flush,
  lazy,
  Loading,
  untrack
} from 'solid-js'

import {
  OUTDATED_FALLBACK_EVENT,
  REFUSED_SUBMIT_EVENT
} from '@/constants/outdated-page.ts'

import { installOutdatedPageDetection } from '../index.ts'

const { markPageOutdated, recordChunkFailure } = vi.hoisted(() => ({
  markPageOutdated: vi.fn<() => void>(),
  recordChunkFailure: vi.fn<(error: unknown) => void>()
}))

vi.mock(
  import('@/primitives/createOutdatedPageGuard/index.ts'),
  async importOriginal => ({
    ...(await importOriginal()),
    markPageOutdated,
    recordChunkFailure
  })
)

const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_INTERNAL_SERVER_ERROR = 500

type Answer = { status: number; isLabelled: boolean }
type ThrowerProps = { error: unknown }
// The real registration feeds the same WeakSet that isVersionError reads.
type OutdatedPageActual = { recordChunkFailure: (error: unknown) => void }

function waitForNextTask(): Promise<unknown> {
  const { promise, resolve } = Promise.withResolvers<unknown>()
  setTimeout(resolve, 0, null)
  return promise
}

function answerWith({ status, isLabelled }: Answer): void {
  configureServerFunctionsClient({
    fetch: () =>
      new Response(null, {
        status,
        headers: isLabelled ? { [UNKNOWN_HEADER]: 'true' } : {}
      })
  })
}

function countEvents(type: string): () => number {
  let count = 0
  function listener(): void {
    count += 1
  }
  globalThis.addEventListener(type, listener)
  onTestFinished(() => {
    globalThis.removeEventListener(type, listener)
  })
  return () => count
}

function Thrower(props: ThrowerProps): never {
  throw untrack(() => props.error)
}

function renderInsideLocalBoundary(error: unknown): void {
  const host = document.createElement('div')
  document.body.append(host)
  const dispose = render(
    () => (
      <Errored fallback={<p>Refused part</p>}>
        <Thrower error={error} />
      </Errored>
    ),
    host
  )
  onTestFinished(() => {
    dispose()
    host.remove()
  })
}

// The render calls the read inside a tracked computation; the compute phase of
// the effect reproduces that call site.
function callInsideComputation(call: () => Promise<unknown>): Promise<unknown> {
  let pending: Promise<unknown> | undefined
  createRoot(dispose => {
    onTestFinished(dispose)
    createEffect(
      () => {
        pending = call()
      },
      () => {
        /* The call already happened in the compute phase. */
      }
    )
  })
  flush()
  assert(pending)
  return pending
}

describe('outdated page detection', () => {
  // The returned disposal becomes the teardown of beforeAll.
  beforeAll(installOutdatedPageDetection)

  afterEach(() => {
    configureServerFunctionsClient({ fetch: null })
  })

  it.each([HTTP_CONFLICT, HTTP_NOT_FOUND])(
    'warns about the submission refused with %i and keeps the unknownFunction rejection',
    async status => {
      const events = countEvents(REFUSED_SUBMIT_EVENT)
      answerWith({ status, isLabelled: true })
      const save = createServerReference('save-1')
      await expect(save()).rejects.toMatchObject({
        unknownFunction: true,
        status
      })
      expect(events()).toBe(1)
      expect(markPageOutdated).toHaveBeenCalledOnce()
    }
  )

  it('marks the page on the read declared with GET, without warning', async () => {
    const events = countEvents(REFUSED_SUBMIT_EVENT)
    answerWith({ status: HTTP_NOT_FOUND, isLabelled: true })
    const read = GET(createServerReference('read-1'))
    await expect(read()).rejects.toMatchObject({ unknownFunction: true })
    expect(events()).toBe(0)
    expect(markPageOutdated).toHaveBeenCalledOnce()
  })

  it('marks the page on the call made in a tracked computation, without warning', async () => {
    const events = countEvents(REFUSED_SUBMIT_EVENT)
    answerWith({ status: HTTP_NOT_FOUND, isLabelled: true })
    const read = createServerReference('read-2')
    await expect(callInsideComputation(() => read())).rejects.toMatchObject({
      unknownFunction: true
    })
    expect(events()).toBe(0)
    expect(markPageOutdated).toHaveBeenCalledOnce()
  })

  it.each([
    { status: HTTP_CONFLICT, isLabelled: false },
    { status: HTTP_INTERNAL_SERVER_ERROR, isLabelled: true }
  ])(
    'ignores the $status response outside the version contract',
    async answer => {
      const events = countEvents(REFUSED_SUBMIT_EVENT)
      answerWith(answer)
      const save = createServerReference('save-2')
      await expect(save()).rejects.toMatchObject({ status: answer.status })
      expect(events()).toBe(0)
      expect(markPageOutdated).not.toHaveBeenCalled()
    }
  )

  it('records the chunk failure without cancelling the event', () => {
    const failure = new TypeError('Failed to fetch dynamically imported module')
    const event = Object.assign(
      new Event('vite:preloadError', { cancelable: true }),
      { payload: failure }
    )
    globalThis.dispatchEvent(event)
    expect(recordChunkFailure).toHaveBeenCalledWith(failure)
    expect(event.defaultPrevented).toBe(false)
  })

  it('removes the listener and the handler on disposal', async () => {
    // The listener is the same function: disposing this installation removes the only one.
    const dispose = installOutdatedPageDetection()
    dispose()
    onTestFinished(() => {
      installOutdatedPageDetection()
    })
    const events = countEvents(REFUSED_SUBMIT_EVENT)
    globalThis.dispatchEvent(new Event('vite:preloadError'))
    answerWith({ status: HTTP_CONFLICT, isLabelled: true })
    const save = createServerReference('save-3')
    await expect(save()).rejects.toMatchObject({ unknownFunction: true })
    expect(events()).toBe(0)
    expect(recordChunkFailure).not.toHaveBeenCalled()
    expect(markPageOutdated).not.toHaveBeenCalled()
  })
})

describe('notice for part of the page', () => {
  // The returned disposal becomes the teardown of beforeAll.
  beforeAll(installOutdatedPageDetection)

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {
      /* The development Errored reports the caught error. */
    })
  })

  it('warns once about the refusal caught by local Errored boundaries', async () => {
    const events = countEvents(OUTDATED_FALLBACK_EVENT)
    const refusal = Object.assign(new Error('Refused'), {
      unknownFunction: true
    })
    renderInsideLocalBoundary(refusal)
    renderInsideLocalBoundary(refusal)
    await expect.poll(events).toBe(1)
    await waitForNextTask()
    expect(events()).toBe(1)
  })

  it('warns about the recorded chunk failure', async () => {
    const actual = await vi.importActual<OutdatedPageActual>(
      '@/primitives/createOutdatedPageGuard/index.ts'
    )
    const events = countEvents(OUTDATED_FALLBACK_EVENT)
    const chunkFailure = new TypeError('Failed to fetch module')
    actual.recordChunkFailure(chunkFailure)
    renderInsideLocalBoundary(chunkFailure)
    await expect.poll(events).toBe(1)
  })

  it('warns once when the lazy import fails after the preload event', async () => {
    const actual = await vi.importActual<OutdatedPageActual>(
      '@/primitives/createOutdatedPageGuard/index.ts'
    )
    recordChunkFailure.mockImplementation(actual.recordChunkFailure)
    onTestFinished(() => {
      recordChunkFailure.mockReset()
    })
    const events = countEvents(OUTDATED_FALLBACK_EVENT)
    const failure = new TypeError('Failed to fetch dynamically imported module')
    const event = Object.assign(
      new Event('vite:preloadError', { cancelable: true }),
      { payload: failure }
    )
    const MissingChunk = lazy(async () => {
      try {
        await Promise.reject(failure)
      } catch (error) {
        globalThis.dispatchEvent(event)
        if (!event.defaultPrevented) throw error
      }
      return { default: () => <p>Import canceled</p> }
    })
    const host = document.createElement('div')
    document.body.append(host)
    const dispose = render(
      () => (
        <Errored fallback={<p>Refused part</p>}>
          <Loading fallback={<p>Loading</p>}>
            <MissingChunk />
          </Loading>
        </Errored>
      ),
      host
    )
    onTestFinished(() => {
      dispose()
      host.remove()
    })
    await expect.poll(() => host.textContent).toBe('Refused part')
    await expect.poll(events).toBe(1)
    await waitForNextTask()
    expect(event.defaultPrevented).toBe(false)
    expect(recordChunkFailure).toHaveBeenCalledExactlyOnceWith(failure)
    expect(events()).toBe(1)
  })

  it('ignores the error that is not a version error', async () => {
    const events = countEvents(OUTDATED_FALLBACK_EVENT)
    renderInsideLocalBoundary(new Error('Internal detail'))
    await waitForNextTask()
    expect(events()).toBe(0)
  })

  it('stops warning after disposal', async () => {
    const dispose = installOutdatedPageDetection()
    dispose()
    onTestFinished(() => {
      installOutdatedPageDetection()
    })
    const events = countEvents(OUTDATED_FALLBACK_EVENT)
    renderInsideLocalBoundary(
      Object.assign(new Error('Refused'), { unknownFunction: true })
    )
    await waitForNextTask()
    expect(events()).toBe(0)
  })
})
