import type { Page } from '@playwright/test'

import {
  releaseFixtureGate,
  releaseFixtureGateQuietly
} from '@/tests/helpers/fixtureGate/index.ts'
import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

type Stream = { page: Page; id: string; shouldReject?: boolean }

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
  expect(await hydrationFinished(page)).toBe(false)
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
  request,
  pageErrors,
  cspViolations
}) => {
  const id = crypto.randomUUID()
  try {
    await openStream({ page, id })
    await releaseFixtureGate({ request, id: `${id}-second` })
    await expectPanel(page, 'Second')
    await expect(
      page.getByText('Waiting for First', { exact: true })
    ).toBeVisible()
    expect(await hydrationFinished(page)).toBe(false)

    await releaseFixtureGate({ request, id: `${id}-first` })
    await expect.poll(() => hydrationFinished(page)).toBe(true)
    await expectPanel(page, 'First')
    expect(pageErrors).toStrictEqual([])
    expect(cspViolations).toStrictEqual([])
  } finally {
    await releaseFixtureGateQuietly({ request, id: `${id}-first` })
    await releaseFixtureGateQuietly({ request, id: `${id}-second` })
  }
})

test('encerra a fase após um erro contido sem tratá-lo como sucesso', async ({
  page,
  request,
  pageErrors,
  cspViolations
}) => {
  const id = crypto.randomUUID()
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
  try {
    await openStream({ page, id, shouldReject: true })
    await releaseFixtureGate({ request, id: `${id}-first` })
    await expect(
      page.getByText('First stream failed', { exact: true })
    ).toBeVisible()
    await expect(
      page.getByText('Waiting for Second', { exact: true })
    ).toBeVisible()
    expect(await hydrationFinished(page)).toBe(false)

    await releaseFixtureGate({ request, id: `${id}-second` })
    await expect.poll(() => hydrationFinished(page)).toBe(true)
    await expectPanel(page, 'Second')
    await expect(
      page.getByText('First stream failed', { exact: true })
    ).toBeVisible()
    expect(clientLoads).toBe(0)
    expect(cspViolations).toStrictEqual([])
    expect(pageErrors).toStrictEqual([])
  } finally {
    await releaseFixtureGateQuietly({ request, id: `${id}-first` })
    await releaseFixtureGateQuietly({ request, id: `${id}-second` })
  }
})

test('encerra a fase quando a navegação descarta fragmentos pendentes', async ({
  page,
  request,
  pageErrors,
  cspViolations
}) => {
  const id = crypto.randomUUID()
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
    await expect.poll(() => hydrationFinished(page)).toBe(true)
    await page.getByRole('button', { name: 'Select theme' }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    expect(documentRequests).toBe(1)
    expect(pageErrors).toStrictEqual([])
    expect(cspViolations).toStrictEqual([])
  } finally {
    await releaseFixtureGateQuietly({ request, id: `${id}-first` })
    await releaseFixtureGateQuietly({ request, id: `${id}-second` })
  }
})
