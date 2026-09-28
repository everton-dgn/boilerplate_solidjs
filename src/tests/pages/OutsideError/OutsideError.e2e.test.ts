import { expect, test, type APIRequestContext } from '@playwright/test'
import * as v from 'valibot'

const BACKEND = 'http://127.0.0.1:4318'
const HTTP_OK = 200
const HTTP_INTERNAL_SERVER_ERROR = 500
const LOADING_TEXT = 'Carregando fixture...'
// A rejeição de uma fonte assíncrona é serializada com a política padrão do
// runtime antes de qualquer hook e chega ao navegador ao hidratar. No
// render-stream ela só aparece quando o fragmento rejeitado chega antes da
// hidratação; a lista admite a mensagem sem exigi-la.
const RUNTIME_MESSAGE = 'Internal Server Error'
const backendState = v.object({
  attempts: v.number(),
  gate: v.picklist(['none', 'waiting', 'released']),
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
    pageErrors: [RUNTIME_MESSAGE]
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
    pageErrors: [RUNTIME_MESSAGE]
  },
  {
    name: 'async-element',
    gate: 'stream',
    status: HTTP_OK,
    content: 'Algo deu errado!',
    pageErrors: [RUNTIME_MESSAGE]
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
      expect(raw.headers).not.toContain(marker)
      // Controles positivos: a fixture recebeu o marcador e, nos casos com
      // gate, a falha aconteceu depois da liberação.
      expect(raw.headers).toContain('"x-fixture-marker":"loaded"')
      const state = await readState({ request, id })
      expect(state.attempts).toBe(1)
      expect(state.gate).toBe(fixture.gate === 'none' ? 'none' : 'released')
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

      await page.goto(`/outside-error?case=${fixture.name}&id=${id}`, {
        waitUntil: fixture.gate === 'stream' ? 'commit' : 'load'
      })
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
    })
  })
}
