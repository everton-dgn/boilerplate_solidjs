/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { it } from 'node:test'

import type { PrerenderRoute } from 'nitro/types'

import { MARKDOWN_PRERENDER_PATH } from '../../../src/middleware/markdownContent/constants.ts'
import { markdownPrerender } from '../index.ts'

type Handlers = {
  'prerender:routes'?: (routes: Set<string>) => void
  'prerender:generate'?: (route: PrerenderRoute) => void
}
type Prerender = { routes?: string[]; failOnError?: boolean }
type Setup = { prerender: Prerender; handlers: Handlers }

function setup(): Setup {
  const prerender: Prerender = { routes: ['/existing'] }
  const handlers: Handlers = {}
  markdownPrerender({
    options: { prerender },
    hooks: {
      hook<Name extends keyof Handlers>(
        name: Name,
        handler: NonNullable<Handlers[Name]>
      ) {
        handlers[name] = handler
      }
    }
  })
  return { prerender, handlers }
}

it('registra a lista estática e falha o build em erro de prerender', () => {
  const { prerender } = setup()
  assert.deepEqual(prerender, {
    routes: ['/existing', MARKDOWN_PRERENDER_PATH],
    failOnError: true
  })
})

it('enfileira os arquivos listados sem gravar a lista', () => {
  const { handlers } = setup()
  const routes = new Set<string>()
  handlers['prerender:routes']?.(routes)
  const route: PrerenderRoute = {
    route: MARKDOWN_PRERENDER_PATH,
    contents: JSON.stringify(['/en/about.md', '/pt/index.md'])
  }
  handlers['prerender:generate']?.(route)
  assert.deepEqual([...routes], ['/en/about.md', '/pt/index.md'])
  assert.equal(route.skip, true)
  assert.equal(route.error, undefined)
})

it('marca erro quando a lista não traz só arquivos .md', () => {
  for (const contents of ['not json', '["/en/about"]', '{}']) {
    const { handlers } = setup()
    const routes = new Set<string>()
    handlers['prerender:routes']?.(routes)
    const route: PrerenderRoute = { route: MARKDOWN_PRERENDER_PATH, contents }
    handlers['prerender:generate']?.(route)
    assert.equal(routes.size, 0)
    assert.equal(route.skip, true)
    assert.ok(route.error)
  }
})

it('não altera as demais rotas do prerender', () => {
  const { handlers } = setup()
  handlers['prerender:routes']?.(new Set())
  const route: PrerenderRoute = { route: '/en/about.md', contents: '# About' }
  handlers['prerender:generate']?.(route)
  assert.deepEqual(route, { route: '/en/about.md', contents: '# About' })
})
