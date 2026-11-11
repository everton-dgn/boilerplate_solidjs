import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

test.use({ javaScriptEnabled: false })

test('server HTML keeps controlled field values over defaults', async ({
  page
}) => {
  await page.goto('/en/ui-kit/fields')
  const field = (name: string) => page.getByLabel(name, { exact: true })

  await expect(field('Value')).toHaveValue('controlled')
  await expect(field('Default value')).toHaveValue('default')
  await expect(field('Value over default')).toHaveValue('controlled')
  await expect(field('Checked')).toBeChecked()
  await expect(field('Default checked')).toBeChecked()
  await expect(field('Unchecked over default')).not.toBeChecked()
  await expect(field('Text value')).toHaveValue('controlled')
  await expect(field('Text default')).toHaveValue('default')
  await expect(field('Text value over default')).toHaveValue('controlled')
})
