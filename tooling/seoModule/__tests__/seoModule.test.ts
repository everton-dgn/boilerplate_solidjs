import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

import { RuleTester } from 'vite-plus/lint/plugins-dev'

import { lint } from '../../lint.ts'
import plugin from '../../project-plugin.ts'
import { seoModule } from '../index.ts'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const SEO_FILE = 'src/routes/(base)/about/seo.ts'
const SEO = [
  "import { m } from '@paraglide/messages.js'",
  "import type { SeoRouteInfo } from '@/@types/seo.ts'",
  'export const seo = {',
  '  get title() { return m.about_title() }',
  '} satisfies SeoRouteInfo'
].join('\n')

test('o plugin project registra a regra e o lint a ativa como erro', () => {
  assert.equal(plugin.rules['seo-module'], seoModule)
  assert.equal(lint.rules?.['project/seo-module'], 'error')
})

test('a regra deixa o seo.ts só com seo e sem import local como valor', () => {
  new RuleTester({ cwd: ROOT }).run('seo-module', seoModule, {
    valid: [
      { filename: SEO_FILE, code: SEO },
      {
        filename: 'src/routes/(base)/(home)/seo.ts',
        code: `import type { Content } from './types.ts'\n${SEO}`
      },
      {
        filename: 'src/routes/(base)/about/index.tsx',
        code: "import { content } from './content.ts'\nexport const route = {}\nexport const other = content"
      },
      {
        filename: 'src/helpers/seo.ts',
        code: "import { content } from './content.ts'\nexport const content2 = content"
      }
    ],
    invalid: [
      {
        filename: SEO_FILE,
        code: `${SEO}\nexport const content = { title: 'Sobre' }`,
        errors: [{ messageId: 'onlySeo' }]
      },
      {
        filename: SEO_FILE,
        code: "export const content = { title: 'Sobre' }",
        errors: [{ messageId: 'onlySeo' }]
      },
      {
        filename: SEO_FILE,
        code: `${SEO}\nexport function helper() { return 1 }`,
        errors: [{ messageId: 'onlySeo' }]
      },
      {
        filename: SEO_FILE,
        code: `${SEO}\nexport type Content = { title: string }`,
        errors: [{ messageId: 'onlySeo' }]
      },
      {
        filename: SEO_FILE,
        code: `${SEO}\nexport default {}`,
        errors: [{ messageId: 'onlySeo' }]
      },
      {
        filename: SEO_FILE,
        code: `${SEO}\nexport * from './content.ts'`,
        errors: [{ messageId: 'onlySeo' }]
      },
      {
        filename: SEO_FILE,
        code: `${SEO}\nexport { content } from './content.ts'`,
        errors: [{ messageId: 'onlySeo' }]
      },
      {
        filename: SEO_FILE,
        code: `import { content } from './content.ts'\n${SEO}`,
        errors: [{ messageId: 'localImport' }]
      },
      {
        filename: 'src/routes/(base)/about/seo.ts',
        code: `import './content.ts'\n${SEO}`,
        errors: [{ messageId: 'localImport' }]
      },
      {
        filename: 'src/routes/(seo)/sitemap.xml/seo.ts',
        code: `import { content } from '../content.ts'\n${SEO}`,
        errors: [{ messageId: 'localImport' }]
      }
    ]
  })
})
