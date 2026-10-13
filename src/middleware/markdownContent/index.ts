import { markdownPaths } from 'virtual:markdown-manifest'

import {
  HTTP_NOT_ACCEPTABLE,
  HTTP_NOT_FOUND,
  HTTP_TEMPORARY_REDIRECT
} from '@/constants/http.ts'

import { negotiatePageFormat } from '../negotiatePageFormat/index.ts'
import type { Next } from '../types.ts'

function varyAccept(response: Response): Response {
  const vary = response.headers.get('vary')
  const fields = vary?.split(',').map(field => field.trim().toLowerCase()) ?? []
  if (!fields.includes('*') && !fields.includes('accept')) {
    response.headers.set('vary', vary ? `${vary}, Accept` : 'Accept')
  }
  return response
}

export async function markdownContent(
  request: Request,
  render: Next
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return render()
  const { pathname } = new URL(request.url)
  if (pathname.endsWith('.md')) {
    return new Response(request.method === 'HEAD' ? null : 'Not found\n', {
      status: HTTP_NOT_FOUND,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'private, no-store'
      }
    })
  }
  const href = markdownPaths[pathname.replace(/\/$/u, '') || '/']
  if (!href) return render()
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
