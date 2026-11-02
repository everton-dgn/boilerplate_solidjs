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

it('registra a lista estática e falha o build em erro de prerender', async () => {
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

it('enfileira os arquivos listados e publica a lista', async () => {
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

it('marca erro quando a lista não traz só arquivos .md', async () => {
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

it('recusa a lista quando uma página com opt-in estático resolve para outra rota', async () => {
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

it('não altera as demais rotas nem um .md válido do prerender', async () => {
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

it('publica o llms.txt e recusa um índice acima do orçamento, sem truncar', async () => {
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

it('não duplica rotas que outra configuração já prerenderiza', () => {
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

it('expõe a fase de prerender só enquanto o worker existe', async () => {
  const { handlers } = await setup()
  assert.equal(env[PUBLICATION_PHASE_ENV], undefined)
  handlers['prerender:init']?.()
  assert.equal(env[PUBLICATION_PHASE_ENV], PUBLICATION_PRERENDER_PHASE)
  handlers['prerender:routes']?.(new Set())
  await assert.rejects(async () => handlers['prerender:done']?.(written([])))
  assert.equal(env[PUBLICATION_PHASE_ENV], undefined)
})

it('falha o build quando a lista não passa pelo prerender', async () => {
  const { handlers } = await setup()
  handlers['prerender:routes']?.(new Set())
  await assert.rejects(async () => handlers['prerender:done']?.(written([])), {
    message: 'Static Markdown list was not prerendered'
  })
})

it('recusa caminhos do idioma base fora da lista', async () => {
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
