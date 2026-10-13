/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Locale } from '@paraglide/runtime.js'

import type { MarkdownSource } from '@/@types/markdown.ts'
import type { SitePage } from '@/@types/site-page.ts'

import { MARKDOWN_LIMITS } from '../../constants.ts'
import type {
  GenerateArtifactsOptions,
  MarkdownRoute,
  MarkdownModule
} from '../../types.ts'
import { generateArtifacts } from '../index.ts'

type FixtureOptions = { routes?: MarkdownRoute[]; source?: MarkdownSource }
const SOURCE = '@/routes/article/markdown.ts'
const PAGE: SitePage = {
  title: 'Public article',
  description: 'Description',
  intro: 'Introduction',
  sections: [],
  links: []
}
const ARTICLE: MarkdownRoute = {
  id: 'article',
  path: '/article',
  markdownSource: SOURCE,
  info: { markdown: true }
}
const DYNAMIC: MarkdownRoute = { ...ARTICLE, path: '/articles/:slug' }

function fixture({
  routes = [ARTICLE],
  source = { render: () => PAGE }
}: FixtureOptions = {}): GenerateArtifactsOptions {
  let activeLocale: Locale = 'en'
  return {
    routes,
    locales: ['en', 'pt'],
    setLocale(locale) {
      activeLocale = locale
    },
    localize: path => `/${activeLocale}${path === '/' ? '' : path}`,
    load: () => Promise.resolve({ markdown: source })
  }
}

describe('Markdown build policy', () => {
  it('publishes explicit pages in every locale independently of llms', async () => {
    const artifacts = await generateArtifacts(
      fixture({
        routes: [
          { ...ARTICLE, info: { markdown: true, llms: false } },
          { id: 'login', path: '/login', info: { llms: true } },
          { id: 'private', path: '/account', info: { seo: { noindex: true } } }
        ]
      })
    )
    assert.deepEqual(
      artifacts.map(artifact => artifact.href),
      ['/en/article.md', '/pt/article.md']
    )
    assert.equal(
      artifacts.every(artifact => !artifact.llms.shouldInclude),
      true
    )
  })

  it('uses an explicit locale and a stable public path in asynchronous sources', async () => {
    const artifacts = await generateArtifacts(
      fixture({
        routes: [DYNAMIC],
        source: {
          getPaths: () => Promise.resolve(['/articles/one', '/articles/two']),
          render: ({ locale, path, signal }) =>
            Promise.resolve({
              ...PAGE,
              title: `${locale} ${path} ${String(signal.aborted)}`
            })
        }
      })
    )
    assert.deepEqual(
      artifacts.map(artifact => artifact.title),
      [
        'en /articles/one false',
        'en /articles/two false',
        'pt /articles/one false',
        'pt /articles/two false'
      ]
    )
  })

  it('does not inherit publication and rejects a producer on a layout', async () => {
    const child = { id: 'child', path: '/child' }
    const inherited = await generateArtifacts(
      fixture({
        routes: [
          { id: 'layout', path: '/', info: { llms: true }, children: [child] }
        ]
      })
    )
    assert.deepEqual(inherited, [])
    await assert.rejects(
      generateArtifacts(
        fixture({ routes: [{ ...ARTICLE, children: [child] }] })
      ),
      /leaf page/u
    )
  })

  it('rejects publication under an effective noindex flag', async () => {
    await assert.rejects(
      generateArtifacts(
        fixture({
          routes: [
            {
              id: 'layout',
              path: '/',
              info: { seo: { noindex: true } },
              children: [ARTICLE]
            }
          ]
        })
      ),
      /conflicts with noindex/u
    )
  })

  it('requires enumeration for parameterized pages', async () => {
    await assert.rejects(
      generateArtifacts(fixture({ routes: [DYNAMIC] })),
      /require getPaths/u
    )
  })

  it('rejects enumerated paths that match a different private or public page', async () => {
    for (const path of ['/articles/admin', '/account']) {
      await assert.rejects(
        generateArtifacts(
          fixture({
            routes: [
              DYNAMIC,
              {
                id: 'admin',
                path: '/articles/admin',
                info: { seo: { noindex: true } }
              }
            ],
            source: { getPaths: () => [path], render: () => PAGE }
          })
        ),
        /another page/u
      )
    }
  })

  it('preserves router parameter filters during ownership checks', async () => {
    await assert.rejects(
      generateArtifacts(
        fixture({
          routes: [{ ...DYNAMIC, matchFilters: { slug: /^public-/u } }],
          source: { getPaths: () => ['/articles/private'], render: () => PAGE }
        })
      ),
      /another page/u
    )
  })

  it('rejects duplicate paths after trailing-slash normalization', async () => {
    await assert.rejects(
      generateArtifacts(
        fixture({
          routes: [DYNAMIC],
          source: {
            getPaths: () => ['/articles/one', '/articles/one/'],
            render: () => PAGE
          }
        })
      ),
      /Duplicate Markdown/u
    )
  })
})

describe('Markdown build limits', () => {
  it('rejects file collisions with existing pages, endpoints and case variants', async () => {
    await assert.rejects(
      generateArtifacts(
        fixture({ routes: [ARTICLE, { id: 'existing', path: '/article.md' }] })
      ),
      /conflicts with a route/u
    )
    const options = fixture()
    options.reservedPaths = ['/en/article.md']
    await assert.rejects(generateArtifacts(options), /conflicts with a route/u)
    options.reservedPaths = ['/:locale/:file']
    await assert.rejects(generateArtifacts(options), /conflicts with a route/u)
    await assert.rejects(
      generateArtifacts(
        fixture({
          routes: [DYNAMIC],
          source: {
            getPaths: () => ['/articles/one', '/articles/ONE'],
            render: () => PAGE
          }
        })
      ),
      /Duplicate Markdown/u
    )
  })

  it('rejects unsafe and non-canonical enumeration', async () => {
    for (const path of [
      'https://evil.test',
      '//evil.test',
      '/articles/../account',
      '/articles/%2e%2e/account',
      '/articles/%2Fprivate',
      '/articles/%5Cprivate',
      '/articles/one?secret=x',
      '/articles/one#fragment',
      '/articles/a b',
      String.raw`/articles/one\two`
    ]) {
      await assert.rejects(
        generateArtifacts(
          fixture({
            routes: [DYNAMIC],
            source: { getPaths: () => [path], render: () => PAGE }
          })
        ),
        /Markdown path/u
      )
    }
  })

  it('bounds the number and size of published artifacts', async () => {
    await assert.rejects(
      generateArtifacts(
        fixture({
          routes: [DYNAMIC],
          source: {
            getPaths: () =>
              Array.from(
                { length: MARKDOWN_LIMITS.files + 1 },
                () => '/articles/one'
              ),
            render: () => PAGE
          }
        })
      ),
      /excessive/u
    )
    await assert.rejects(
      generateArtifacts(
        fixture({
          source: {
            render: () => ({
              ...PAGE,
              intro: 'x'.repeat(MARKDOWN_LIMITS.pageBytes)
            })
          }
        })
      ),
      /size limit/u
    )
  })

  it('fails the build on source errors and invalid text instead of emitting partial content', async () => {
    await assert.rejects(
      generateArtifacts(
        fixture({
          source: {
            render() {
              throw new Error('source failed')
            }
          }
        })
      ),
      /source failed/u
    )
    await assert.rejects(
      generateArtifacts(
        fixture({ source: { render: () => ({ ...PAGE, title: '' }) } })
      ),
      /Invalid length/u
    )
  })

  it('times out a stalled producer import', async context => {
    context.mock.timers.enable({ apis: ['setTimeout'] })
    const options = fixture()
    options.load = () => Promise.withResolvers<MarkdownModule>().promise
    const pending = assert.rejects(generateArtifacts(options), /timed out/u)
    context.mock.timers.tick(MARKDOWN_LIMITS.sourceTimeoutMs)
    await pending
  })
})
