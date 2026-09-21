import { expect, test, type TestInfo } from '@playwright/test'

const HTTP_OK = 200
const PAGE_URL = '/structured-data-stream'
const PRODUCT_NAME = 'Produto em streaming'
const JSON_LD = 'script[type="application/ld+json"]'
const SCRIPTS_WITH_PRODUCT = 2

type HtmlEvidence = {
  testInfo: TestInfo
  name: string
  html: string
}

async function saveHtml({ testInfo, name, html }: HtmlEvidence): Promise<void> {
  await testInfo.attach(name, { body: html, contentType: 'text/html' })
}

test('envia o JSON-LD assíncrono como atualização de head após o HTML inicial', async ({
  request
}, testInfo) => {
  const response = await request.get(PAGE_URL)
  expect(response.status()).toBe(HTTP_OK)
  const html = await response.text()
  await saveHtml({ testInfo, name: 'stream-response.html', html })

  const headEnd = html.indexOf('</head>')
  expect(headEnd).toBeGreaterThan(0)
  const head = html.slice(0, headEnd)
  const tail = html.slice(headEnd)

  expect(head).toContain('application/ld+json')
  expect(head).not.toContain(PRODUCT_NAME)
  expect(tail).toContain('Carregando produto...')
  expect(tail).toContain('"a","script:key:structured-data:')
  expect(tail).toContain('"script",{"type":"application/ld+json"}')
  expect(tail).toContain(String.raw`\"@type\":\"Product\"`)
  expect(tail).toContain(PRODUCT_NAME)
  expect(
    html.match(/<script\b[^>]*type="application\/ld\+json"/gu)
  ).toHaveLength(1)
})

test.describe('streaming sem JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('mantém apenas o JSON-LD inicial no head', async ({
    page
  }, testInfo) => {
    await page.goto(PAGE_URL)
    await expect(
      page.getByText('Carregando produto...', { exact: true })
    ).toBeVisible()
    await expect(page.locator(`head ${JSON_LD}`)).toHaveCount(1)
    const scripts = await page.locator(`head ${JSON_LD}`).allTextContents()
    expect(scripts.join('')).not.toContain(PRODUCT_NAME)
    await expect(page.locator(`body ${JSON_LD}`)).toHaveCount(0)
    await saveHtml({
      testInfo,
      name: 'dom-without-javascript.html',
      html: await page.content()
    })
  })
})

test('insere o JSON-LD tardio no head antes de carregar o JavaScript da aplicação', async ({
  page
}, testInfo) => {
  await page.route(/\/assets\/.*\.js(?:\?.*)?$/u, route => route.abort())
  await page.goto(PAGE_URL)
  await expect(page.getByRole('heading', { name: PRODUCT_NAME })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Selecionar tema' })
  ).toBeDisabled()
  await expect(page.locator(`head ${JSON_LD}`)).toHaveCount(
    SCRIPTS_WITH_PRODUCT
  )
  const scripts = await page.locator(`head ${JSON_LD}`).allTextContents()
  expect(scripts.filter(text => text.includes(PRODUCT_NAME))).toHaveLength(1)
  await expect(page.locator(`body ${JSON_LD}`)).toHaveCount(0)
  await saveHtml({
    testInfo,
    name: 'dom-before-hydration.html',
    html: await page.content()
  })
})

test('hidrata sem duplicar o JSON-LD e o remove ao sair da rota', async ({
  page
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(PAGE_URL)
  await page.getByRole('button', { name: 'Incrementar', exact: true }).click()
  await expect(page.getByText('Cliques: 1', { exact: true })).toBeVisible()
  await expect(page.locator(`head ${JSON_LD}`)).toHaveCount(
    SCRIPTS_WITH_PRODUCT
  )
  const scripts = await page.locator(`head ${JSON_LD}`).allTextContents()
  expect(scripts.filter(text => text.includes(PRODUCT_NAME))).toHaveLength(1)
  await expect(page.locator(`body ${JSON_LD}`)).toHaveCount(0)
  await saveHtml({
    testInfo,
    name: 'dom-after-hydration.html',
    html: await page.content()
  })

  await page.getByRole('link', { name: 'Início', exact: true }).click()
  await expect(page).toHaveTitle('SolidJS Boilerplate')
  await expect(page.locator(`head ${JSON_LD}`)).toHaveCount(1)
  const remaining = await page.locator(JSON_LD).allTextContents()
  expect(remaining.join('')).not.toContain(PRODUCT_NAME)
  expect(errors).toStrictEqual([])
})
