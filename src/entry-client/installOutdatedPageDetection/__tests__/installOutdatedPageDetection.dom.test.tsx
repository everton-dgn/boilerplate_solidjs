import { render } from '@solidjs/web'
import {
  configureServerFunctionsClient,
  createServerReference,
  GET,
  UNKNOWN_HEADER
} from '@solidjs/web/server-functions/client'
import { createEffect, createRoot, Errored, flush, untrack } from 'solid-js'

import {
  OUTDATED_FALLBACK_EVENT,
  REFUSED_SUBMIT_EVENT
} from '@/constants/outdated-page.ts'

import { installOutdatedPageDetection } from '../index.ts'

const { markPageOutdated, recordChunkFailure } = vi.hoisted(() => ({
  markPageOutdated: vi.fn<() => void>(),
  recordChunkFailure: vi.fn<(error: unknown) => void>()
}))

vi.mock(import('@/router/outdatedPage/index.ts'), async importOriginal => ({
  ...(await importOriginal()),
  markPageOutdated,
  recordChunkFailure
}))

const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_INTERNAL_SERVER_ERROR = 500

type Answer = { status: number; isLabelled: boolean }
type ThrowerProps = { error: unknown }
// O registro real alimenta o mesmo WeakSet que isVersionError consulta.
type OutdatedPageActual = { recordChunkFailure: (error: unknown) => void }

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
      <Errored fallback={<p>Parte recusada</p>}>
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

// O render chama a leitura dentro de uma computação rastreada; a fase de
// computação do efeito reproduz esse ponto de chamada.
function callInsideComputation(call: () => Promise<unknown>): Promise<unknown> {
  let pending: Promise<unknown> | undefined
  createRoot(dispose => {
    onTestFinished(dispose)
    createEffect(
      () => {
        pending = call()
      },
      () => {
        /* A chamada já aconteceu na fase de computação. */
      }
    )
  })
  flush()
  assert(pending)
  return pending
}

describe('detecção de página desatualizada', () => {
  // O descarte devolvido vira o teardown do beforeAll.
  beforeAll(installOutdatedPageDetection)

  afterEach(() => {
    configureServerFunctionsClient({ fetch: null })
  })

  it.each([HTTP_CONFLICT, HTTP_NOT_FOUND])(
    'avisa o envio recusado com %i e mantém a rejeição unknownFunction',
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

  it('marca a página na leitura declarada com GET, sem avisar', async () => {
    const events = countEvents(REFUSED_SUBMIT_EVENT)
    answerWith({ status: HTTP_NOT_FOUND, isLabelled: true })
    const read = GET(createServerReference('read-1'))
    await expect(read()).rejects.toMatchObject({ unknownFunction: true })
    expect(events()).toBe(0)
    expect(markPageOutdated).toHaveBeenCalledOnce()
  })

  it('marca a página na chamada feita numa computação rastreada, sem avisar', async () => {
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
  ])('ignora a resposta $status fora do contrato de versão', async answer => {
    const events = countEvents(REFUSED_SUBMIT_EVENT)
    answerWith(answer)
    const save = createServerReference('save-2')
    await expect(save()).rejects.toMatchObject({ status: answer.status })
    expect(events()).toBe(0)
    expect(markPageOutdated).not.toHaveBeenCalled()
  })

  it('registra a falha de chunk sem cancelar o evento', () => {
    const failure = new TypeError('Failed to fetch dynamically imported module')
    const event = Object.assign(
      new Event('vite:preloadError', { cancelable: true }),
      { payload: failure }
    )
    globalThis.dispatchEvent(event)
    expect(recordChunkFailure).toHaveBeenCalledWith(failure)
    expect(event.defaultPrevented).toBe(false)
  })

  it('remove o ouvinte e o handler ao descartar', async () => {
    // O listener é a mesma função: descartar esta instalação remove a única.
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

describe('aviso de parte da página', () => {
  // O descarte devolvido vira o teardown do beforeAll.
  beforeAll(installOutdatedPageDetection)

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {
      /* O Errored de desenvolvimento reporta o erro capturado. */
    })
  })

  it('avisa uma vez a recusa capturada por Errored locais', async () => {
    const events = countEvents(OUTDATED_FALLBACK_EVENT)
    const refusal = Object.assign(new Error('Recusada'), {
      unknownFunction: true
    })
    renderInsideLocalBoundary(refusal)
    renderInsideLocalBoundary(refusal)
    await expect.poll(events).toBe(1)
    await Promise.resolve()
    expect(events()).toBe(1)
  })

  it('avisa a falha de chunk registrada', async () => {
    const actual = await vi.importActual<OutdatedPageActual>(
      '@/router/outdatedPage/index.ts'
    )
    const events = countEvents(OUTDATED_FALLBACK_EVENT)
    const chunkFailure = new TypeError('Failed to fetch module')
    actual.recordChunkFailure(chunkFailure)
    renderInsideLocalBoundary(chunkFailure)
    await expect.poll(events).toBe(1)
  })

  it('ignora o erro que não é de versão', async () => {
    const events = countEvents(OUTDATED_FALLBACK_EVENT)
    renderInsideLocalBoundary(new Error('Detalhe interno'))
    await Promise.resolve()
    expect(events()).toBe(0)
  })

  it('para de avisar depois do descarte', async () => {
    const dispose = installOutdatedPageDetection()
    dispose()
    onTestFinished(() => {
      installOutdatedPageDetection()
    })
    const events = countEvents(OUTDATED_FALLBACK_EVENT)
    renderInsideLocalBoundary(
      Object.assign(new Error('Recusada'), { unknownFunction: true })
    )
    await Promise.resolve()
    expect(events()).toBe(0)
  })
})
