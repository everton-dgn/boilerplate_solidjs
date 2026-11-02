import type { RequestEvent } from '@solidjs/web'

import { HTTP_BAD_REQUEST, HTTP_NOT_FOUND } from '@/constants/http.ts'
import { runPublication } from '@/infra/server/publication/index.ts'

import { appendVary } from '../helpers/appendVary/index.ts'
import {
  acceptsMarkdown,
  negotiatePageFormat
} from '../negotiatePageFormat/index.ts'
import { isPagePath } from '../requestClassification/index.ts'
import type { Next } from '../types.ts'
import { MARKDOWN_TIMEOUT_MS, MAX_MARKDOWN_BYTES } from './constants.ts'
import { boundedRender } from './helpers/boundedRender/index.ts'
import {
  normalizePublication,
  notAcceptable,
  publicResponse,
  unpublished
} from './helpers/markdownResponses/index.ts'
import {
  documentUrl,
  isEligible,
  isUnpublished
} from './helpers/markdownRouting/index.ts'
import {
  isStaticListing,
  listStaticMarkdown
} from './helpers/staticMarkdownListing/index.ts'

export async function markdownContent(
  event: RequestEvent,
  render: Next
): Promise<Response> {
  const original = event.request
  if (!['GET', 'HEAD'].includes(original.method)) return render()
  if (isStaticListing(original)) return listStaticMarkdown()
  const { pathname } = new URL(original.url)
  if (!isPagePath({ pathname, method: original.method })) return render()
  const url = documentUrl(original)
  const isDirect = pathname.endsWith('.md')
  try {
    decodeURI(url.pathname)
  } catch {
    return publicResponse({ status: HTTP_BAD_REQUEST, request: original })
  }
  if (!isPagePath({ pathname: url.pathname, method: original.method })) {
    return publicResponse({ status: HTTP_NOT_FOUND, request: original })
  }
  const format = negotiatePageFormat(original.headers.get('accept'))
  const isPublished = isEligible(url)
  if (isDirect && isUnpublished({ request: original, url, isPublished })) {
    return unpublished(original)
  }
  if (
    (isDirect && !acceptsMarkdown(original.headers.get('accept'))) ||
    (!isDirect && isPublished && !format)
  ) {
    return notAcceptable(original)
  }
  if (!isDirect && format !== 'markdown') {
    const response = await render()
    return isPublished ? appendVary({ response, field: 'Accept' }) : response
  }
  if (!isDirect && original.headers.has('authorization')) return render()
  const response = await runPublication({
    kind: 'markdown',
    signal: original.signal,
    method: original.method,
    timeoutMs: MARKDOWN_TIMEOUT_MS,
    maxOutputBytes: MAX_MARKDOWN_BYTES,
    run: ({ signal }) =>
      boundedRender({
        event,
        render,
        original,
        url,
        isDirect,
        isPublished,
        signal
      })
  })
  return normalizePublication({ response, request: original })
}
