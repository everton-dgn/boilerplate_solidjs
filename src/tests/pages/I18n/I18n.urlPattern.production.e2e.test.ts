import type { Page } from '@playwright/test'

import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'
import { watchCspViolations } from '@/tests/helpers/watchCspViolations/index.ts'

type UrlPatternKind = 'native' | 'polyfill' | 'missing'

type LoadedPage = { scripts: Set<string>; urlPattern: UrlPatternKind }

const POLYFILL_CHUNK = /\/assets\/urlpattern-polyfill-[\w-]+\.js$/u

const readUrlPatternKind = (page: Page) =>
  page.evaluate<UrlPatternKind>(() => {
    if (typeof URLPattern !== 'function') return 'missing'
    return URLPattern.toString().includes('[native code]')
      ? 'native'
      : 'polyfill'
  })

async function loadHome(page: Page): Promise<LoadedPage> {
  const scripts = new Set<string>()
  page.on('request', request => {
    if (request.resourceType() === 'script') {
      scripts.add(new URL(request.url()).pathname)
    }
  })
  await page.goto('/pt')
  await expect.poll(() => hydrationFinished(page)).toBe(true)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'SolidJS Boilerplate para aplicações web'
  )
  // A cópia encerra a coleta no mesmo ponto nas duas páginas.
  return {
    scripts: new Set(scripts),
    urlPattern: await readUrlPatternKind(page)
  }
}

// O target do build inclui navegadores sem a API (docs/i18n.md); o Chromium
// simula esse caminho removendo o global.
test('loads the URLPattern polyfill only without the native API and keeps the localized navigation', async ({
  browser,
  page,
  pageErrors,
  cspViolations
}) => {
  const nativeContext = await browser.newContext()
  try {
    const nativePage = await nativeContext.newPage()
    const nativeErrors: string[] = []
    nativePage.on('pageerror', error => nativeErrors.push(error.message))
    const nativeViolations = await watchCspViolations(nativePage)
    const native = await loadHome(nativePage)
    expect(native.urlPattern).toBe('native')
    expect(nativeErrors).toEqual([])
    expect(nativeViolations).toEqual([])

    await page.addInitScript(() => {
      Reflect.deleteProperty(globalThis, 'URLPattern')
    })
    const fallback = await loadHome(page)
    expect(fallback.urlPattern).toBe('polyfill')
    expect(
      [...native.scripts].filter(path => !fallback.scripts.has(path))
    ).toEqual([])
    expect(
      [...fallback.scripts].filter(path => !native.scripts.has(path))
    ).toEqual([expect.stringMatching(POLYFILL_CHUNK)])
  } finally {
    await nativeContext.close()
  }

  await page.getByRole('link', { name: '404', exact: true }).click()
  await expect(page).toHaveURL('/pt/404')
  await expect(page).toHaveTitle('Página não encontrada')
  await page.getByRole('link', { name: 'Voltar ao início' }).click()
  await expect(page).toHaveURL('/pt')
  await page.getByRole('button', { name: 'Selecionar idioma' }).click()
  await page
    .getByRole('menuitemradio', { name: 'English', exact: true })
    .click()
  await expect(page).toHaveURL('/en')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'SolidJS Boilerplate for web applications'
  )
  await expect.poll(() => hydrationFinished(page)).toBe(true)
  expect(await readUrlPatternKind(page)).toBe('polyfill')
  expect(pageErrors).toEqual([])
  expect(cspViolations).toEqual([])
})
