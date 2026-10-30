import { readFile } from 'node:fs/promises'

import { expect, test, type APIRequestContext } from '@playwright/test'
import * as v from 'valibot'

import { holdRoute } from '@/tests/helpers/holdRoute/index.ts'
import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { watchEntryLoad } from '@/tests/helpers/watchEntryLoad/index.ts'

const chunkSchema = v.object({
  file: v.string()
})
const manifestSchema = v.record(v.string(), chunkSchema)
const HOME_TITLE = 'SolidJS Boilerplate for web applications'

async function readHomeModule(request: APIRequestContext): Promise<string> {
  const json = await readFile(
    new URL(
      '../../../../.vercel/output/static/.vite/manifest.json',
      import.meta.url
    ),
    'utf8'
  )
  const manifest = v.parse(manifestSchema, JSON.parse(json))
  const entry = Object.entries(manifest).find(([id]) =>
    id.startsWith('src/tests/fixtures/e2e/routes/(base)/index.tsx?')
  )
  if (!entry) throw new Error('Missing home module in build manifest')
  const path = `/${entry[1].file}`
  const response = await request.get('/en')
  expect(await response.text()).toContain(path)
  return path
}

test('espera o módulo da rota depois de a entrada executar', async ({
  page,
  request
}) => {
  const path = await readHomeModule(request)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await watchEntryLoad(page)
  const homeModule = await holdRoute({ page, url: `**${path}` })
  try {
    await page.goto('/en', { waitUntil: 'commit' })
    await homeModule.requested
    await expect(page.locator('html')).toHaveAttribute('data-entry-loaded')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HOME_TITLE)
    expect(await hydrationFinished(page)).toBe(false)

    await homeModule.release()
    await expect.poll(() => hydrationFinished(page)).toBe(true)
    await page.getByRole('button', { name: 'Select theme' }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    expect(errors).toStrictEqual([])
  } finally {
    await homeModule.release()
  }
})

test('mantém o HTML sem marcador quando o preload da raiz falha', async ({
  page,
  request
}) => {
  const path = await readHomeModule(request)
  const failed = page.waitForEvent(
    'requestfailed',
    resource => new URL(resource.url()).pathname === path
  )
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await watchEntryLoad(page)
  await page.route(`**${path}`, route => route.abort('failed'))
  await page.goto('/en')
  await failed
  await expect(page.locator('html')).toHaveAttribute('data-entry-loaded')
  await expect.poll(() => errors.length).toBeGreaterThan(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HOME_TITLE)
  expect(await hydrationFinished(page)).toBe(false)
  await expect(
    page.getByRole('button', { name: 'Select theme' })
  ).toBeDisabled()
  await expect(page.getByRole('menu')).toHaveCount(0)
})
