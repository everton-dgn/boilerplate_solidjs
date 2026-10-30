import { holdRoute } from '@/tests/helpers/holdRoute/index.ts'
import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'

const HTTP_OK = 200
const HTTP_BAD_REQUEST = 400
const PARAMETERS = [
  { encoded: 'caf%C3%A9', decoded: 'café' },
  { encoded: '100%25', decoded: '100%' },
  { encoded: 'one%2Ftwo', decoded: 'one/two' }
]

for (const { encoded, decoded } of PARAMETERS) {
  test(`preserves the encoded URL and decoded parameter ${encoded} through SSR and hydration`, async ({
    page,
    pageErrors
  }) => {
    const scripts = await holdRoute({ page, url: '**/*.js' })

    try {
      const path = `/en/blog/${encoded}`
      const response = await page.goto(path, { waitUntil: 'commit' })
      expect(response?.status()).toBe(HTTP_OK)
      await scripts.requested
      expect(await hydrationFinished(page)).toBe(false)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        `Post ${decoded}`
      )
      await expect(page).toHaveURL(path)

      await scripts.release()
      await expect.poll(() => hydrationFinished(page)).toBe(true)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        `Post ${decoded}`
      )
      await expect(page).toHaveURL(path)
      expect(pageErrors).toEqual([])
    } finally {
      await scripts.release()
    }
  })
}

test('rejects a URL with malformed parameter encoding', async ({ request }) => {
  const response = await request.get('/en/blog/%E0%A4%A')
  expect(response.status()).toBe(HTTP_BAD_REQUEST)
})
