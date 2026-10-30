import {
  expect,
  type APIRequestContext,
  type Page,
  test
} from '@playwright/test'
import * as v from 'valibot'

import { UNSAFE_JSON_LD_TEXT } from '@/tests/fixtures/structured-data.ts'
import {
  readGatedBody,
  releaseFixtureGate
} from '@/tests/helpers/fixtureGate/index.ts'
import { watchCspViolations } from '@/tests/helpers/watchCspViolations/index.ts'

test.use({ locale: 'pt-BR' })

const HTTP_OK = 200
const PAGE_URL = '/structured-data-stream'
const PRODUCT_NAME = 'Produto em streaming'
const LOADING_TEXT = 'Carregando produto...'
const JSON_LD = 'script[type="application/ld+json"]'
const SCRIPTS_WITH_PRODUCT = 2

type GatedVisit = { page: Page; request: APIRequestContext }

function productId(): string {
  return `structured-data:${crypto.randomUUID()}`
}

// Navega com um gate novo e só o libera quando o fallback do shell aparece.
async function visitGated({ page, request }: GatedVisit): Promise<void> {
  const id = productId()
  await page.goto(`${PAGE_URL}?id=${id}`, { waitUntil: 'commit' })
  await expect(page.getByText(LOADING_TEXT, { exact: true })).toBeVisible()
  await releaseFixtureGate({ request, id })
}

async function expectSafeProduct(page: Page): Promise<void> {
  const scripts = await page.locator(`head ${JSON_LD}`).allTextContents()
  const json = scripts.find(text => text.includes('"@type":"Product"'))
  const product = v.parse(
    v.object({ description: v.string() }),
    JSON.parse(json ?? 'null')
  )
  expect(product.description).toBe(UNSAFE_JSON_LD_TEXT)
  await expect(page.locator('[data-json-ld-injected]')).toHaveCount(0)
  expect(
    await page.evaluate((): unknown =>
      Reflect.get(globalThis, '__jsonLdExecuted')
    )
  ).toBeUndefined()
}

test('envia o JSON-LD assíncrono como atualização de head após o HTML inicial', async ({
  request,
  baseURL
}) => {
  if (!baseURL) throw new Error('baseURL is required')
  const id = productId()
  const response = await fetch(`${baseURL}${PAGE_URL}?id=${id}`, {
    headers: { accept: 'text/html' }
  })
  const html = await readGatedBody({
    request,
    id,
    response,
    shellText: LOADING_TEXT
  })
  expect(response.status).toBe(HTTP_OK)

  const headEnd = html.indexOf('</head>')
  expect(headEnd).toBeGreaterThan(0)
  const head = html.slice(0, headEnd)
  const tail = html.slice(headEnd)

  expect(head).toContain('application/ld+json')
  expect(head).not.toContain(PRODUCT_NAME)
  expect(tail).toContain(LOADING_TEXT)
  expect(tail).toContain('"a","script:key:structured-data:')
  // O runtime repassa o nonce CSP da requisição à tag criada no head.
  expect(tail).toMatch(
    /"script",\{"type":"application\/ld\+json","nonce":"[^"]+"\}/u
  )
  expect(tail).toContain(String.raw`\"@type\":\"Product\"`)
  expect(tail).toContain(PRODUCT_NAME)
  expect(
    html.match(/<script\b[^>]*type="application\/ld\+json"/gu)
  ).toHaveLength(1)
})

test.describe('streaming sem JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('mantém apenas o JSON-LD inicial no head', async ({ page, request }) => {
    await visitGated({ page, request })
    await page.waitForLoadState('load')
    await expect(page.getByText(LOADING_TEXT, { exact: true })).toBeVisible()
    await expect(page.locator(`head ${JSON_LD}`)).toHaveCount(1)
    const scripts = await page.locator(`head ${JSON_LD}`).allTextContents()
    expect(scripts.join('')).not.toContain(PRODUCT_NAME)
    await expect(page.locator(`body ${JSON_LD}`)).toHaveCount(0)
  })
})

test('insere o JSON-LD tardio no head antes de carregar o JavaScript da aplicação', async ({
  page,
  request
}) => {
  const violations = await watchCspViolations(page)
  await page.route(/\/assets\/.*\.js(?:\?.*)?$/u, route => route.abort())
  await visitGated({ page, request })
  await expect(page.getByRole('heading', { name: PRODUCT_NAME })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Selecionar tema' })
  ).toBeDisabled()
  await expect(page.locator(`head ${JSON_LD}`)).toHaveCount(
    SCRIPTS_WITH_PRODUCT
  )
  const scripts = await page.locator(`head ${JSON_LD}`).allTextContents()
  expect(scripts.filter(text => text.includes(PRODUCT_NAME))).toHaveLength(1)
  await expectSafeProduct(page)
  expect(violations).toStrictEqual([])
  await expect(page.locator(`body ${JSON_LD}`)).toHaveCount(0)
})

test('hidrata sem duplicar o JSON-LD e o remove ao sair da rota', async ({
  page,
  request
}) => {
  const errors: string[] = []
  const violations = await watchCspViolations(page)
  page.on('pageerror', error => errors.push(error.message))
  await visitGated({ page, request })
  await page.getByRole('button', { name: 'Incrementar', exact: true }).click()
  await expect(page.getByText('Cliques: 1', { exact: true })).toBeVisible()
  await expect(page.locator(`head ${JSON_LD}`)).toHaveCount(
    SCRIPTS_WITH_PRODUCT
  )
  const scripts = await page.locator(`head ${JSON_LD}`).allTextContents()
  expect(scripts.filter(text => text.includes(PRODUCT_NAME))).toHaveLength(1)
  await expectSafeProduct(page)
  await expect(page.locator(`body ${JSON_LD}`)).toHaveCount(0)

  await page.getByRole('link', { name: 'Início', exact: true }).click()
  await expect(page).toHaveTitle('SolidJS Boilerplate | Aplicações web com SSR')
  await expect(page.locator(`head ${JSON_LD}`)).toHaveCount(1)
  const remaining = await page.locator(JSON_LD).allTextContents()
  expect(remaining.join('')).not.toContain(PRODUCT_NAME)
  expect(errors).toStrictEqual([])
  expect(violations).toStrictEqual([])
})
