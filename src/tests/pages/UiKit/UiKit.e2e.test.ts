import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

const LANGUAGES = [
  { locale: 'pt', dialog: 'Fechar diálogo', toast: 'Fechar notificação' },
  { locale: 'en', dialog: 'Close dialog', toast: 'Dismiss notification' },
  { locale: 'es', dialog: 'Cerrar diálogo', toast: 'Cerrar notificación' }
]
const MOBILE_WIDTH = 375

for (const language of LANGUAGES) {
  test(`fields, modal and notifications work in ${language.locale} after SSR`, async ({
    page,
    pageErrors,
    cspViolations
  }) => {
    await page.goto(`/${language.locale}/ui-kit`)
    await expect.poll(() => hydrationFinished(page)).toBe(true)
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ada')
    await expect(page.getByLabel('Subscribe', { exact: true })).toBeChecked()
    await expect(page.getByLabel('Subscribe', { exact: true })).toHaveValue(
      'on'
    )
    await page.getByLabel('Subscribe', { exact: true }).uncheck()
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
      'First line\nSecond line'
    )
    await page.getByLabel('Name', { exact: true }).fill('')
    await page.getByRole('button', { name: 'Submit form' }).click()
    await expect(page.locator('form output')).toHaveText('Pending')
    await page.getByLabel('Name', { exact: true }).fill('Grace')
    await page.getByRole('button', { name: 'Submit form' }).click()
    await expect(page.locator('form output')).toHaveText('Submitted')
    await page.getByLabel('Message', { exact: true }).fill('Edited message')
    await page.getByRole('button', { name: 'Reset form' }).click()
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ada')
    await expect(page.getByLabel('Subscribe', { exact: true })).toBeChecked()
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
      'First line\nSecond line'
    )

    const trigger = page.getByRole('button', { name: 'Open dialog' })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Fixture dialog' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAccessibleDescription('Dialog description')
    await dialog
      .getByRole('button', { name: language.dialog, exact: true })
      .click()
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()

    const show = page.getByRole('button', { name: 'Show notification' })
    await show.click()
    await expect(
      page.getByText('Saving fixture', { exact: true }).first()
    ).toBeVisible()
    await expect(show).toBeFocused()
    await page.getByRole('button', { name: 'Update notification' }).click()
    await expect(
      page.getByText('Fixture saved', { exact: true }).first()
    ).toBeVisible()
    await expect(page.getByText('Saving fixture', { exact: true })).toHaveCount(
      0
    )
    await page
      .getByRole('button', { name: language.toast, exact: true })
      .click()
    await expect(page.getByText('Fixture saved', { exact: true })).toHaveCount(
      0
    )
    await page.getByRole('button', { name: 'Show error' }).click()
    await expect(
      page.getByText('<strong>Plain text</strong>', { exact: true }).first()
    ).toBeVisible()
    await expect(page.locator('strong')).toHaveCount(0)
    expect(pageErrors).toEqual([])
    expect(cspViolations).toEqual([])
  })
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('native field values are present without JavaScript', async ({
    page
  }) => {
    await page.goto('/en/ui-kit')
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ada')
    await expect(page.getByLabel('Subscribe', { exact: true })).toBeChecked()
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
      'First line\nSecond line'
    )
    await expect(page.locator('dialog')).not.toBeVisible()
  })
})

test('initially open dialog hydrates modally with CSP enabled', async ({
  page,
  pageErrors,
  cspViolations
}) => {
  await page.goto('/en/ui-kit?open=1')
  const dialog = page.getByRole('dialog', { name: 'Fixture dialog' })
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  expect(pageErrors).toEqual([])
  expect(cspViolations).toEqual([])
})

test.describe('narrow dark viewport', () => {
  test.use({
    viewport: { width: MOBILE_WIDTH, height: 812 },
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  })

  test('modal and notifications fit a narrow dark viewport', async ({
    page
  }) => {
    await page.goto('/pt/ui-kit')
    await expect.poll(() => hydrationFinished(page)).toBe(true)
    await expect(page.locator('html')).toHaveClass('dark')
    await page.getByRole('button', { name: 'Open dialog' }).click()
    const dialog = page.getByRole('dialog')
    const modalBox = await dialog.boundingBox()
    expect(modalBox).toMatchObject({ x: expect.any(Number) })
    expect(
      modalBox && modalBox.x >= 0 && modalBox.x + modalBox.width <= MOBILE_WIDTH
    ).toBe(true)
    await dialog.getByRole('button', { name: 'Fechar diálogo' }).click()
    await page.getByRole('button', { name: 'Show notification' }).click()
    const notification = page.getByRole('region', { name: 'Notificações' })
    const toast = notification.getByRole('listitem')
    await expect(toast).toBeVisible()
    const toastBox = await toast.boundingBox()
    expect(
      toastBox && toastBox.x >= 0 && toastBox.x + toastBox.width <= MOBILE_WIDTH
    ).toBe(true)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await expect(
      notification.getByRole('button', { name: 'Fechar notificação' })
    ).toBeVisible()
  })
})

test('localized navigation preserves SPA state and reloads when changing language', async ({
  page
}) => {
  await page.goto('/en/ui-kit')
  await expect.poll(() => hydrationFinished(page)).toBe(true)
  await page.evaluate(() => Reflect.set(globalThis, '__navigationProbe', true))
  await page.getByRole('link', { name: 'Localized page' }).click()
  await expect(page).toHaveURL('/en/ui-kit?source=link#target')
  expect(
    await page.evaluate(() => Reflect.has(globalThis, '__navigationProbe'))
  ).toBe(true)
  await page.getByRole('button', { name: 'Navigate page' }).click()
  await expect(page).toHaveURL('/en/ui-kit?source=navigate#target')
  expect(
    await page.evaluate(() => Reflect.has(globalThis, '__navigationProbe'))
  ).toBe(true)
  await page.getByRole('button', { name: 'Replace page' }).click()
  await expect(page).toHaveURL('/en/ui-kit?source=replace')
  await page.goBack()
  await expect(page).toHaveURL('/en/ui-kit?source=link#target')
  await expect(page.getByRole('link', { name: 'Robots file' })).toHaveAttribute(
    'href',
    '/robots.txt'
  )
  await page.getByRole('link', { name: 'Spanish page' }).click()
  await expect(page).toHaveURL('/es/ui-kit?source=language#target')
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-ES')
  expect(
    await page.evaluate(() => Reflect.has(globalThis, '__navigationProbe'))
  ).toBe(false)
  await expect(
    page.getByRole('button', { name: 'Seleccionar idioma' })
  ).toBeVisible()
})
