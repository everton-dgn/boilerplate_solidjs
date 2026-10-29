import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from '@playwright/test'

import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { watchCspViolations } from '@/tests/helpers/watchCspViolations/index.ts'

type Gate = {
  request: APIRequestContext
  id: string
  panel: 'first' | 'second'
}
type Stream = { page: Page; id: string; shouldReject?: boolean }

const BACKEND = 'http://127.0.0.1:4318'

async function release({ request, id, panel }: Gate): Promise<void> {
  const response = await request.post(`${BACKEND}/release?id=${id}-${panel}`)
  expect(response.ok()).toBeTruthy()
}

async function openStream({
  page,
  id,
  shouldReject = false
}: Stream): Promise<void> {
  await page.goto(
    `/en/hydration?id=${id}&mode=${shouldReject ? 'reject' : 'resolve'}`,
    {
      waitUntil: 'commit'
    }
  )
  await expect(
    page.getByText('Waiting for First', { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText('Waiting for Second', { exact: true })
  ).toBeVisible()
  // O shell responde ao teclado enquanto os dois fragmentos estão retidos.
  await page
    .getByRole('button', { name: 'Shell count: 0', exact: true })
    .press('Enter')
  await expect(
    page.getByRole('button', { name: 'Shell count: 1', exact: true })
  ).toBeVisible()
  expect(await hydrationFinished(page)).toBeFalsy()
}

async function expectPanel(page: Page, panel: string): Promise<void> {
  await expect(
    page.getByRole('heading', { name: panel, exact: true })
  ).toBeVisible()
  await page
    .getByRole('button', { name: `${panel} count: 0`, exact: true })
    .press('Enter')
  await expect(
    page.getByRole('button', { name: `${panel} count: 1`, exact: true })
  ).toBeVisible()
}

test('espera todos os fragmentos, mesmo resolvidos fora de ordem', async ({
  page,
  request
}) => {
  const id = crypto.randomUUID()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const violations = await watchCspViolations(page)
  try {
    await openStream({ page, id })
    await release({ request, id, panel: 'second' })
    await expectPanel(page, 'Second')
    await expect(
      page.getByText('Waiting for First', { exact: true })
    ).toBeVisible()
    expect(await hydrationFinished(page)).toBeFalsy()

    await release({ request, id, panel: 'first' })
    await expect.poll(() => hydrationFinished(page)).toBeTruthy()
    await expectPanel(page, 'First')
    expect(errors).toStrictEqual([])
    expect(violations).toStrictEqual([])
  } finally {
    await release({ request, id, panel: 'first' })
    await release({ request, id, panel: 'second' })
  }
})

test('encerra a fase após um erro contido sem tratá-lo como sucesso', async ({
  page,
  request
}) => {
  const id = crypto.randomUUID()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  // A rejeição enviada pelo servidor é adotada na hidratação, sem nova busca.
  let clientLoads = 0
  page.on('request', resource => {
    if (
      resource.method() === 'POST' &&
      new URL(resource.url()).pathname.startsWith('/_server/')
    ) {
      clientLoads += 1
    }
  })
  const violations = await watchCspViolations(page)
  try {
    await openStream({ page, id, shouldReject: true })
    await release({ request, id, panel: 'first' })
    await expect(
      page.getByText('First stream failed', { exact: true })
    ).toBeVisible()
    await expect(
      page.getByText('Waiting for Second', { exact: true })
    ).toBeVisible()
    expect(await hydrationFinished(page)).toBeFalsy()

    await release({ request, id, panel: 'second' })
    await expect.poll(() => hydrationFinished(page)).toBeTruthy()
    await expectPanel(page, 'Second')
    await expect(
      page.getByText('First stream failed', { exact: true })
    ).toBeVisible()
    expect(clientLoads).toBe(0)
    expect(violations).toStrictEqual([])
    expect(errors).toStrictEqual([])
  } finally {
    await release({ request, id, panel: 'first' })
    await release({ request, id, panel: 'second' })
  }
})

test('encerra a fase quando a navegação descarta fragmentos pendentes', async ({
  page,
  request
}) => {
  const id = crypto.randomUUID()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const violations = await watchCspViolations(page)
  let documentRequests = 0
  page.on('request', resource => {
    if (resource.resourceType() === 'document') documentRequests += 1
  })
  try {
    await openStream({ page, id })
    await page
      .getByRole('navigation', { name: 'Main', exact: true })
      .getByRole('link', { name: 'About', exact: true })
      .click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'About SolidJS Boilerplate'
    )
    await expect.poll(() => hydrationFinished(page)).toBeTruthy()
    await page.getByRole('button', { name: 'Select theme' }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    expect(documentRequests).toBe(1)
    expect(errors).toStrictEqual([])
    expect(violations).toStrictEqual([])
  } finally {
    await release({ request, id, panel: 'first' })
    await release({ request, id, panel: 'second' })
  }
})
