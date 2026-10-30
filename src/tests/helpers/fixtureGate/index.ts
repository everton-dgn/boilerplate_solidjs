import {
  expect,
  type APIRequestContext,
  type APIResponse
} from '@playwright/test'
import * as v from 'valibot'

const BACKEND = 'http://127.0.0.1:4318'
const BackendStateSchema = v.object({
  attempts: v.number(),
  gate: v.picklist(['none', 'waiting', 'released']),
  real: v.boolean(),
  marker: v.string()
})

type BackendState = v.InferOutput<typeof BackendStateSchema>
type BackendRequest = { request: APIRequestContext; id: string }
type GatedBody = BackendRequest & {
  response: Response
  shellText: string
  shouldWaitForGate?: boolean
}

function controlUrl(id: string): string {
  return `${BACKEND}/control?id=${encodeURIComponent(id)}`
}

export async function readBackendState({
  request,
  id
}: BackendRequest): Promise<BackendState> {
  const response = await request.get(controlUrl(id))
  return v.parse(BackendStateSchema, await response.json())
}

export async function markBackendRecovered({
  request,
  id
}: BackendRequest): Promise<void> {
  const response = await request.post(controlUrl(id))
  expect(response.ok()).toBe(true)
}

// Confirma pelo backend que a fixture chegou ao gate, sem temporizador.
export async function waitForGate(backend: BackendRequest): Promise<void> {
  await expect
    .poll(async () => {
      const state = await readBackendState(backend)
      return state.gate
    })
    .toBe('waiting')
}

// Sem asserção, para blocos finally: uma falha aqui não substitui a do teste.
export function releaseFixtureGateQuietly({
  request,
  id
}: BackendRequest): Promise<APIResponse> {
  return request.post(`${BACKEND}/release?id=${encodeURIComponent(id)}`)
}

export async function releaseFixtureGate(
  backend: BackendRequest
): Promise<void> {
  const response = await releaseFixtureGateQuietly(backend)
  expect(response.ok()).toBe(true)
}

// Lê o corpo de um documento em streaming e só libera o gate depois que o
// shell, com o fallback do Loading, chegou ao cliente.
export async function readGatedBody({
  request,
  id,
  response,
  shellText,
  shouldWaitForGate = false
}: GatedBody): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Response without body')
  const decoder = new TextDecoder()
  let body = ''
  let isReleased = false
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    body += decoder.decode(chunk.value, { stream: true })
    if (!isReleased && body.includes(shellText)) {
      isReleased = true
      if (shouldWaitForGate) await waitForGate({ request, id })
      await releaseFixtureGate({ request, id })
    }
  }
  return body + decoder.decode()
}
