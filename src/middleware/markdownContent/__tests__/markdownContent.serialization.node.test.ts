import type { StartMiddleware } from '@solidjs/vite-plugin'
import {
  configureServerErrors,
  createComponent,
  createRequestEvent,
  createSSRResponse,
  redirect,
  renderToStream,
  ssr
} from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import {
  createMemo,
  Errored,
  Loading,
  NotReadyError,
  onCleanup
} from 'solid-js'
import { sharedConfig } from 'solid-js/internal'

import { createRenderIntegrity } from '@/infra/server/renderIntegrity/index.ts'
import { Router } from '@/router.ts'
import { throwValue } from '@/tests/helpers/failureValues/index.ts'
import { readLog } from '@/tests/helpers/readLog/index.ts'

import { markdownContent } from '../index.ts'

type FailurePhase = 'parse' | 'serialize'
type Timing = 'sync' | 'async' | 'defer'
type Scenario = {
  phase: FailurePhase
  timing: Timing
  shouldThrowCleanup: boolean
}
type RenderOptions = NonNullable<Parameters<typeof renderToStream>[1]>
type SerializerPlugin = NonNullable<RenderOptions['plugins']>[number]
type Event = Parameters<StartMiddleware>[0]
type ParsedValue = Record<string, never>
type ProbeOptions = {
  scenario?: Scenario
  shouldRecover?: boolean
  shouldThrowCleanup?: boolean
  boundaryFailure?: unknown
}
type ContainedCase = {
  name: string
  failure: unknown
  hookLogs: string[][]
  leaks: string[]
}

const PRIVATE_MARKER = 'PRIVATE_SERIALIZATION_FAILURE'
const PUBLIC_MESSAGE = 'Não foi possível concluir a solicitação.'
const LOG_MESSAGE = '[server-error] Unexpected failure; private details omitted'
const FAILURE_LOG_CLASSES = {
  parse: 'Error',
  serialize: 'SerovalSerializationError'
}
const DEADLINE_MS = 1000
const HTTP_OK = 200
const HTTP_SERVER_ERROR = 500
const CONTAINED_DIAGNOSTIC = '[SSR_RENDER_ERROR_CONTAINED]'
// Um redirect() capturado por um <Errored> aninhado também vira fallback.
const CONTAINED_CASES: ContainedCase[] = [
  {
    name: 'an Error',
    failure: new Error(PRIVATE_MARKER),
    hookLogs: [[LOG_MESSAGE, 'Error']],
    leaks: [PRIVATE_MARKER]
  },
  {
    name: 'a redirect',
    failure: redirect('/elsewhere'),
    hookLogs: [],
    leaks: []
  }
]

async function recover(failure: Error): Promise<string> {
  try {
    return await Promise.reject<string>(failure)
  } catch {
    return 'Recovered content'
  }
}

function page() {
  const data = createMemo(() => Promise.resolve('Resolved content'))
  return ssr(
    ['<main><h1>Public page</h1>', '</main>'],
    createComponent(Loading, {
      fallback: 'Pending content',
      get children() {
        return ssr(
          ['<p>', '</p>'],
          createMemo(() => data())
        )
      }
    })
  )
}

function makeProbe({
  scenario,
  shouldRecover = false,
  shouldThrowCleanup = scenario?.shouldThrowCleanup ?? false,
  boundaryFailure
}: ProbeOptions) {
  const controller = new AbortController()
  const event: Event = createRequestEvent(
    new Request('https://example.com/en/about.md', {
      headers: { accept: 'text/markdown' },
      signal: controller.signal
    })
  )
  const failure = new Error(PRIVATE_MARKER)
  const token = Object.freeze({ isProbe: true })
  const cleanup = vi.fn<() => void>(() => {
    if (shouldThrowCleanup) throw new Error('PRIVATE_CLEANUP_FAILURE')
  })
  const parse = vi.fn<() => ParsedValue>(() => {
    if (scenario?.phase === 'parse') throw failure
    return {}
  })
  const serialize = vi.fn<() => string>(() => {
    throw failure
  })
  const plugin: SerializerPlugin = {
    tag: 'markdown-serialization-failure',
    test: (value: unknown) => value === token,
    parse: { stream: parse },
    serialize,
    deserialize: () => token
  }
  const completed = vi.fn<() => void>()
  // Mesma fábrica da entrada; o hook global marca hasErrors.
  const { state, complete } = createRenderIntegrity()
  let render: ReturnType<typeof renderToStream> | undefined
  let html = ''

  function content() {
    onCleanup(cleanup)
    if (scenario) {
      const { context } = sharedConfig
      if (!context) throw new Error('Missing SSR context')
      context.serialize(
        'serialization-probe',
        scenario.timing === 'sync' ? token : Promise.resolve(token),
        scenario.timing === 'defer'
      )
    }
    if (boundaryFailure !== undefined) {
      return ssr(
        ['<main>', '</main>'],
        createComponent(Errored, {
          fallback: 'Contained fallback',
          get children(): string {
            return throwValue(boundaryFailure)
          }
        })
      )
    }
    if (shouldRecover) {
      const data = createMemo(() => recover(failure))
      return createComponent(Loading, {
        fallback: 'Pending content',
        get children() {
          return ssr(
            ['<main>', '</main>'],
            createMemo(() => data())
          )
        }
      })
    }
    return page()
  }

  async function next() {
    event.locals.ssrRenderState = state
    render = renderToStream(content, {
      signal: event.request.signal,
      plugins: [plugin],
      onCompleteAll() {
        completed()
        complete()
      }
    })
    html = await render
    return new Response(html, { headers: { 'content-type': 'text/html' } })
  }

  return {
    controller,
    event,
    cleanup,
    parse,
    serialize,
    completed,
    get html() {
      return html
    },
    get hasErrors() {
      return state.hasErrors
    },
    run: () => provideRequestEvent(event, () => markdownContent(event, next))
  }
}

function shellFailurePlugin(token: object): SerializerPlugin {
  return {
    tag: 'shell-serialization-failure',
    test: (value: unknown) => value === token,
    parse: {
      stream: () => {
        throw new Error(PRIVATE_MARKER)
      }
    },
    serialize: () => '{}',
    deserialize: () => token
  }
}

async function boundedResponse(probe: ReturnType<typeof makeProbe>) {
  const deadline = Promise.withResolvers<never>()
  const timeout = setTimeout(() => {
    deadline.reject(new Error('SSR did not settle after serialization failure'))
  }, DEADLINE_MS)
  try {
    return await Promise.race([probe.run(), deadline.promise])
  } finally {
    clearTimeout(timeout)
  }
}

describe('markdown with the installed SSR serializer', () => {
  beforeAll(async () => {
    vi.stubEnv('DEV', false)
    await import('@/infra/server/configureServerErrors/index.ts')
  })

  beforeEach(() => {
    vi.stubEnv('DEV', false)
    vi.spyOn(console, 'error').mockReturnValue()
    vi.spyOn(Router, 'match').mockReturnValue([
      {
        path: '/about',
        pattern: '/about',
        match: '/about',
        params: {},
        info: { markdown: true }
      }
    ])
  })

  afterAll(() => {
    configureServerErrors({})
  })

  it.each<Scenario>([
    { phase: 'parse', timing: 'sync', shouldThrowCleanup: false },
    { phase: 'parse', timing: 'async', shouldThrowCleanup: false },
    { phase: 'parse', timing: 'defer', shouldThrowCleanup: false },
    { phase: 'serialize', timing: 'sync', shouldThrowCleanup: false },
    { phase: 'serialize', timing: 'async', shouldThrowCleanup: false },
    { phase: 'serialize', timing: 'defer', shouldThrowCleanup: false },
    { phase: 'serialize', timing: 'sync', shouldThrowCleanup: true }
  ])(
    'contains $phase/$timing failures ($shouldThrowCleanup)',
    async scenario => {
      const probe = makeProbe({ scenario })
      try {
        const response = await boundedResponse(probe)
        expect({
          status: response.status,
          contentType: response.headers.get('content-type'),
          cacheControl: response.headers.get('cache-control'),
          mode: probe.event.renderMode,
          hasErrors: probe.hasErrors,
          completed: probe.completed.mock.calls.length,
          cleanup: probe.cleanup.mock.calls.length,
          parse: probe.parse.mock.calls.length,
          serialize: probe.serialize.mock.calls.length
        }).toStrictEqual({
          status: HTTP_SERVER_ERROR,
          contentType: 'text/plain; charset=utf-8',
          cacheControl: 'private, no-store',
          mode: 'async',
          hasErrors: true,
          completed: 0,
          cleanup: 1,
          parse: 1,
          serialize: Number(scenario.phase === 'serialize')
        })
        await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
        expect(
          JSON.stringify({ headers: [...response.headers], html: probe.html })
        ).not.toContain('PRIVATE')
        expect(readLog(console.error)).toStrictEqual({
          heads: [
            [LOG_MESSAGE, FAILURE_LOG_CLASSES[scenario.phase]],
            ...(scenario.shouldThrowCleanup ? [[LOG_MESSAGE, 'Error']] : [])
          ],
          leaks: []
        })
      } finally {
        probe.controller.abort()
      }
    }
  )

  it('keeps the 500 of an HTML shell that failed to serialize', async () => {
    const token = Object.freeze({ isProbe: true })
    let isPending = true
    // O primeiro passe suspende; o re-pull acontece enquanto o shell é montado.
    function shellContent() {
      if (isPending) {
        isPending = false
        throw new NotReadyError(Promise.resolve())
      }
      const { context } = sharedConfig
      if (!context) throw new Error('Missing SSR context')
      context.serialize('shell-probe', token)
      return 'Public shell'
    }
    const controller = new AbortController()
    const event: Event = createRequestEvent(
      new Request('https://example.com/en/about', {
        headers: { accept: 'text/html' },
        signal: controller.signal
      })
    )
    const next = () =>
      createSSRResponse(
        renderToStream(() => ssr(['<main>', '</main>'], shellContent), {
          plugins: [shellFailurePlugin(token)],
          signal: event.request.signal
        }),
        event
      )
    try {
      const response = await provideRequestEvent(event, () =>
        markdownContent(event, next)
      )
      expect(response.status).toBe(HTTP_SERVER_ERROR)
      await expect(response.text()).resolves.toBe('')
      expect(readLog(console.error)).toStrictEqual({
        heads: [[LOG_MESSAGE, 'Error']],
        leaks: []
      })
    } finally {
      controller.abort()
    }
  })

  it('refuses a completed render whose cleanup throws', async () => {
    const probe = makeProbe({ shouldThrowCleanup: true })
    try {
      const response = await boundedResponse(probe)
      expect({
        status: response.status,
        cacheControl: response.headers.get('cache-control'),
        hasErrors: probe.hasErrors,
        completed: probe.completed.mock.calls.length,
        cleanup: probe.cleanup.mock.calls.length
      }).toStrictEqual({
        status: HTTP_SERVER_ERROR,
        cacheControl: 'private, no-store',
        hasErrors: true,
        completed: 1,
        cleanup: 1
      })
      await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
      expect(readLog(console.error)).toStrictEqual({
        heads: [[LOG_MESSAGE, 'Error']],
        leaks: []
      })
    } finally {
      probe.controller.abort()
    }
  })

  it.each(CONTAINED_CASES)(
    'refuses an HTML 200 whose <Errored> caught $name',
    async ({ failure, hookLogs, leaks }) => {
      const probe = makeProbe({ boundaryFailure: failure })
      try {
        const response = await boundedResponse(probe)
        expect({
          status: response.status,
          cacheControl: response.headers.get('cache-control'),
          hasErrors: probe.hasErrors,
          completed: probe.completed.mock.calls.length,
          hasFallback: probe.html.includes('Contained fallback')
        }).toStrictEqual({
          status: HTTP_SERVER_ERROR,
          cacheControl: 'private, no-store',
          hasErrors: true,
          completed: 1,
          hasFallback: true
        })
        await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
        // O Vitest resolve o runtime de desenvolvimento do Solid, cujo
        // diagnóstico do <Errored> imprime a mensagem original antes do hook; o
        // de produção não o emite.
        const log = readLog(console.error)
        expect(log.heads[0]?.[0]).toContain(CONTAINED_DIAGNOSTIC)
        expect(log.heads.slice(1)).toStrictEqual(hookLogs)
        expect(log.leaks).toStrictEqual(leaks)
      } finally {
        probe.controller.abort()
      }
    }
  )

  it.each([false, true])(
    'preserves successful content (recovery: %s)',
    async shouldRecover => {
      const probe = makeProbe({ shouldRecover })
      try {
        const response = await boundedResponse(probe)
        expect({
          status: response.status,
          hasErrors: probe.hasErrors,
          completed: probe.completed.mock.calls.length,
          cleanup: probe.cleanup.mock.calls.length
        }).toStrictEqual({
          status: HTTP_OK,
          hasErrors: false,
          completed: 1,
          cleanup: 1
        })
        await expect(response.text()).resolves.toContain(
          shouldRecover ? 'Recovered content' : 'Resolved content'
        )
        expect(console.error).not.toHaveBeenCalled()
      } finally {
        probe.controller.abort()
      }
    }
  )
})
