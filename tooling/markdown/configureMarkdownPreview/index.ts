import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import * as v from 'valibot'
import type { PreviewServer } from 'vite-plus'

import { MARKDOWN_HEADERS } from '../constants.ts'

const manifestSchema = v.array(
  v.object({ href: v.string(), locale: v.string() })
)
const HTTP_NOT_MODIFIED = 304

export async function configureMarkdownPreview(
  server: PreviewServer
): Promise<void> {
  const output = path.join(server.config.root, '.vercel/output')
  const manifestFile = path.join(output, 'markdown.json')
  let manifest: string
  try {
    manifest = await readFile(manifestFile, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        'Markdown build output is missing; run vp run build before preview',
        { cause: error }
      )
    }
    throw error
  }
  const entries = v.parse(manifestSchema, JSON.parse(manifest))
  const publicRoot = path.join(output, 'static')
  const assets = new Map(
    await Promise.all(
      entries.map(async entry => {
        const file = path.join(publicRoot, decodeURIComponent(entry.href))
        if (!file.startsWith(`${publicRoot}${path.sep}`)) {
          throw new Error('Invalid Markdown preview path')
        }
        const body = await readFile(file)
        return [
          entry.href,
          {
            ...entry,
            body,
            etag: `"${createHash('sha256').update(body).digest('hex')}"`
          }
        ] as const
      })
    )
  )
  // O preview do Nitro usa o servidor estático do srvx e ignora os headers
  // do Build Output da Vercel. Aqui só se leem os artefatos daquele build.
  server.middlewares.use((request, response, next) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost')
    const asset = assets.get(pathname)
    if (!asset || (request.method !== 'GET' && request.method !== 'HEAD')) {
      next()
      return
    }
    for (const [name, value] of Object.entries(MARKDOWN_HEADERS)) {
      response.setHeader(name, value)
    }
    response.setHeader('content-language', asset.locale)
    response.setHeader('etag', asset.etag)
    if (request.headers['if-none-match'] === asset.etag) {
      response.statusCode = HTTP_NOT_MODIFIED
      response.end()
      return
    }
    response.setHeader('content-length', asset.body.length)
    response.end(request.method === 'HEAD' ? undefined : asset.body)
  })
}
