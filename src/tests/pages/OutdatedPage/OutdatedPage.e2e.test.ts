import type { Page, Route } from '@playwright/test'

import { readBackendState } from '@/tests/helpers/fixtureGate/index.ts'
import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

test.use({ locale: 'pt-BR' })

const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const FIXTURE_TITLE = 'Outdated page'
const NOTICE_TITLE = 'O envio não foi concluído'
const FALLBACK_NOTICE_TITLE = 'Parte da página não carregou'
const ERROR_PAGE_FLAG = 'e2e-error-page'
const DRAFT = 'Text not saved yet'

type Destination = { link: string; url: RegExp; title: string }
// The guard switches documents with assign; the root Errored, with reload.
type NavigationType = 'navigate' | 'reload'
type NavigationEntry = { name: string; type: string }
type DestinationCheck = {
  page: Page
  destination: Destination
  navigation: NavigationType
}
type AssetBlock = { page: Page; extension: RegExp }
type DocumentCounter = () => number
type Refusal = {
  status: number
  rewrite: (route: Route) => Promise<void>
}

const ABOUT: Destination = {
  link: 'Go to About',
  url: /\/pt\/about$/u,
  title: 'Sobre o SolidJS Boilerplate'
}
// The About CSS already comes in the fixture document; the UI kit one does not.
const UI_KIT: Destination = {
  link: 'Go to UI kit',
  url: /\/pt\/ui-kit$/u,
  title: 'UI fixture'
}

// The flag survives the document switch in the same tab, so it also records an
// error page that flashed before the reload.
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

// Simulates the deploy that deleted the build assets of the tab: the ones the tab
// has not requested yet answer 404 until the next document, which is already
// from the new build.
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

function readNavigationEntry(page: Page): Promise<NavigationEntry | undefined> {
  return page.evaluate(() => {
    const [entry] = performance.getEntriesByType('navigation')
    return entry instanceof PerformanceNavigationTiming
      ? { name: entry.name, type: entry.type }
      : undefined
  })
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
  destination,
  navigation
}: DestinationCheck): Promise<void> {
  await expect(page).toHaveURL(destination.url)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    destination.title
  )
  expect(await readNavigationEntry(page)).toEqual({
    name: page.url(),
    type: navigation
  })
}

const REFUSALS: Refusal[] = [
  {
    status: HTTP_CONFLICT,
    // The stamp of another build is what an old tab sends after the deploy.
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
      url.pathname = url.pathname.replace(/[^/]+$/u, 'removed-function')
      return route.continue({ url: url.href })
    }
  }
]

test('hovering a link without the chunk does not reload, respects the draft and then opens the target', async ({
  page
}) => {
  const wasErrorPageShown = await watchErrorPage(page)
  await openFixture(page)
  const documents = countDocumentRequests(page)
  await blockNewAssets({ page, extension: /\.js$/u })
  await page.getByLabel('Draft').fill(DRAFT)

  const missingChunk = page.waitForResponse(
    response =>
      new URL(response.url()).pathname.startsWith('/assets/') &&
      response.status() === HTTP_NOT_FOUND
  )
  await page.getByRole('link', { name: ABOUT.link }).hover()
  await missingChunk
  await expect(page.getByLabel('Draft')).toHaveValue(DRAFT)
  expect(documents()).toBe(0)

  // With the draft registered, the version guard yields to the guard of the page.
  await page.getByRole('link', { name: ABOUT.link }).click()
  await expect(page.getByText('Leave blocked')).toBeVisible()
  await expect(page.getByLabel('Draft')).toHaveValue(DRAFT)
  expect(page.url()).toMatch(/\/pt\/outdated-page$/u)
  expect(documents()).toBe(0)

  await page.getByLabel('Draft').fill('')
  await page.getByRole('link', { name: ABOUT.link }).click()
  await expectDestinationDocument({
    page,
    destination: ABOUT,
    navigation: 'navigate'
  })
  expect(documents()).toBe(1)
  expect(await wasErrorPageShown()).toBe(false)
})

for (const { name, extension, destination } of [
  { name: 'JS', extension: /\.js$/u, destination: ABOUT },
  { name: 'CSS', extension: /\.css$/u, destination: UI_KIT }
]) {
  // The synthetic event neither moves the pointer nor gives focus: the navigation
  // starts without a preload, like a tap faster than the 404 response.
  test(`a click without a preload and without the ${name} of the target opens the target through a document`, async ({
    page
  }) => {
    const wasErrorPageShown = await watchErrorPage(page)
    await openFixture(page)
    const documents = countDocumentRequests(page)
    await blockNewAssets({ page, extension })
    await page
      .getByRole('link', { name: destination.link })
      .dispatchEvent('click')
    await expectDestinationDocument({
      page,
      destination,
      navigation: 'reload'
    })
    expect(documents()).toBe(1)
    expect(await wasErrorPageShown()).toBe(false)
  })
}

for (const { status, rewrite } of REFUSALS) {
  test(`the submission refused with ${status} shows the notice without running the function`, async ({
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
    await page.getByRole('button', { name: 'Send note' }).click()
    await refusal
    await expect(page.getByText('Unknown function')).toBeVisible()
    await expect(
      page.getByRole('region', { name: NOTICE_TITLE })
    ).toContainText('A página pode estar desatualizada.')
    const backend = await readBackendState({ request, id })
    expect(backend.attempts).toBe(0)

    // The refusal marks the tab: the next page change already goes through a document.
    await page.getByRole('link', { name: ABOUT.link }).click()
    await expectDestinationDocument({
      page,
      destination: ABOUT,
      navigation: 'navigate'
    })
    expect(documents()).toBe(1)
  })
}

test('the read refused inside the local boundary warns without reloading and keeps the draft', async ({
  page
}) => {
  await openFixture(
    page,
    `?id=${encodeURIComponent(`success:${crypto.randomUUID()}`)}`
  )
  const documents = countDocumentRequests(page)
  await page.getByLabel('Draft').fill(DRAFT)
  await refuseReads(page)
  await page.getByRole('button', { name: 'Read note', exact: true }).click()
  await expect(page.getByText('Read refused')).toBeVisible()
  const notice = page.getByRole('region', { name: FALLBACK_NOTICE_TITLE })
  await expect(notice).toContainText('Recarregue para continuar.')
  await expect(page.getByRole('region', { name: NOTICE_TITLE })).toHaveCount(0)
  await expect(page.getByLabel('Draft')).toHaveValue(DRAFT)
  expect(documents()).toBe(0)

  await notice.getByRole('button', { name: 'Recarregar página' }).click()
  await expect.poll(documents).toBe(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    FIXTURE_TITLE
  )
  const reloaded = await readNavigationEntry(page)
  expect(reloaded?.type).toBe('reload')
})

test('the read refused without a local boundary reloads once and shows the error page if it comes back', async ({
  page
}) => {
  const wasErrorPageShown = await watchErrorPage(page)
  await openFixture(
    page,
    `?id=${encodeURIComponent(`success:${crypto.randomUUID()}`)}`
  )
  const documents = countDocumentRequests(page)
  await refuseReads(page)

  await page
    .getByRole('button', { name: 'Read note without a local boundary' })
    .click()
  await expect.poll(documents).toBe(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    FIXTURE_TITLE
  )
  await expect.poll(() => hydrationFinished(page)).toBe(true)
  const reloaded = await readNavigationEntry(page)
  expect(reloaded?.type).toBe('reload')
  expect(await wasErrorPageShown()).toBe(false)

  // A repeated refusal within the lock window points to a new build that is also
  // broken: the error page shows up instead of another reload.
  await page
    .getByRole('button', { name: 'Read note without a local boundary' })
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Algo deu errado!'
  )
  expect(documents()).toBe(1)
  // The root Errored unmounts the notice: the error page shows up alone.
  await expect(
    page.getByRole('region', { name: FALLBACK_NOTICE_TITLE })
  ).toHaveCount(0)
})
