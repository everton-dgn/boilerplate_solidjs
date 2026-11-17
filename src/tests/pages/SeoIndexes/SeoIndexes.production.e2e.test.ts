import { readdir } from 'node:fs/promises'
import nodePath from 'node:path'

import { expect, test } from '@playwright/test'

import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'

const LOCALES = ['pt', 'en', 'es']
const PAGE_PATHS = ['', '/about', '/contact', '/privacy']
const EXPECTED_SITEMAP_URLS = LOCALES.flatMap(locale =>
  PAGE_PATHS.map(path => `${readSiteOrigin()}/${locale}${path}`)
)
const HTTP_OK = 200
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405
const CACHE_CONTROL = 'public, max-age=0, s-maxage=3600, stale-if-error=86400'
// Responses with s-maxage do not carry the nonce of the request to the cache.
const NO_SCRIPTS = "script-src 'none'"
// Group of the AI training robots: starts at GPTBot and ends blocking everything.
const AI_BOTS_GROUP =
  /\nUser-agent: GPTBot\n(?:User-agent: [^\n]+\n)*Disallow: \/\n/u
const SEO_ROUTES = nodePath.resolve(
  import.meta.dirname,
  '../../../routes/(seo)'
)

// Folders and colocated modules in src/routes/(seo)/, except the endpoints, read
// from the tree so that a new helper enters the check.
function localModulePath(entry: string): string | undefined {
  const parts = entry.split(nodePath.sep)
  if (parts.length === 1 || parts.includes('__tests__')) return undefined
  if (nodePath.basename(entry) === 'index.ts') return undefined
  return `/${parts.join('/').replace(/\.ts$/u, '')}`
}

const SEO_ENTRIES = await readdir(SEO_ROUTES, {
  recursive: true,
  encoding: 'utf8'
})
const LOCAL_MODULES = SEO_ENTRIES.flatMap(
  entry => localModulePath(entry) ?? []
).toSorted()

test.describe('indexes in the real production tree', () => {
  for (const method of ['GET', 'HEAD']) {
    for (const path of ['/sitemaps/pages/1', '/sitemaps/blog/1']) {
      test(`refuses ${method} ${path} without the XML suffix`, async ({
        request
      }) => {
        const response = await request.fetch(path, {
          method,
          maxRedirects: 0
        })
        expect(response.status()).toBe(HTTP_NOT_FOUND)
        expect(response.headers()['cache-control']).toBe('no-store')
        expect(await response.body()).toHaveLength(0)
      })
    }
  }

  test('serves sitemap.xml without a redirect', async ({ request }) => {
    const response = await request.get('/sitemap.xml', { maxRedirects: 0 })
    expect(response.status()).toBe(HTTP_OK)
    // Without dynamic sources the root is a build file, delivered without the function.
    expect(response.headers()['content-type']).toContain('application/xml')
    const xml = await response.text()
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
    )
    const urls = [...xml.matchAll(/<loc>(?<url>[^<]+)<\/loc>/gu)].map(
      match => match.groups?.url
    )
    expect(new Set(urls)).toStrictEqual(new Set(EXPECTED_SITEMAP_URLS))
    expect(urls).toHaveLength(EXPECTED_SITEMAP_URLS.length)
    expect(xml).toContain('</urlset>')
    expect(xml).not.toContain('/helpers/')
    expect(xml).not.toContain('(seo)')
    expect(xml).not.toContain('(base)')
  })

  test('serves robots.txt without a redirect', async ({ request }) => {
    const response = await request.get('/robots.txt', { maxRedirects: 0 })
    expect(response.status()).toBe(HTTP_OK)
    expect(response.headers()['content-type']).toContain('text/plain')
    expect(response.headers()['cache-control']).toBe(CACHE_CONTROL)
    expect(response.headers()['content-security-policy']).toContain(NO_SCRIPTS)
    expect(response.headers()['content-security-policy']).not.toContain(
      'nonce-'
    )
    const text = await response.text()
    expect(
      text.startsWith('User-agent: *\nAllow: /\nDisallow: /_server\n')
    ).toBe(true)
    expect(text).toMatch(AI_BOTS_GROUP)
    expect(text.endsWith(`\nSitemap: ${readSiteOrigin()}/sitemap.xml\n`)).toBe(
      true
    )
  })

  // Without the 405, the render would treat the method without a handler as the 404 page.
  test('refuses methods without a handler on the API route', async ({
    request
  }) => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await request.fetch('/robots.txt', {
        method,
        maxRedirects: 0
      })
      expect(response.status(), method).toBe(HTTP_METHOD_NOT_ALLOWED)
      expect(response.headers().allow).toBe('GET, HEAD')
      expect(await response.body()).toHaveLength(0)
    }
  })

  test('serves llms.txt without a redirect', async ({ request }) => {
    const response = await request.get('/llms.txt', { maxRedirects: 0 })
    expect(response.status()).toBe(HTTP_OK)
    // Build file: on Vercel the type comes from the overrides of the artifact,
    // checked in the build test; the local preview uses the extension.
    expect(response.headers()['content-type']).toContain('text/plain')
    const markdown = await response.text()
    expect(markdown).toMatch(/^# .+\n/u)
    const useCases = markdown.split('## When to use\n\n')[1]?.split('\n## ')[0]
    expect(useCases).toContain(`](${readSiteOrigin()}/en/index.md): `)
    expect(useCases).toContain(`](${readSiteOrigin()}/en/about.md): `)
    expect(useCases?.trim().split('\n')).toEqual([
      expect.stringMatching(/^- \[[^\]]+\]\([^)]+\): .{20,}$/u),
      expect.stringMatching(/^- \[[^\]]+\]\([^)]+\): .{20,}$/u)
    ])
    expect(markdown.indexOf('## When to use\n')).toBeLessThan(
      markdown.indexOf('## Pages\n')
    )
    expect(markdown).toContain('## Pages\n')
    for (const path of PAGE_PATHS) {
      expect(markdown).toContain(
        `](${readSiteOrigin()}/en${path ? `${path}.md` : '/index.md'})`
      )
    }
    expect(markdown).toContain('This index uses English.')
    expect(markdown).not.toContain('/helpers/')
    expect(markdown).not.toContain('(seo)')
  })

  for (const path of LOCAL_MODULES) {
    test(`does not publish the local module ${path}`, async ({ request }) => {
      // createAPIHandler matches the raw pathname, before the locale prefix: a
      // module published by mistake would answer without the prefix.
      const raw = await request.get(path, { maxRedirects: 0 })
      expect(raw.status()).not.toBe(HTTP_OK)
      const localized = await request.get(`/pt${path}`, { maxRedirects: 0 })
      expect(localized.status()).toBe(HTTP_NOT_FOUND)
    })
  }

  test('does not include the E2E fixture tree', async ({ request }) => {
    const response = await request.get('/pt/seo-public', { maxRedirects: 0 })
    expect(response.status()).toBe(HTTP_NOT_FOUND)
  })
})
