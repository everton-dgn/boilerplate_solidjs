import { m } from '@paraglide/messages.js'

import { readSitePage } from '@/data/readSitePage/index.ts'
import type { SitePage } from '@/data/readSitePage/types.ts'
import { delocalizePathname } from '@/i18n/urls/index.ts'

import { negotiatePageFormat } from '../negotiatePageFormat/index.ts'
import { isPagePath } from '../requestClassification/index.ts'
import type { Next } from '../types.ts'

type MarkdownResponseOptions = {
  request: Request
  body: string
  response?: Response
}

const HTTP_NOT_FOUND = 404
const HTTP_NOT_ACCEPTABLE = 406

function escapeText(value: string): string {
  return value.replaceAll(/[\\`*_{}[\]<>()#+.!|~-]/gu, String.raw`\$&`)
}

function renderPage(page: SitePage): string {
  return `${[
    `# ${escapeText(page.title)}`,
    escapeText(page.description),
    escapeText(page.intro),
    ...page.sections.flatMap(section => [
      `## ${escapeText(section.title)}`,
      ...section.paragraphs.map(escapeText)
    ]),
    ...page.links.map(link => `- [${escapeText(link.label)}](<${link.href}>)`)
  ].join('\n\n')}\n`
}

function varyAccept(response: Response): Response {
  const vary = response.headers.get('vary')
  const fields = vary?.split(',').map(field => field.trim().toLowerCase()) ?? []
  if (!fields.includes('*') && !fields.includes('accept')) {
    response.headers.set('vary', vary ? `${vary}, Accept` : 'Accept')
  }
  return response
}

function markdownResponse({
  request,
  body,
  response
}: MarkdownResponseOptions): Response {
  const headers = new Headers(response?.headers)
  for (const header of [
    'content-length',
    'content-encoding',
    'etag',
    'last-modified'
  ]) {
    headers.delete(header)
  }
  headers.set('content-type', 'text/markdown; charset=utf-8')
  headers.set('cache-control', 'private, no-store')
  return varyAccept(
    new Response(request.method === 'HEAD' ? null : body, {
      status: response?.status,
      headers
    })
  )
}

export async function markdownContent(
  request: Request,
  render: Next
): Promise<Response> {
  const { pathname: requestedPath } = new URL(request.url)
  if (
    (request.method !== 'GET' && request.method !== 'HEAD') ||
    !isPagePath({ pathname: requestedPath, method: request.method })
  ) {
    return render()
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
  const pathname = delocalizePathname(requestedPath).replace(/\/$/u, '') || '/'
  const shouldUseMarkdown = format === 'markdown'
  const page = shouldUseMarkdown ? readSitePage(pathname) : undefined
  if (page) return markdownResponse({ request, body: renderPage(page) })
  const response = await render()
  const isHtml =
    response.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase() === 'text/html'
  if (!isHtml) return response
  if (!shouldUseMarkdown || response.status !== HTTP_NOT_FOUND) {
    return varyAccept(response)
  }
  await response.body?.cancel()
  return markdownResponse({
    request,
    response,
    body: `# ${escapeText(m.markdownContent_notFoundTitle())}\n\n${escapeText(m.markdownContent_notFoundDescription())}\n\n[${escapeText(m.markdownContent_siteIndexLabel())}](/llms.txt)\n`
  })
}
