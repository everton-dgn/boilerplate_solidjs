import { extractLocaleFromUrl, getLocale } from '@paraglide/runtime.js'
import { markdownNotFound, markdownPaths } from 'virtual:markdown-manifest'

import {
  HTTP_NOT_ACCEPTABLE,
  HTTP_NOT_FOUND,
  HTTP_TEMPORARY_REDIRECT
} from '@/constants/http.ts'

import { negotiatePageFormat } from '../negotiatePageFormat/index.ts'
import {
  isPagePath,
  isServerFunctionPath
} from '../requestClassification/index.ts'
import type { Next } from '../types.ts'

type NotFoundOptions = { request: Request; response: Response }

function varyAccept(response: Response): Response {
  const vary = response.headers.get('vary')
  const fields = vary?.split(',').map(field => field.trim().toLowerCase()) ?? []
  if (!fields.includes('*') && !fields.includes('accept')) {
    response.headers.set('vary', vary ? `${vary}, Accept` : 'Accept')
  }
  return response
}

async function negotiateNotFound({
  request,
  response
}: NotFoundOptions): Promise<Response> {
  const locale = extractLocaleFromUrl(request.url) ?? getLocale()
  const body = markdownNotFound[locale]
  if (!body) return response
  varyAccept(response)
  if (negotiatePageFormat(request.headers.get('accept')) !== 'markdown') {
    return response
  }
  await response.body?.cancel()
  const headers = new Headers(response.headers)
  for (const name of ['content-length', 'content-encoding', 'etag']) {
    headers.delete(name)
  }
  headers.set('content-type', 'text/markdown; charset=utf-8')
  headers.set('content-language', locale)
  headers.set('cache-control', 'private, no-store')
  headers.set('x-robots-tag', 'noindex')
  return new Response(request.method === 'HEAD' ? null : body, {
    status: HTTP_NOT_FOUND,
    headers
  })
}

export async function markdownContent(
  request: Request,
  render: Next
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return render()
  const { pathname } = new URL(request.url)
  if (isServerFunctionPath(pathname)) return render()
  if (pathname.endsWith('.md')) {
    return negotiateNotFound({
      request,
      response: new Response(request.method === 'HEAD' ? null : 'Not found\n', {
        status: HTTP_NOT_FOUND,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'private, no-store'
        }
      })
    })
  }
  const href = markdownPaths[pathname.replace(/\/$/u, '') || '/']
  if (!href) {
    const response = await render()
    return response.status === HTTP_NOT_FOUND &&
      response.headers.get('content-type')?.startsWith('text/html') &&
      isPagePath({ pathname, method: request.method })
      ? negotiateNotFound({ request, response })
      : response
  }
  const format = negotiatePageFormat(request.headers.get('accept'))
  if (!format) {
    return new Response(
      request.method === 'HEAD' ? null : 'text/html\ntext/markdown\n',
      {
        status: HTTP_NOT_ACCEPTABLE,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'private, no-store',
          vary: 'Accept'
        }
      }
    )
  }
  if (format === 'markdown') {
    return new Response(null, {
      status: HTTP_TEMPORARY_REDIRECT,
      headers: {
        location: href,
        vary: 'Accept',
        'cache-control': 'private, no-store'
      }
    })
  }
  const response = await render()
  return response.headers.get('content-type')?.startsWith('text/html')
    ? varyAccept(response)
    : response
}
