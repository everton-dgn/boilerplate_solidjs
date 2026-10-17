import { expect, test } from '@playwright/test'

const HTTP_OK = 200

const LOCALES = ['pt', 'en', 'es']
const PAGES = ['', '/about', '/contact', '/privacy']

test.use({ headless: true })

for (const locale of LOCALES) {
  // oxlint-disable-next-line vitest/prefer-each -- Playwright não oferece test.each.
  for (const path of PAGES) {
    test(`serves ${locale}${path || '/'} Markdown from the deployed HTML page`, async ({
      request,
      browser,
      baseURL
    }) => {
      const pathname = `/${locale}${path}`
      const href = path ? `${pathname}.md` : `${pathname}/index.md`
      const response = await request.get(href, { maxRedirects: 0 })
      expect(response.status()).toBe(HTTP_OK)
      expect(response.headers()['content-type']).toContain('text/markdown')
      expect(response.headers()['content-language']).toBe(locale)
      expect(response.headers()['cache-control']).toBe('private, no-store')
      const markdown = await response.text()
      const negotiated = await request.get(pathname, {
        headers: { accept: 'text/markdown' },
        maxRedirects: 0
      })
      expect(negotiated.status()).toBe(HTTP_OK)
      expect(await negotiated.text()).toBe(markdown)
      const context = await browser.newContext({
        baseURL,
        javaScriptEnabled: false
      })
      try {
        const page = await context.newPage()
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
      } finally {
        await context.close()
      }
    })
  }
}
