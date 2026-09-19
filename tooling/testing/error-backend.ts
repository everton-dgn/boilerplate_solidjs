import { createServer } from 'node:http'

const HTTP_INTERNAL_SERVER_ERROR = 500
const HTTP_NOT_FOUND = 404
const PORT = 4318
const DELAY_MS = 100
const recovered = new Set<string>()
const attempts = new Map<string, number>()
const markers = new Map<string, string>()

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
    response.end(JSON.stringify({ attempts: attempts.get(id) ?? 0, marker }))
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
    ['throw', 'result', 'public', 'success'].includes(scenario ?? '')
  response.setHeader('x-internal-context', marker)
  setTimeout(() => {
    if (!ok) response.statusCode = HTTP_INTERNAL_SERVER_ERROR
    response.end(
      JSON.stringify(
        ok
          ? {
              message: ['throw', 'result'].includes(scenario ?? '')
                ? marker
                : 'Backend recuperado',
              internalContext: `CONTEXT_${marker}`
            }
          : {
              message: marker,
              cause: `CAUSE_${marker}`,
              internalContext: `CONTEXT_${marker}`
            }
      )
    )
  }, DELAY_MS)
})

server.listen(PORT, '127.0.0.1')
process.once('SIGTERM', () => server.close())
process.once('SIGINT', () => server.close())
