import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'
import * as v from 'valibot'

const ROOT = new URL('../../../../', import.meta.url)
const OUTPUT = new URL('.vercel/output/', ROOT)
const STATIC = new URL('static/', OUTPUT)
const HTTP_OK = 200
const HTTP_REDIRECT = 307
const LOCALES = ['pt', 'en', 'es']
const PAGES = [
  { name: '', directory: '(home)', file: 'index.md', titleKey: 'home_title' },
  {
    name: '/about',
    directory: 'about',
    file: 'about.md',
    titleKey: 'about_title'
  },
  {
    name: '/contact',
    directory: 'contact',
    file: 'contact.md',
    titleKey: 'contact_title'
  },
  {
    name: '/privacy',
    directory: 'privacy',
    file: 'privacy.md',
    titleKey: 'privacy_title'
  }
]
const EXPECTED_FILES = LOCALES.flatMap(locale =>
  PAGES.map(page => `${locale}/${page.file}`)
)
const EXPECTED_MANIFEST = LOCALES.flatMap(locale =>
  PAGES.map(page => ({ href: `/${locale}/${page.file}`, locale }))
)
const catalogSchema = v.record(v.string(), v.string())
const headersSchema = v.record(v.string(), v.string())
const deploymentRouteSchema = v.object({
  src: v.optional(v.string()),
  handle: v.optional(v.string()),
  headers: v.optional(headersSchema),
  continue: v.optional(v.boolean())
})
const deploymentSchema = v.object({
  routes: v.array(deploymentRouteSchema)
})

test('publishes Markdown files and routing metadata in the final Nitro output', async () => {
  const outputFiles = await readdir(STATIC, { recursive: true })
  const files = outputFiles
    .filter(file => file.endsWith('.md'))
    .map(file => file.split(path.sep).join('/'))
  expect(files.toSorted()).toEqual(EXPECTED_FILES.toSorted())

  const manifest: unknown = JSON.parse(
    await readFile(new URL('markdown.json', OUTPUT), 'utf8')
  )
  expect(manifest).toHaveLength(EXPECTED_MANIFEST.length)
  expect(manifest).toEqual(expect.arrayContaining(EXPECTED_MANIFEST))

  const configText = await readFile(new URL('config.json', OUTPUT), 'utf8')
  const config = v.parse(deploymentSchema, JSON.parse(configText))
  const filesystemIndex = config.routes.findIndex(
    route => route.handle === 'filesystem'
  )
  expect(filesystemIndex).toBeGreaterThanOrEqual(0)
  for (const file of EXPECTED_FILES) {
    const routeIndex = config.routes.findIndex(
      route => route.src === `^/${file.replaceAll('.', String.raw`\.`)}$`
    )
    expect(
      routeIndex,
      `Missing deployment rule for /${file}`
    ).toBeGreaterThanOrEqual(0)
    expect(routeIndex).toBeLessThan(filesystemIndex)
    expect(config.routes[routeIndex]).toMatchObject({
      continue: true,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-language': file.split('/')[0],
        'cache-control': 'public, max-age=0, must-revalidate',
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'same-origin'
      }
    })
  }
})

for (const locale of LOCALES) {
  // oxlint-disable-next-line vitest/prefer-each -- Playwright has no test.each.
  for (const page of PAGES) {
    test(`serves the built ${locale}/${page.file} from the matching page producer`, async ({
      request
    }) => {
      const artifact = await readFile(new URL(`${locale}/${page.file}`, STATIC))
      const catalogFile = new URL(
        `src/routes/(base)/${page.directory}/i18n/${locale}.json`,
        ROOT
      )
      const catalogText = await readFile(catalogFile, 'utf8')
      const catalog = v.parse(catalogSchema, JSON.parse(catalogText))
      const title = catalog[page.titleKey]
      expect(title).toBeDefined()
      expect(artifact.toString('utf8').split('\n')[0]).toBe(`# ${title}`)

      const redirect = await request.get(`/${locale}${page.name}`, {
        maxRedirects: 0,
        headers: { accept: 'text/markdown' }
      })
      const href = `/${locale}/${page.file}`
      expect(redirect.status()).toBe(HTTP_REDIRECT)
      expect(redirect.headers().location).toBe(href)

      const response = await request.get(href, { maxRedirects: 0 })
      expect(response.status()).toBe(HTTP_OK)
      expect(response.headers()['content-type']).toBe(
        'text/markdown; charset=utf-8'
      )
      expect(response.headers()['content-language']).toBe(locale)
      expect(await response.body()).toEqual(artifact)
    })
  }
}
