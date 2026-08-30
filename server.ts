import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

type HandleRequest = (
  request: Request,
  options: { event: { nativeEvent: IncomingMessage } }
) => Promise<Response>

type RequestInitWithDuplex = RequestInit & { duplex?: 'half' }

const root = path.dirname(fileURLToPath(import.meta.url))
const clientDirectory = path.join(root, 'dist', 'client')
const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || 'localhost'
const serverModuleUrl = new URL('./dist/server/server.js', import.meta.url)
const serverModule = (await import(serverModuleUrl.href)) as {
  handleRequest: HandleRequest
}

const mimeTypes: Readonly<Record<string, string>> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
}

function resolveAsset(pathname: string): string | null {
  let decodedPath: string

  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    return null
  }

  const resolvedPath = path.resolve(clientDirectory, `.${decodedPath}`)
  return resolvedPath.startsWith(`${clientDirectory}${path.sep}`)
    ? resolvedPath
    : null
}

async function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string
): Promise<boolean> {
  const filePath = resolveAsset(pathname)
  if (!filePath) return false

  let fileInfo

  try {
    fileInfo = await stat(filePath)
  } catch {
    return false
  }

  if (!fileInfo.isFile()) return false

  const extension = path.extname(filePath).toLowerCase()
  response.setHeader(
    'content-type',
    mimeTypes[extension] ?? 'application/octet-stream'
  )
  response.setHeader('content-length', fileInfo.size)
  response.setHeader(
    'cache-control',
    pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate'
  )

  if (request.method === 'HEAD') {
    response.end()
    return true
  }

  await pipeline(createReadStream(filePath), response)
  return true
}

function toWebRequest(request: IncomingMessage): Request {
  const url = new URL(
    request.url || '/',
    `http://${request.headers.host || `${host}:${port}`}`
  )
  const method = request.method || 'GET'
  const headers = new Headers()

  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item)
    } else if (value !== undefined) {
      headers.set(name, value)
    }
  }

  const init: RequestInitWithDuplex = { method, headers }

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(request) as ReadableStream<Uint8Array>
    init.duplex = 'half'
  }

  return new Request(url, init)
}

async function writeWebResponse(
  response: ServerResponse,
  webResponse: Response
): Promise<void> {
  response.statusCode = webResponse.status

  const cookies = webResponse.headers.getSetCookie()
  webResponse.headers.forEach((value, key) => {
    if (key !== 'set-cookie') response.setHeader(key, value)
  })

  if (cookies.length > 0) response.setHeader('set-cookie', cookies)

  if (webResponse.body) {
    await pipeline(webResponse.body, response)
  } else {
    response.end()
  }
}

async function handleNodeRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  try {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname

    if (pathname !== '/' && (await serveStatic(request, response, pathname))) {
      return
    }

    const webResponse = await serverModule.handleRequest(
      toWebRequest(request),
      {
        event: { nativeEvent: request }
      }
    )
    await writeWebResponse(response, webResponse)
  } catch (error) {
    console.error(error)
    if (!response.headersSent) response.statusCode = 500
    response.end('Internal Server Error')
  }
}

const server = createServer((request, response) => {
  void handleNodeRequest(request, response)
})

server.listen(port, host, () => {
  console.log(`Servidor em http://${host}:${port}`)
})
