import type { Page, Route } from '@playwright/test'

import { readBackendState } from '@/tests/helpers/fixtureGate/index.ts'
import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

test.use({ locale: 'pt-BR' })

const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const FIXTURE_TITLE = 'Página desatualizada'
const NOTICE_TITLE = 'O envio não foi concluído'
const ERROR_PAGE_FLAG = 'e2e-error-page'
const DRAFT = 'Texto ainda não salvo'

type Destination = { link: string; url: RegExp; title: string }
type DestinationCheck = { page: Page; destination: Destination }
type AssetBlock = { page: Page; extension: RegExp }
type DocumentCounter = () => number
type Refusal = {
  status: number
  rewrite: (route: Route) => Promise<void>
}

const ABOUT: Destination = {
  link: 'Ir para Sobre',
  url: /\/pt\/about$/u,
  title: 'Sobre o SolidJS Boilerplate'
}
// O CSS de Sobre já vem no documento da fixture; o do UI kit, não.
const UI_KIT: Destination = {
  link: 'Ir para UI kit',
  url: /\/pt\/ui-kit$/u,
  title: 'UI fixture'
}

// A flag sobrevive à troca de documento na mesma aba, então registra também
// uma página de erro que piscou antes da recarga.
async function watchErrorPage(page: Page): Promise<() => Promise<boolean>> {
  await page.addInitScript(flag => {
    new MutationObserver(() => {
      if (document.querySelector('[data-error-variant]')) {
        sessionStorage.setItem(flag, 'true')
      }
    }).observe(document, { childList: true, subtree: true })
  }, ERROR_PAGE_FLAG)
  return () =>
    page.evaluate(
      flag => sessionStorage.getItem(flag) === 'true',
      ERROR_PAGE_FLAG
    )
}

async function openFixture(page: Page, search = ''): Promise<void> {
  await page.goto(`/outdated-page${search}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    FIXTURE_TITLE
  )
  await expect.poll(() => hydrationFinished(page)).toBe(true)
}

function countDocumentRequests(page: Page): DocumentCounter {
  let count = 0
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      count += 1
    }
  })
  return () => count
}

// Simula o deploy que apagou os assets do build da aba: os que a aba ainda não
// pediu respondem 404 até o próximo documento, que já é do build novo.
async function blockNewAssets({ page, extension }: AssetBlock): Promise<void> {
  let isBlocking = true
  await page.route('**/*', route => {
    const request = route.request()
    if (request.isNavigationRequest()) isBlocking = false
    const { pathname } = new URL(request.url())
    if (
      isBlocking &&
      pathname.startsWith('/assets/') &&
      extension.test(pathname)
    ) {
      return route.fulfill({ status: HTTP_NOT_FOUND, body: '' })
    }
    return route.continue()
  })
}

function readNavigationEntry(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () => performance.getEntriesByType('navigation')[0]?.name
  )
}

async function refuseReads(page: Page): Promise<void> {
  await page.route('**/_server/**', route =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: HTTP_NOT_FOUND,
          headers: { 'X-Server-Function-Unknown': 'true' },
          body: ''
        })
      : route.continue()
  )
}

async function expectDestinationDocument({
  page,
  destination
}: DestinationCheck): Promise<void> {
  await expect(page).toHaveURL(destination.url)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    destination.title
  )
  expect(await readNavigationEntry(page)).toBe(page.url())
}

const REFUSALS: Refusal[] = [
  {
    status: HTTP_CONFLICT,
    // O carimbo de outro build é o que uma aba antiga envia depois do deploy.
    rewrite: async route =>
      route.continue({
        headers: {
          ...(await route.request().allHeaders()),
          'x-server-function-build': 'build-anterior'
        }
      })
  },
  {
    status: HTTP_NOT_FOUND,
    rewrite: route => {
      const url = new URL(route.request().url())
      url.pathname = url.pathname.replace(/[^/]+$/u, 'funcao-removida')
      return route.continue({ url: url.href })
    }
  }
]

test('passar sobre um link sem o chunk não recarrega e o clique seguinte abre o destino', async ({
  page
}) => {
  const wasErrorPageShown = await watchErrorPage(page)
  await openFixture(page)
  const documents = countDocumentRequests(page)
  await blockNewAssets({ page, extension: /\.js$/u })
  await page.getByLabel('Rascunho').fill(DRAFT)

  const missingChunk = page.waitForResponse(
    response =>
      new URL(response.url()).pathname.startsWith('/assets/') &&
      response.status() === HTTP_NOT_FOUND
  )
  await page.getByRole('link', { name: ABOUT.link }).hover()
  await missingChunk
  await expect(page.getByLabel('Rascunho')).toHaveValue(DRAFT)
  expect(documents()).toBe(0)

  await page.getByRole('link', { name: ABOUT.link }).click()
  await expectDestinationDocument({ page, destination: ABOUT })
  expect(documents()).toBe(1)
  expect(await wasErrorPageShown()).toBe(false)
})

for (const { name, extension, destination } of [
  { name: 'JS', extension: /\.js$/u, destination: ABOUT },
  { name: 'CSS', extension: /\.css$/u, destination: UI_KIT }
]) {
  // O evento sintético não move o ponteiro nem dá foco: a navegação começa
  // sem preload, como num toque mais rápido que a resposta 404.
  test(`um clique sem preload e sem o ${name} do destino abre o destino por documento`, async ({
    page
  }) => {
    const wasErrorPageShown = await watchErrorPage(page)
    await openFixture(page)
    const documents = countDocumentRequests(page)
    await blockNewAssets({ page, extension })
    await page
      .getByRole('link', { name: destination.link })
      .dispatchEvent('click')
    await expectDestinationDocument({ page, destination })
    expect(documents()).toBe(1)
    expect(await wasErrorPageShown()).toBe(false)
  })
}

for (const { status, rewrite } of REFUSALS) {
  test(`o envio recusado com ${status} mostra o aviso sem executar a função`, async ({
    page,
    request
  }) => {
    const id = `success:${crypto.randomUUID()}`
    await openFixture(page, `?id=${encodeURIComponent(id)}`)
    const documents = countDocumentRequests(page)
    await page.route('**/_server/**', route =>
      route.request().method() === 'GET' ? route.continue() : rewrite(route)
    )
    const refusal = page.waitForResponse(
      response =>
        new URL(response.url()).pathname.startsWith('/_server/') &&
        response.status() === status
    )
    await page.getByRole('button', { name: 'Enviar nota' }).click()
    await refusal
    await expect(page.getByText('Função desconhecida')).toBeVisible()
    await expect(
      page.getByRole('region', { name: NOTICE_TITLE })
    ).toContainText('A página pode estar desatualizada.')
    const backend = await readBackendState({ request, id })
    expect(backend.attempts).toBe(0)

    // A recusa marca a aba: a próxima troca de página já sai por documento.
    await page.getByRole('link', { name: ABOUT.link }).click()
    await expectDestinationDocument({ page, destination: ABOUT })
    expect(documents()).toBe(1)
  })
}

test('a leitura recusada dentro do limite local não mostra o aviso nem recarrega', async ({
  page
}) => {
  await openFixture(
    page,
    `?id=${encodeURIComponent(`success:${crypto.randomUUID()}`)}`
  )
  const documents = countDocumentRequests(page)
  await refuseReads(page)
  await page.getByRole('button', { name: 'Ler nota', exact: true }).click()
  await expect(page.getByText('Leitura recusada')).toBeVisible()
  await expect(page.getByRole('region', { name: NOTICE_TITLE })).toHaveCount(0)
  expect(documents()).toBe(0)
})

test('a leitura recusada sem limite local recarrega uma vez e mostra a página de erro se voltar', async ({
  page
}) => {
  const wasErrorPageShown = await watchErrorPage(page)
  await openFixture(
    page,
    `?id=${encodeURIComponent(`success:${crypto.randomUUID()}`)}`
  )
  const documents = countDocumentRequests(page)
  await refuseReads(page)

  await page.getByRole('button', { name: 'Ler nota sem limite local' }).click()
  await expect.poll(documents).toBe(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    FIXTURE_TITLE
  )
  await expect.poll(() => hydrationFinished(page)).toBe(true)
  expect(await wasErrorPageShown()).toBe(false)

  // A recusa repetida dentro da janela da trava indica um build novo também
  // quebrado: a página de erro aparece em vez de outra recarga.
  await page.getByRole('button', { name: 'Ler nota sem limite local' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Algo deu errado!'
  )
  expect(documents()).toBe(1)
})
