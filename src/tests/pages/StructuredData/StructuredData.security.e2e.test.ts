import { expect, test } from '@playwright/test'
import * as v from 'valibot'

import { UNSAFE_JSON_LD_TEXT } from '@/tests/fixtures/structured-data.ts'
import { parseStructuredData } from '@/tests/helpers/parseStructuredData/index.ts'
import { watchCspViolations } from '@/tests/helpers/watchCspViolations/index.ts'

const JSON_LD = 'script[type="application/ld+json"]'
const EXPECTED_SCRIPTS = 2
const ANSWER = v.object({ text: v.string() })
const QUESTION = v.object({ acceptedAnswer: ANSWER })
const FAQ = v.object({ mainEntity: v.array(QUESTION) })

for (const javaScriptEnabled of [false, true]) {
  test.describe(`JSON-LD inicial com JavaScript ${javaScriptEnabled ? 'ativado' : 'desativado'}`, () => {
    test.use({ javaScriptEnabled, locale: 'pt-BR' })

    test('preserva HTML malicioso como dados no grafo base e no JSON da página', async ({
      page
    }) => {
      const violations = await watchCspViolations(page)
      await page.goto('/structured-data')
      await expect(
        page.getByRole('heading', { name: 'Perguntas frequentes' })
      ).toBeVisible()
      const scripts = page.locator(`head ${JSON_LD}`)
      await expect(scripts).toHaveCount(EXPECTED_SCRIPTS)
      const texts = await scripts.allTextContents()
      const graph = parseStructuredData(
        texts.find(text => text.includes('"@graph"')) ?? null
      )
      expect(
        graph['@graph'].find(node => node['@type'] === 'WebPage')?.description
      ).toBe(UNSAFE_JSON_LD_TEXT)
      const faq = v.parse(
        FAQ,
        JSON.parse(texts.find(text => text.includes('"FAQPage"')) ?? 'null')
      )
      expect(faq.mainEntity[0]?.acceptedAnswer.text).toBe(UNSAFE_JSON_LD_TEXT)
      await expect(page.locator('[data-json-ld-injected]')).toHaveCount(0)
      await expect(page.locator(`body ${JSON_LD}`)).toHaveCount(0)
      expect(
        await page.evaluate((): unknown =>
          Reflect.get(globalThis, '__jsonLdExecuted')
        )
      ).toBeUndefined()
      if (javaScriptEnabled) {
        await expect(
          page.getByRole('button', { name: 'Selecionar tema' })
        ).toBeEnabled()
      }
      expect(violations).toStrictEqual([])
    })
  })
}
