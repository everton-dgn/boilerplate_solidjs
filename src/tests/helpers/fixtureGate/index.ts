import { expect, type APIRequestContext } from '@playwright/test'

const BACKEND = 'http://127.0.0.1:4318'

type GateRelease = { request: APIRequestContext; id: string }
type GatedBody = GateRelease & { response: Response; shellText: string }

export async function releaseFixtureGate({
  request,
  id
}: GateRelease): Promise<void> {
  const response = await request.post(
    `${BACKEND}/release?id=${encodeURIComponent(id)}`
  )
  expect(response.ok()).toBe(true)
}

// Lê o corpo de um documento em streaming e só libera o gate depois que o
// shell, com o fallback do Loading, chegou ao cliente.
export async function readGatedBody({
  request,
  id,
  response,
  shellText
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
      await releaseFixtureGate({ request, id })
    }
  }
  return body + decoder.decode()
}
