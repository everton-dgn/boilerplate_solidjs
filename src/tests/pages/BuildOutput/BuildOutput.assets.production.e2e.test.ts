import { Buffer } from 'node:buffer'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'
import * as v from 'valibot'

type AssetCase = { extension: string; contentType: string }

const HTTP_OK = 200
const HTTP_NOT_FOUND = 404
const IMMUTABLE = 'public, max-age=31536000, immutable'
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const STATIC_ASSETS = path.join(ROOT, '.vercel/output/static/assets')
const BUILD_CONFIG = path.join(ROOT, '.vercel/output/config.json')
// O tipo do acerto vem do servidor estático; o woff2 só não pode ser HTML.
const ASSET_CASES: AssetCase[] = [
  { extension: '.js', contentType: 'javascript' },
  { extension: '.css', contentType: 'text/css' },
  { extension: '.woff2', contentType: '' }
]
const MISSING_PATHS = [
  ...ASSET_CASES.map(({ extension }) => `/assets/missing-00000000${extension}`),
  '/assets/nested/missing-00000000.js'
]
const METHODS = ['GET', 'HEAD']

const headersSchema = v.record(v.string(), v.string())
const routeSchema = v.object({
  src: v.optional(v.string()),
  dest: v.optional(v.string()),
  handle: v.optional(v.string()),
  status: v.optional(v.number()),
  headers: v.optional(headersSchema),
  continue: v.optional(v.boolean())
})
const buildConfigSchema = v.object({ routes: v.array(routeSchema) })

type Route = v.InferOutput<typeof routeSchema>
type RouteMatch = { route: Route; pathname: string }

function matches({ route, pathname }: RouteMatch): boolean {
  return route.src !== undefined && new RegExp(route.src, 'u').test(pathname)
}

async function findAsset(extension: string): Promise<string> {
  const files = await readdir(STATIC_ASSETS)
  const file = files.find(name => name.endsWith(extension))
  if (!file) throw new Error(`No published ${extension} asset`)
  return file
}

test.use({ javaScriptEnabled: false })

// O Nitro RC gera essa ordem a partir de publicAssets sem fallthrough; o teste
// falha se uma atualização devolver o miss à função com o cache imutável.
test('routes missing assets to an uncached 404 after the filesystem', async () => {
  const { routes } = v.parse(
    buildConfigSchema,
    JSON.parse(await readFile(BUILD_CONFIG, 'utf8'))
  )
  const filesystem = routes.findIndex(route => route.handle === 'filesystem')
  expect(filesystem).toBeGreaterThan(0)
  const before = routes.slice(0, filesystem)
  const after = routes.slice(filesystem + 1)
  for (const pathname of MISSING_PATHS) {
    const cache = before.find(
      route =>
        route.continue === true &&
        route.headers?.['cache-control'] === IMMUTABLE &&
        matches({ route, pathname })
    )
    expect(cache?.headers, pathname).toMatchObject({
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin'
    })
    expect(
      before.filter(route => !route.continue && matches({ route, pathname })),
      pathname
    ).toEqual([])
    const miss = after.find(route => matches({ route, pathname }))
    expect(miss, pathname).toMatchObject({
      status: HTTP_NOT_FOUND,
      headers: { 'cache-control': 'no-store' }
    })
    expect(miss?.dest, pathname).toBeUndefined()
  }
})

for (const pathname of MISSING_PATHS) {
  for (const method of METHODS) {
    test(`answers ${method} ${pathname} with an uncached 404 outside the SSR`, async ({
      request
    }) => {
      const response = await request.fetch(pathname, {
        method,
        maxRedirects: 0
      })
      expect(response.status()).toBe(HTTP_NOT_FOUND)
      expect(response.headers()).toMatchObject({
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'same-origin'
      })
      expect(response.headers()['content-type'] ?? '').not.toContain(
        'text/html'
      )
      expect(await response.text()).not.toMatch(/<!doctype|<html/iu)
    })
  }
}

// No preview o acerto sai do servidor estático do srvx, sem Cache-Control; o
// cache imutável dos acertos é conferido na configuração da Vercel acima.
for (const { extension, contentType } of ASSET_CASES) {
  for (const method of METHODS) {
    test(`serves ${method} of a published ${extension} asset`, async ({
      request
    }) => {
      const file = await findAsset(extension)
      const response = await request.fetch(`/assets/${file}`, { method })
      expect(response.status()).toBe(HTTP_OK)
      const type = response.headers()['content-type'] ?? ''
      expect(type).not.toContain('text/html')
      expect(type).toContain(contentType)
      const expected =
        method === 'HEAD'
          ? Buffer.alloc(0)
          : await readFile(path.join(STATIC_ASSETS, file))
      expect(await response.body()).toEqual(expected)
    })
  }
}
