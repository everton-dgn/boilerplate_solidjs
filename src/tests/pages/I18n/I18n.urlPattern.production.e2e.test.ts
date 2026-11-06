import type { Page } from '@playwright/test'

import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

type LoadedPage = { scripts: Set<string>; isNative: boolean }

const isNativeUrlPattern = (page: Page) =>
  page.evaluate(() => URLPattern.toString().includes('[native code]'))

async function loadHome(page: Page): Promise<LoadedPage> {
  const scripts = new Set<string>()
  page.on('request', request => {
    if (request.resourceType() === 'script') {
      scripts.add(new URL(request.url()).pathname)
    }
  })
  await page.goto('/pt')
  await expect.poll(() => hydrationFinished(page)).toBe(true)
  return { scripts, isNative: await isNativeUrlPattern(page) }
}

// Firefox 114 a 141 e Safari 16.4 a 18 estão no target do build sem a API
// nativa; o Chromium dos testes simula esse caminho removendo o global.
test('loads the URLPattern polyfill only without the native API and keeps the localized navigation', async ({
  browser,
  baseURL,
  page,
  pageErrors,
  cspViolations
}) => {
  const nativeContext = await browser.newContext({ baseURL })
  try {
    const native = await loadHome(await nativeContext.newPage())
    expect(native.isNative).toBe(true)

    await page.addInitScript(() => {
      Reflect.deleteProperty(globalThis, 'URLPattern')
    })
    const fallback = await loadHome(page)
    expect(fallback.isNative).toBe(false)
    expect(
      [...native.scripts].filter(path => !fallback.scripts.has(path))
    ).toEqual([])
    expect(
      [...fallback.scripts].filter(path => !native.scripts.has(path))
    ).toHaveLength(1)
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
  expect(await isNativeUrlPattern(page)).toBe(false)
  expect(pageErrors).toEqual([])
  expect(cspViolations).toEqual([])
})
