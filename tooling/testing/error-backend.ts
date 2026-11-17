import { createServer, type ServerResponse } from 'node:http'

const HTTP_INTERNAL_SERVER_ERROR = 500
const HTTP_NOT_FOUND = 404
const PORT = 4318
const DELAY_MS = 100
const recovered = new Set<string>()
const attempts = new Map<string, number>()
const markers = new Map<string, string>()
// Gates hold the response of /gate, and the one of /data when the id ends in
// :gated, until the test releases the id, so that a failure or async data arrive
// after the shell without relying on a timer.
const gates = new Map<string, PromiseWithResolvers<boolean>>()
const gateStates = new Map<string, 'waiting' | 'released'>()
// Marks whether any gate call came from a fixture about to throw with the real
// marker. Client calls, without the marker, do not clear the mark.
const realThrows = new Set<string>()

function gateFor(id: string): PromiseWithResolvers<boolean> {
  const existing = gates.get(id)
  if (existing) return existing
  const gate = Promise.withResolvers<boolean>()
  gates.set(id, gate)
  return gate
}

type GateAnswer = { id: string; response: ServerResponse }

async function answerGate({ id, response }: GateAnswer) {
  await gateFor(id).promise
  response.end('{"ready":true}')
}

type DataAnswer = { id: string; respond: () => void }

async function answerData({ id, respond }: DataAnswer) {
  if (id.endsWith(':gated')) {
    if (gateStates.get(id) !== 'released') gateStates.set(id, 'waiting')
    await gateFor(id).promise
  }
  setTimeout(respond, DELAY_MS)
}

function privateMarker(id: string): string {
  const existing = markers.get(id)
  if (existing) return existing
  const marker = `PRIVATE_BACKEND_${crypto.randomUUID()}`
  markers.set(id, marker)
  return marker
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  const id = url.searchParams.get('id') ?? 'default'
  const marker = privateMarker(id)
  const [scenario] = id.split(':')
  response.setHeader('content-type', 'application/json')
  response.setHeader('cache-control', 'no-store')

  if (url.pathname === '/control') {
    if (request.method === 'POST') recovered.add(id)
    response.end(
      JSON.stringify({
        attempts: attempts.get(id) ?? 0,
        gate: gateStates.get(id) ?? 'none',
        real: realThrows.has(id),
        marker
      })
    )
    return
  }
  if (url.pathname === '/release' && request.method === 'POST') {
    gateStates.set(id, 'released')
    gateFor(id).resolve(true)
    response.end('{}')
    return
  }
  if (url.pathname === '/report') {
    if (url.searchParams.get('real') === '1') realThrows.add(id)
    response.end('{"ready":true}')
    return
  }
  if (url.pathname === '/gate') {
    if (url.searchParams.get('real') === '1') realThrows.add(id)
    if (gateStates.get(id) !== 'released') gateStates.set(id, 'waiting')
    void answerGate({ id, response })
    return
  }
  if (url.pathname !== '/data') {
    response.statusCode = HTTP_NOT_FOUND
    response.end('{}')
    return
  }

  attempts.set(id, (attempts.get(id) ?? 0) + 1)
  const ok =
    recovered.has(id) ||
    ['throw', 'result', 'public', 'success', 'outside'].includes(scenario ?? '')
  response.setHeader('x-internal-context', marker)
  const respond = () => {
    if (!ok) response.statusCode = HTTP_INTERNAL_SERVER_ERROR
    response.end(
      JSON.stringify(
        ok
          ? {
              message: ['throw', 'result', 'outside'].includes(scenario ?? '')
                ? marker
                : 'Backend recovered',
              internalContext: `CONTEXT_${marker}`
            }
          : {
              message: marker,
              cause: `CAUSE_${marker}`,
              internalContext: `CONTEXT_${marker}`
            }
      )
    )
  }
  void answerData({ id, respond })
})

server.listen(PORT, '127.0.0.1')
