import { createServer } from 'node:http'

const HTTP_INTERNAL_SERVER_ERROR = 500
const HTTP_NOT_FOUND = 404
const PORT = 4318
const DELAY_MS = 100
const recovered = new Set<string>()
const attempts = new Map<string, number>()

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  const id = url.searchParams.get('id') ?? 'default'
  response.setHeader('content-type', 'application/json')
  response.setHeader('cache-control', 'no-store')

  if (url.pathname === '/control') {
    if (request.method === 'POST') recovered.add(id)
    response.end(JSON.stringify({ attempts: attempts.get(id) ?? 0 }))
    return
  }
  if (url.pathname !== '/data') {
    response.statusCode = HTTP_NOT_FOUND
    response.end('{}')
    return
  }

  attempts.set(id, (attempts.get(id) ?? 0) + 1)
  const ok = recovered.has(id)
  setTimeout(() => {
    if (!ok) response.statusCode = HTTP_INTERNAL_SERVER_ERROR
    response.end(
      JSON.stringify(
        ok
          ? { message: 'Backend recuperado' }
          : { message: 'Backend indisponível' }
      )
    )
  }, DELAY_MS)
})

server.listen(PORT, '127.0.0.1')
process.once('SIGTERM', () => server.close())
process.once('SIGINT', () => server.close())
