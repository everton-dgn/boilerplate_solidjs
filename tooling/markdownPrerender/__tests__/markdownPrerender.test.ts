import assert from 'node:assert/strict'
import { env } from 'node:process'
import { it } from 'node:test'

import type { PrerenderRoute } from 'nitro/types'

import {
  PUBLICATION_PHASE_ENV,
  PUBLICATION_PRERENDER_PHASE
} from '../../../src/constants/publication.ts'
import { MARKDOWN_PRERENDER_PATH } from '../../../src/middleware/markdownContent/constants.ts'
import { SITEMAP_INVENTORY_PATH } from '../../publicationArtifacts/constants.ts'
import { LLMS_MAX_BYTES } from '../constants.ts'
import { markdownPrerender } from '../index.ts'
import { BUILD_ID } from './constants.ts'
import { setup, manifest, written, markdownRoute } from './fixtures.ts'
import type { Prerender } from './types.ts'

it('registers the static list and fails the build on a prerender error', async () => {
  const { prerender } = await setup()
  assert.deepEqual(prerender, {
    routes: [
      '/existing',
      MARKDOWN_PRERENDER_PATH,
      SITEMAP_INVENTORY_PATH,
      '/llms.txt'
    ],
    failOnError: true
  })
})

it('queues the listed files and publishes the list', async () => {
  const { handlers } = await setup()
  const routes = new Set<string>()
  handlers['prerender:routes']?.(routes)
  const route: PrerenderRoute = {
    route: MARKDOWN_PRERENDER_PATH,
    contents: manifest({ paths: ['/en/about.md', '/pt/index.md'] })
  }
  handlers['prerender:generate']?.(route)
  assert.deepEqual([...routes], ['/en/about.md', '/pt/index.md'])
  assert.equal(route.skip, undefined)
  assert.equal(route.error, undefined)
})

it('marks an error when the list does not carry only .md files', async () => {
  for (const contents of [
    'not json',
    '["/en/about.md"]',
    '{}',
    manifest({ paths: ['/en/about'] }),
    manifest({ paths: ['/pt/caf%C3%A9.md', '/pt/café.md'] }),
    JSON.stringify({
      siteUrl: 'not a url',
      baseLocale: 'en',
      paths: [],
      mismatches: []
    })
  ]) {
    const { handlers } = await setup()
    const routes = new Set<string>()
    handlers['prerender:routes']?.(routes)
    const route: PrerenderRoute = { route: MARKDOWN_PRERENDER_PATH, contents }
    handlers['prerender:generate']?.(route)
    assert.equal(routes.size, 0)
    assert.ok(route.error)
  }
})

it('refuses the list when a page with static opt-in resolves to another route', async () => {
  const { handlers } = await setup()
  const routes = new Set<string>()
  handlers['prerender:routes']?.(routes)
  const route: PrerenderRoute = {
    route: MARKDOWN_PRERENDER_PATH,
    contents: manifest({ paths: ['/en/about.md'], mismatches: ['/en/docs'] })
  }
  handlers['prerender:generate']?.(route)
  assert.equal(routes.size, 0)
  assert.equal(
    route.error?.message,
    'Static Markdown pages resolve to another route: /en/docs'
  )
})

it('changes neither the other routes nor a valid .md of the prerender', async () => {
  const { handlers } = await setup()
  handlers['prerender:routes']?.(new Set())
  for (const route of [
    { route: '/sitemap.xml', contents: '<urlset/>' },
    markdownRoute('/en/about.md', '# About')
  ]) {
    const original = { ...route }
    handlers['prerender:generate']?.(route)
    assert.deepEqual(route, original)
  }
})

it('publishes llms.txt and refuses an index above the budget, without truncating', async () => {
  const { handlers } = await setup()
  const route: PrerenderRoute = { route: '/llms.txt', contents: '# Site' }
  handlers['prerender:generate']?.(route)
  assert.equal(route.skip, undefined)
  assert.equal(route.error, undefined)
  const contents = `# ${'x'.repeat(LLMS_MAX_BYTES)}`
  const oversized: PrerenderRoute = { route: '/llms.txt', contents }
  handlers['prerender:generate']?.(oversized)
  assert.equal(oversized.contents, contents)
  assert.equal(
    oversized.error?.message,
    `/llms.txt has ${LLMS_MAX_BYTES + '# '.length} bytes, above the ${LLMS_MAX_BYTES} byte budget`
  )
})

it('does not duplicate routes that another configuration already prerenders', () => {
  const prerender: Prerender = { routes: ['/llms.txt'] }
  markdownPrerender({ buildId: BUILD_ID })({
    options: {
      prerender,
      output: { dir: '/unused', publicDir: '/unused', serverDir: '/unused' }
    },
    hooks: { hook: () => null }
  })
  assert.deepEqual(prerender.routes, [
    '/llms.txt',
    MARKDOWN_PRERENDER_PATH,
    SITEMAP_INVENTORY_PATH
  ])
})

it('exposes the prerender phase only while the worker exists', async () => {
  const { handlers } = await setup()
  assert.equal(env[PUBLICATION_PHASE_ENV], undefined)
  handlers['prerender:init']?.()
  assert.equal(env[PUBLICATION_PHASE_ENV], PUBLICATION_PRERENDER_PHASE)
  handlers['prerender:routes']?.(new Set())
  await assert.rejects(async () => handlers['prerender:done']?.(written([])))
  assert.equal(env[PUBLICATION_PHASE_ENV], undefined)
})

it('fails the build when the list does not go through the prerender', async () => {
  const { handlers } = await setup()
  handlers['prerender:routes']?.(new Set())
  await assert.rejects(async () => handlers['prerender:done']?.(written([])), {
    message: 'Static Markdown list was not prerendered'
  })
})

it('refuses base locale paths outside the list', async () => {
  const { handlers } = await setup()
  const route: PrerenderRoute = {
    route: MARKDOWN_PRERENDER_PATH,
    contents: manifest({
      paths: ['/en/about.md'],
      baseLocalePaths: ['/en/x.md']
    })
  }
  handlers['prerender:routes']?.(new Set())
  handlers['prerender:generate']?.(route)
  assert.equal(route.error?.message, 'Invalid static Markdown list')
})
