import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'
import * as v from 'valibot'

const HTTP_OK = 200

const LOCALES = ['pt', 'en', 'es']
const PAGES = ['', '/about', '/contact', '/privacy']
const STATIC_OUTPUT = new URL(
  '../../../../.vercel/output/static/',
  import.meta.url
)
const VERCEL_CONFIG = new URL('../../../../vercel.json', import.meta.url)
const BUILD_CONFIG = new URL(
  '../../../../.vercel/output/config.json',
  import.meta.url
)

const headerSchema = v.object({ key: v.string(), value: v.string() })
const ruleSchema = v.object({
  source: v.string(),
  headers: v.array(headerSchema)
})
const configSchema = v.object({ headers: v.array(ruleSchema) })
const buildRouteSchema = v.object({
  src: v.optional(v.string()),
  dest: v.optional(v.string()),
  handle: v.optional(v.string()),
  continue: v.optional(v.boolean())
})
const buildConfigSchema = v.object({ routes: v.array(buildRouteSchema) })

test.use({ headless: true, javaScriptEnabled: false })

test('routes HTML home pages before static Markdown directory indexes', async () => {
  const config = v.parse(
    buildConfigSchema,
    JSON.parse(await readFile(BUILD_CONFIG, 'utf8'))
  )
  const filesystem = config.routes.findIndex(
    route => route.handle === 'filesystem'
  )
  expect(filesystem).toBeGreaterThanOrEqual(0)
  const firstPhase = config.routes.findIndex(
    route => route.handle !== undefined
  )
  const routes = config.routes.slice(0, firstPhase)
  for (const locale of LOCALES) {
    for (const pathname of [`/${locale}`, `/${locale}/`]) {
      const route = routes.find(
        candidate =>
          candidate.src !== undefined &&
          !candidate.continue &&
          new RegExp(candidate.src, 'u').test(pathname)
      )
      expect(route?.dest, pathname).toBe('/__server')
    }
    const markdown = `/${locale}/index.md`
    expect(
      routes.some(
        route =>
          route.src !== undefined &&
          !route.continue &&
          new RegExp(route.src, 'u').test(markdown)
      ),
      markdown
    ).toBe(false)
  }
})

test('declares the headers of the static Markdown files', async () => {
  const config = v.parse(
    configSchema,
    JSON.parse(await readFile(VERCEL_CONFIG, 'utf8'))
  )
  const rule = config.headers.find(({ source }) => source === '/(.*).md')
  expect(
    Object.fromEntries(
      rule?.headers.map(({ key, value }) => [key, value]) ?? []
    )
  ).toStrictEqual({
    'Content-Type': 'text/markdown; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin'
  })
})

for (const locale of LOCALES) {
  for (const path of PAGES) {
    test(`serves ${locale}${path || '/'} Markdown generated at build time`, async ({
      request,
      page
    }) => {
      const pathname = `/${locale}${path}`
      const href = path ? `${pathname}.md` : `${pathname}/index.md`
      const markdown = await readFile(
        new URL(href.slice(1), STATIC_OUTPUT),
        'utf8'
      )
      const response = await request.get(href, { maxRedirects: 0 })
      expect(await response.text()).toBe(markdown)
      const negotiated = await request.get(pathname, {
        headers: { accept: 'text/markdown' },
        maxRedirects: 0
      })
      expect(negotiated.status()).toBe(HTTP_OK)
      expect(negotiated.headers()['cache-control']).toBe('private, no-store')
      expect(await negotiated.text()).toBe(markdown)
      await page.goto(pathname)
      const main = page.getByRole('main')
      const headings = await main.locator('h1, h2, h3').allTextContents()
      expect(headings.length).toBeGreaterThan(0)
      for (const heading of headings) {
        expect(markdown).toContain(heading.trim())
      }
      const fragments = await main.locator('p').evaluateAll(paragraphs =>
        paragraphs.flatMap(paragraph => {
          const walker = document.createTreeWalker(
            paragraph,
            NodeFilter.SHOW_TEXT
          )
          const texts: string[] = []
          while (walker.nextNode()) {
            const text = walker.currentNode.textContent?.trim()
            if (text) texts.push(text)
          }
          return texts
        })
      )
      expect(fragments.length).toBeGreaterThan(0)
      for (const fragment of fragments) {
        expect(markdown).toContain(fragment)
      }
    })
  }
}
