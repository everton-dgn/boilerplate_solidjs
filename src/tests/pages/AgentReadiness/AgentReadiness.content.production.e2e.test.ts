import { expect, test } from '@playwright/test'

import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'
import { watchCspViolations } from '@/tests/helpers/watchCspViolations/index.ts'

test.use({ headless: true })

const HTTP_OK = 200
const MIN_CONTENT_CHARACTERS = 500
const MOBILE_WIDTH = 375
const DESKTOP_WIDTH = 1280
const VIEWPORT_HEIGHT = 800
const SUBHEADING_LEVEL = 2
const LANGUAGES = [
  {
    locale: 'pt',
    tag: 'pt-BR',
    theme: 'Selecionar tema',
    dark: 'Escuro',
    headings: [
      'SolidJS Boilerplate para aplicações web',
      'Sobre o SolidJS Boilerplate',
      'Contato',
      'Privacidade'
    ]
  },
  {
    locale: 'en',
    tag: 'en-US',
    theme: 'Select theme',
    dark: 'Dark',
    headings: [
      'SolidJS Boilerplate for web applications',
      'About SolidJS Boilerplate',
      'Contact',
      'Privacy'
    ]
  },
  {
    locale: 'es',
    tag: 'es-ES',
    theme: 'Seleccionar tema',
    dark: 'Oscuro',
    headings: [
      'SolidJS Boilerplate para aplicaciones web',
      'Acerca de SolidJS Boilerplate',
      'Contacto',
      'Privacidad'
    ]
  }
]
const PATHS = ['', '/about', '/contact', '/privacy']

function readMainContent(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const main = document.querySelector('main')
  for (const element of main?.querySelectorAll(
    'script, style, template, noscript, svg, [hidden], [aria-hidden="true"]'
  ) ?? []) {
    element.remove()
  }
  return {
    text: main?.textContent.replaceAll(/\s+/gu, ' ').trim() ?? '',
    headings: [...(main?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? [])].map(
      heading => Number(heading.tagName.slice(1))
    )
  }
}

for (const language of LANGUAGES) {
  // oxlint-disable-next-line vitest/prefer-each -- O Playwright não oferece test.each.
  for (const [index, path] of PATHS.entries()) {
    test(`${language.locale}${path || '/'} publishes readable content and discovery links without JavaScript`, async ({
      browser,
      baseURL,
      request
    }) => {
      const pathname = `/${language.locale}${path}`
      const response = await request.get(pathname, {
        headers: { accept: 'text/html' },
        maxRedirects: 0
      })
      expect(response.status()).toBe(HTTP_OK)
      expect(response.headers()['content-type']).toContain('text/html')
      const html = await response.text()
      const markdown = await request.get(pathname, {
        headers: { accept: 'text/markdown' }
      })
      expect(markdown.status()).toBe(HTTP_OK)
      const markdownBody = await markdown.text()
      expect(markdownBody).toContain(`# ${language.headings[index]}`)
      const context = await browser.newContext({
        baseURL,
        javaScriptEnabled: false
      })
      try {
        const page = await context.newPage()
        const navigation = await page.goto(pathname)
        expect(navigation?.status()).toBe(HTTP_OK)
        const main = page.getByRole('main')
        await expect(main).toHaveCount(1)
        const heading = main.getByRole('heading', { level: 1 })
        await expect(heading).toHaveCount(1)
        await expect(heading).toHaveText(language.headings[index] ?? '')
        await expect(heading).toBeVisible()
        // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- A contagem precisa excluir texto oculto por CSS.
        const visibleText = await main.innerText()
        const content = await page.evaluate(readMainContent, html)
        expect(
          visibleText.replaceAll(/\s+/gu, ' ').trim().length
        ).toBeGreaterThanOrEqual(MIN_CONTENT_CHARACTERS)
        expect(content.text.length).toBeGreaterThanOrEqual(
          MIN_CONTENT_CHARACTERS
        )
        if (path === '') {
          await expect(main.locator('footer')).toHaveCount(0)
          await expect(main.getByRole('heading', { level: 2 })).toHaveCount(0)
          await expect(main.locator('h1 + p')).toHaveText(/SolidJS 2/u)
          expect(markdownBody).not.toContain('\n## ')
        } else {
          expect(content.headings).toContain(SUBHEADING_LEVEL)
        }
        expect(content.headings[0]).toBe(1)
        expect(content.headings.filter(level => level === 1)).toHaveLength(1)
        for (const [position, level] of content.headings.entries()) {
          expect(level).toBeLessThanOrEqual(
            (content.headings[position - 1] ?? 0) + 1
          )
        }
        await expect(page.locator('html')).toHaveAttribute('lang', language.tag)
        await expect(
          page.locator('head link[rel="canonical"]')
        ).toHaveAttribute('href', `${readSiteOrigin()}${pathname}`)
        for (const alternate of LANGUAGES) {
          await expect(
            page.locator(`head link[hreflang="${alternate.locale}"]`)
          ).toHaveAttribute(
            'href',
            `${readSiteOrigin()}/${alternate.locale}${path}`
          )
        }
        await expect(
          page.locator('head link[hreflang="x-default"]')
        ).toHaveAttribute('href', `${readSiteOrigin()}/en${path}`)
        for (const destination of PATHS) {
          const link = page
            .locator('header > nav')
            .locator(`a[href="/${language.locale}${destination}"]`)
          await expect(link).toBeVisible()
          await expect(link).toHaveAccessibleName(/\S/u)
        }
      } finally {
        await context.close()
      }
    })
  }

  // oxlint-disable-next-line vitest/prefer-each -- O Playwright não oferece test.each.
  for (const width of [MOBILE_WIDTH, DESKTOP_WIDTH]) {
    test(`${language.locale} content fits ${width}px and keeps theme and locale during navigation`, async ({
      browser,
      baseURL
    }, testInfo) => {
      const context = await browser.newContext({
        baseURL,
        viewport: { width, height: VIEWPORT_HEIGHT },
        colorScheme: 'light'
      })
      try {
        const page = await context.newPage()
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        const violations = await watchCspViolations(page)
        await page.goto(`/${language.locale}`)
        await expect.poll(() => hydrationFinished(page)).toBe(true)
        const markdownAlternate = page.locator(
          'head link[rel="alternate"][type="text/markdown"]'
        )
        await expect(markdownAlternate).toHaveAttribute(
          'href',
          new RegExp(`/${language.locale}/index\\.md$`, 'u')
        )
        await page.getByRole('button', { name: language.theme }).click()
        await page
          .getByRole('menuitemradio', { name: language.dark, exact: true })
          .click()
        await expect(page.locator('html')).toHaveClass('dark')
        const header = await page.getByRole('banner').elementHandle()
        expect(header).not.toBeNull()

        for (const [index, path] of PATHS.entries()) {
          await page
            .locator('header > nav')
            .locator(`a[href="/${language.locale}${path}"]`)
            .click()
          await expect(page).toHaveURL(`/${language.locale}${path}`)
          await expect(markdownAlternate).toHaveAttribute(
            'href',
            new RegExp(
              `/${language.locale}${path ? `${path}\\.md` : String.raw`/index\.md`}$`,
              'u'
            )
          )
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(
            language.headings[index] ?? ''
          )
          await expect(page.locator('html')).toHaveAttribute(
            'lang',
            language.tag
          )
          await expect(page.locator('html')).toHaveClass('dark')
          await page.evaluate(() => document.fonts.ready)
          expect(
            await page.evaluate(
              () =>
                document.documentElement.scrollWidth <= globalThis.innerWidth
            )
          ).toBe(true)
          expect(
            await header.evaluate(
              element => element === document.querySelector('header')
            )
          ).toBe(true)
          if (language.locale === 'pt') {
            await page.evaluate(() =>
              globalThis.scrollTo({ top: 0, left: 0, behavior: 'instant' })
            )
            await page.screenshot({
              path: testInfo.outputPath(
                `${path.slice(1) || 'home'}-${width}.png`
              ),
              fullPage: true
            })
          }
        }
        await page.reload()
        await expect.poll(() => hydrationFinished(page)).toBe(true)
        await expect(page.locator('html')).toHaveAttribute('lang', language.tag)
        await expect(page.locator('html')).toHaveClass('dark')
        await page.getByRole('button', { name: language.theme }).click()
        await expect(
          page.getByRole('menuitemradio', {
            name: language.dark,
            exact: true
          })
        ).toHaveAttribute('aria-checked', 'true')
        expect(errors).toEqual([])
        expect(violations).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
}
