import * as v from 'valibot'

type DeploymentRequest = (request: Request) => Promise<Response>
type CheckOptions = {
  url: string
  manifest: unknown
  bypassSecret: string
  request?: DeploymentRequest
}
type ResponseOptions = {
  pathname: string
  method: 'GET' | 'HEAD'
  accept: string
  status: number
  contentType?: string
  locale?: string
  location?: string
  shouldVary?: boolean
}

type BodyOptions = Pick<ResponseOptions, 'method' | 'contentType'> & {
  body: string
  label: string
}

const entrySchema = v.object({
  path: v.string(),
  href: v.string(),
  locale: v.string()
})
const manifestSchema = v.array(entrySchema)
const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
const REQUEST_TIMEOUT = 30_000
const HTTP_OK = 200
const HTTP_TEMPORARY_REDIRECT = 307

function validatePath(value: string, origin: string): void {
  const url = new URL(value, origin)
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    url.origin !== origin ||
    url.pathname !== value ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Deployment manifest must contain canonical same-origin paths'
    )
  }
}

function hasDirective(value: string | null, directive: string): boolean {
  return (value ?? '')
    .toLowerCase()
    .split(',')
    .some(field => field.trim() === directive)
}

function validateBody({ method, contentType, body, label }: BodyOptions): void {
  if (method === 'HEAD') {
    if (body !== '') throw new Error(`${label}: HEAD must not contain a body`)
    return
  }
  if (contentType === 'text/html' && !/^\s*<!doctype html[\s>]/iu.test(body)) {
    throw new Error(`${label}: expected an HTML document`)
  }
  if (contentType === 'text/markdown' && !body.startsWith('# ')) {
    throw new Error(`${label}: expected a Markdown document`)
  }
}

export async function checkDeployment({
  url,
  manifest,
  bypassSecret,
  request = globalThis.fetch
}: CheckOptions): Promise<number> {
  if (!/^https:\/\/[a-z0-9-]+\.vercel\.app\/?$/u.test(url)) {
    throw new Error('DEPLOYMENT_URL must be a Vercel deployment HTTPS origin')
  }
  const { origin } = new URL(url)
  const entries = v.parse(manifestSchema, manifest)
  if (entries.length === 0) return 0
  if (!bypassSecret.trim()) {
    throw new Error('Missing VERCEL_AUTOMATION_BYPASS_SECRET')
  }
  for (const entry of entries) {
    validatePath(entry.path, origin)
    validatePath(entry.href, origin)
    if (!entry.href.endsWith('.md') || !entry.locale.trim()) {
      throw new Error(
        'Deployment manifest must identify Markdown files and locales'
      )
    }
  }
  let checks = 0
  async function check(options: ResponseOptions): Promise<void> {
    const {
      pathname,
      method,
      accept,
      status,
      contentType,
      locale,
      location,
      shouldVary
    } = options
    const label = `${method} ${pathname} (${accept})`
    let response: Response
    let body: string
    try {
      response = await request(
        new Request(new URL(pathname, origin), {
          method,
          headers: { accept, 'x-vercel-protection-bypass': bypassSecret },
          redirect: 'manual',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT)
        })
      )
      body = await response.text()
    } catch {
      // Transport errors can contain request headers, including the bypass token.
      throw new Error(`Deployment request failed: ${label}`)
    }
    if (response.status !== status) {
      throw new Error(
        `${label}: expected status ${status}, received ${response.status}`
      )
    }
    if (
      contentType &&
      response.headers.get('content-type')?.split(';')[0]?.trim() !==
        contentType
    ) {
      throw new Error(`${label}: expected Content-Type ${contentType}`)
    }
    if (shouldVary && !hasDirective(response.headers.get('vary'), 'accept')) {
      throw new Error(`${label}: missing Vary: Accept`)
    }
    if (
      location &&
      (response.headers.get('location') !== location ||
        !hasDirective(response.headers.get('cache-control'), 'private') ||
        !hasDirective(response.headers.get('cache-control'), 'no-store'))
    ) {
      throw new Error(`${label}: invalid Markdown redirect or cache policy`)
    }
    if (locale && response.headers.get('content-language') !== locale) {
      throw new Error(`${label}: incorrect Content-Language`)
    }
    validateBody({ method, contentType, body, label })
    checks += 1
  }
  for (const { path, href, locale } of entries) {
    const paths = new Set([path, `${path.replace(/\/$/u, '')}/`])
    for (const method of ['GET', 'HEAD'] as const) {
      for (const pathname of paths) {
        await check({
          pathname,
          method,
          accept: BROWSER_ACCEPT,
          status: HTTP_OK,
          contentType: 'text/html',
          shouldVary: true
        })
        await check({
          pathname,
          method,
          accept: 'text/markdown',
          status: HTTP_TEMPORARY_REDIRECT,
          location: href,
          shouldVary: true
        })
      }
      await check({
        pathname: href,
        method,
        accept: '*/*',
        status: HTTP_OK,
        contentType: 'text/markdown',
        locale
      })
    }
  }
  return checks
}
