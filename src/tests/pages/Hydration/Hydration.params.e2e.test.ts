import { expect, test } from '@playwright/test'

import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'

const HTTP_OK = 200
const HTTP_BAD_REQUEST = 400
const PARAMETERS = [
  { encoded: 'caf%C3%A9', decoded: 'café' },
  { encoded: '100%25', decoded: '100%' },
  { encoded: 'one%2Ftwo', decoded: 'one/two' }
]

// oxlint-disable-next-line vitest/prefer-each -- O Playwright não oferece test.each.
for (const { encoded, decoded } of PARAMETERS) {
  test(`preserves the encoded URL and decoded parameter ${encoded} through SSR and hydration`, async ({
    page
  }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const requested = Promise.withResolvers<null>()
    const released = Promise.withResolvers<null>()
    await page.route('**/*.js', async route => {
      requested.resolve(null)
      await released.promise
      await route.continue()
    })

    try {
      const path = `/en/blog/${encoded}`
      const response = await page.goto(path, { waitUntil: 'commit' })
      expect(response?.status()).toBe(HTTP_OK)
      await requested.promise
      expect(await hydrationFinished(page)).toBe(false)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        `Post ${decoded}`
      )
      await expect(page).toHaveURL(path)

      released.resolve(null)
      await expect.poll(() => hydrationFinished(page)).toBe(true)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        `Post ${decoded}`
      )
      await expect(page).toHaveURL(path)
      expect(errors).toEqual([])
    } finally {
      released.resolve(null)
      await page.unrouteAll({ behavior: 'wait' })
    }
  })
}

test('rejects a URL with malformed parameter encoding', async ({ request }) => {
  const response = await request.get('/en/blog/%E0%A4%A')
  expect(response.status()).toBe(HTTP_BAD_REQUEST)
})
