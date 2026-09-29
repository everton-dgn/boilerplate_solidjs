import { readFile } from 'node:fs/promises'
import { env } from 'node:process'

import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from '@playwright/test'
import * as v from 'valibot'

const BACKEND = 'http://127.0.0.1:4318'
const HTTP_OK = 200
const HTTP_INTERNAL_SERVER_ERROR = 500
const LOADING_TEXT = 'Carregando fixture...'
const PUBLIC_MESSAGE = 'Não foi possível concluir a solicitação.'
// Mensagens que o navegador pode lançar ao hidratar, conforme a ordem entre a
// hidratação e a chegada do fragmento rejeitado: a lista admite cada uma sem
// exigi-la. A rejeição da fonte assíncrona é serializada com a política
// padrão do runtime antes de qualquer hook; o fragmento do boundary leva a
// mensagem pública definida pelo hook.
const RUNTIME_MESSAGE = 'Internal Server Error'
const MIDDLEWARE_LOG =
  '[middleware] Unexpected failure; private details omitted'
const backendState = v.object({
  attempts: v.number(),
  gate: v.picklist(['none', 'waiting', 'released']),
  real: v.boolean(),
  marker: v.string()
})

type Gate = 'none' | 'before' | 'stream'
type FixtureCase = {
  name: string
  gate: Gate
  status: number
  content: string
  pageErrors: string[]
}
type Control = { request: APIRequestContext; id: string }
type RawRequest = Control & { baseURL: string; fixture: FixtureCase }
type RawResponse = { body: string; headers: string; status: number }

const CASES: FixtureCase[] = [
  {
    name: 'render-local',
    gate: 'none',
    status: HTTP_OK,
    content: 'Falha contida',
    pageErrors: []
  },
  {
    name: 'render-root',
    gate: 'none',
    status: HTTP_INTERNAL_SERVER_ERROR,
    content: 'Algo deu errado!',
    pageErrors: []
  },
  {
    name: 'render-stream',
    gate: 'stream',
    status: HTTP_OK,
    content: 'Algo deu errado!',
    pageErrors: [PUBLIC_MESSAGE]
  },
  {
    name: 'async-ssr',
    gate: 'before',
    status: HTTP_INTERNAL_SERVER_ERROR,
    content: 'Algo deu errado!',
    pageErrors: [RUNTIME_MESSAGE]
  },
  {
    name: 'async-direct',
    gate: 'stream',
    status: HTTP_OK,
    content: 'Algo deu errado!',
    pageErrors: [RUNTIME_MESSAGE, PUBLIC_MESSAGE]
  },
  {
    name: 'async-element',
    gate: 'stream',
    status: HTTP_OK,
    content: 'Algo deu errado!',
    pageErrors: [RUNTIME_MESSAGE, PUBLIC_MESSAGE]
  }
]

async function readState({ request, id }: Control) {
  const state = await request.get(`${BACKEND}/control?id=${id}`)
  return v.parse(backendState, await state.json())
}

async function release({ request, id }: Control): Promise<void> {
  await request.post(`${BACKEND}/release?id=${id}`)
}

// Confirma pelo backend que a fixture chegou à fonte assíncrona antes de
// liberar a falha, sem depender de temporizador.
async function releaseWhenWaiting(control: Control): Promise<void> {
  await expect
    .poll(async () => {
      const state = await readState(control)
      return state.gate
    })
    .toBe('waiting')
  await release(control)
}

// Lê o documento bruto fora do navegador. No streaming, só libera o gate
// depois que o shell com o fallback de Loading chegou ao cliente.
async function readRawDocument({
  request,
  id,
  baseURL,
  fixture
}: RawRequest): Promise<RawResponse> {
  if (fixture.gate === 'before') await release({ request, id })
  const response = await fetch(
    `${baseURL}/outside-error?case=${fixture.name}&id=${id}`
  )
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Response without body')
  const decoder = new TextDecoder()
  let body = ''
  let released = fixture.gate !== 'stream'
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    body += decoder.decode(chunk.value, { stream: true })
    if (!released && body.includes(LOADING_TEXT)) {
      released = true
      await releaseWhenWaiting({ request, id })
    }
  }
  body += decoder.decode()
  return {
    body,
    headers: JSON.stringify(Object.fromEntries(response.headers)),
    status: response.status
  }
}

for (const fixture of CASES) {
  test.describe(`erro fora de server function: ${fixture.name}`, () => {
    test('o documento bruto não leva o marcador', async ({
      request,
      baseURL
    }) => {
      if (!baseURL) throw new Error('baseURL is required')
      const id = `outside:${crypto.randomUUID()}`
      const { marker } = await readState({ request, id })

      const raw = await readRawDocument({ request, id, baseURL, fixture })

      expect(raw.status).toBe(fixture.status)
      expect(raw.body).not.toContain(marker)
      // O hook de erros troca o erro que o boundary serializa pela mensagem
      // pública. A fonte assíncrona ainda leva a mensagem do runtime.
      expect(raw.body).toContain(PUBLIC_MESSAGE)
      expect(raw.headers).not.toContain(marker)
      // Controles positivos: a fixture recebeu o marcador, lançou com ele e,
      // nos casos com gate, só falhou depois da liberação. Sem streaming o
      // registro volta num header; com gate, pelo backend sintético.
      expect(raw.headers).toContain('"x-fixture-marker":"loaded"')
      const state = await readState({ request, id })
      expect(state.attempts).toBe(1)
      expect(state.gate).toBe(fixture.gate === 'none' ? 'none' : 'released')
      if (fixture.gate === 'none') {
        expect(raw.headers).toContain('"x-fixture-thrown":"real"')
      } else {
        expect(state.real).toBe(true)
      }
      if (fixture.gate === 'stream') expect(raw.body).toContain(LOADING_TEXT)
    })

    test('o navegador mostra o fallback sem o marcador', async ({
      page,
      request
    }) => {
      const id = `outside:${crypto.randomUUID()}`
      const { marker } = await readState({ request, id })
      const browserErrors: string[] = []
      page.on('pageerror', error => browserErrors.push(error.message))
      if (fixture.gate === 'before') await release({ request, id })

      const response = await page.goto(
        `/outside-error?case=${fixture.name}&id=${id}`,
        { waitUntil: fixture.gate === 'stream' ? 'commit' : 'load' }
      )
      if (fixture.gate === 'stream') {
        await expect(page.getByText(LOADING_TEXT)).toBeVisible()
        await releaseWhenWaiting({ request, id })
      }

      await expect(page.getByText(fixture.content)).toBeVisible()
      expect(await page.content()).not.toContain(marker)
      expect(browserErrors.join(' ')).not.toContain(marker)
      expect(
        browserErrors.filter(message => !fixture.pageErrors.includes(message))
      ).toStrictEqual([])
      const state = await readState({ request, id })
      if (fixture.gate === 'none') {
        expect(response?.headers()['x-fixture-thrown']).toBe('real')
      } else {
        expect(state.real).toBe(true)
      }
    })
  })
}

// errorPage: a navegação recebe a página de erro do app. Depois de next() o
// render já aconteceu e o plugin não permite outro, então a resposta é o 500
// em texto, como fora de navegação.
type MiddlewareCase = {
  phase: 'before' | 'after'
  navigation: boolean
  errorPage: boolean
}

const MIDDLEWARE_CASES: MiddlewareCase[] = [
  { phase: 'before', navigation: true, errorPage: true },
  { phase: 'after', navigation: true, errorPage: false },
  { phase: 'before', navigation: false, errorPage: false }
]

// O runtime do cliente troca a fila de eventos por null ao terminar a
// hidratação; sem JavaScript ela continua um array.
async function hydrationFinished(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const runtime: unknown = Reflect.get(globalThis, '_$HY')
    const events: unknown =
      typeof runtime === 'object' && runtime !== null
        ? Reflect.get(runtime, 'events')
        : undefined
    return events === null
  })
}

async function countLogLines(file: string): Promise<number> {
  const log = await readFile(file, 'utf8')
  return log.split('\n').filter(line => line.includes(MIDDLEWARE_LOG)).length
}

test.describe('exceções no middleware', () => {
  // Em ordem num único worker, para que cada caso atribua a si as linhas de
  // log que produziu. Diferente de serial, uma falha não pula o caso seguinte.
  test.describe.configure({ mode: 'default' })

  for (const { phase, navigation, errorPage } of MIDDLEWARE_CASES) {
    test(`exceção ${phase === 'before' ? 'antes' : 'depois'} de next() ${navigation ? 'numa navegação' : 'fora de navegação'} ${errorPage ? 'mostra a página de erro' : 'vira 500 em texto'}`, async ({
      request,
      baseURL
    }) => {
      const logFile = env.SERVER_LOG_FILE
      if (!baseURL || !logFile) throw new Error('E2E environment is incomplete')
      const id = `outside:${crypto.randomUUID()}`
      const { marker } = await readState({ request, id })
      const logBefore = await countLogLines(logFile)

      const response = await fetch(
        `${baseURL}/outside-error?case=middleware-${phase}&id=${id}`,
        { headers: { accept: navigation ? 'text/html' : '*/*' } }
      )
      const body = await response.text()

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      if (errorPage) {
        expect(response.headers.get('content-type')).toContain('text/html')
        expect(body).toContain('Algo deu errado!')
      } else {
        expect(body).toBe(PUBLIC_MESSAGE)
      }
      expect(body).not.toContain(marker)
      expect(
        JSON.stringify(Object.fromEntries(response.headers))
      ).not.toContain(marker)
      // Controle positivo: a fixture lançou com o marcador carregado.
      const state = await readState({ request, id })
      expect(state.attempts).toBe(1)
      expect(state.real).toBe(true)
      // Uma linha fixa do middleware por requisição. O teardown global recusa
      // o marcador em todo o arquivo depois da suíte.
      await expect.poll(async () => countLogLines(logFile)).toBe(logBefore + 1)
    })
  }

  // O render de erro chamaria o dispatcher do plugin, que executa server
  // functions e responde rotas de API com o próprio corpo.
  for (const path of ['/robots.txt', '/_server/fixture']) {
    test(`exceção antes de next() em ${path} vira 500 em texto mesmo com accept de HTML`, async ({
      request,
      baseURL
    }) => {
      if (!baseURL) throw new Error('baseURL is required')
      const id = `outside:${crypto.randomUUID()}`

      const response = await fetch(
        `${baseURL}${path}?case=middleware-before&id=${id}`,
        { headers: { accept: 'text/html' } }
      )

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR)
      await expect(response.text()).resolves.toBe(PUBLIC_MESSAGE)
      const state = await readState({ request, id })
      expect(state.real).toBe(true)
    })
  }

  test('a página de erro do middleware hidrata no navegador', async ({
    page,
    request
  }) => {
    const id = `outside:${crypto.randomUUID()}`
    const { marker } = await readState({ request, id })
    const browserErrors: string[] = []
    page.on('pageerror', error => browserErrors.push(error.message))

    const response = await page.goto(
      `/outside-error?case=middleware-before&id=${id}`
    )

    expect(response?.status()).toBe(HTTP_INTERNAL_SERVER_ERROR)
    await expect(
      page.getByRole('link', { name: 'Recarregar página' })
    ).toBeVisible()
    await expect.poll(async () => hydrationFinished(page)).toBe(true)
    expect(await page.content()).not.toContain(marker)
    // Só a mensagem pública pode reaparecer ao hidratar o fallback.
    expect(
      browserErrors.filter(message => message !== PUBLIC_MESSAGE)
    ).toStrictEqual([])
  })
})
