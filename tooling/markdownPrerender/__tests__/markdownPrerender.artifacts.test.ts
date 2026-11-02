import assert from 'node:assert/strict'
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { it } from 'node:test'

import type { PrerenderRoute } from 'nitro/types'

import {
  setup,
  prerenderList,
  written,
  markdownRoute,
  llmsIndex,
  publish
} from './fixtures.ts'
import type { PrerenderResult } from './types.ts'

it('falha o build quando um .md listado não foi gravado', async () => {
  const { handlers } = await setup()
  prerenderList({ handlers, paths: ['/en/about.md', '/pt/index.md'] })
  await assert.rejects(
    async () => handlers['prerender:done']?.(written(['/en/about.md'])),
    { message: 'Static Markdown not generated: /pt/index.md' }
  )
})

it('aceita os .md gravados com o caminho decodificado pelo Nitro', async () => {
  const target = await setup()
  assert.ok(target.handlers['prerender:done'])
  await assert.doesNotReject(async () =>
    publish({
      setup: target,
      files: { '/en/about.md': '# About', '/pt/caf%C3%A9.md': '# Café' },
      llms: llmsIndex([])
    })
  )
})

it('deixa o failOnError do Nitro relatar as rotas com erro', async () => {
  const { prerender, handlers } = await setup()
  prerenderList({ handlers, paths: ['/en/about.md'] })
  const result: PrerenderResult = {
    prerenderedRoutes: [],
    failedRoutes: [{ route: '/en/about.md', error: { message: '[500]' } }]
  }
  await assert.doesNotReject(async () => handlers['prerender:done']?.(result))
  prerender.failOnError = false
  await assert.rejects(async () => handlers['prerender:done']?.(result), {
    message: 'Static Markdown not generated: /en/about.md'
  })
})

it('marca erro no .md cujo artefato não é Markdown gravado no próprio caminho', async () => {
  const { handlers } = await setup()
  prerenderList({ handlers, paths: ['/en/about.md'] })
  const html = '<!doctype html><html><body>Redirect</body></html>'
  for (const route of [
    { ...markdownRoute('/en/about.md', html), fileName: '/en/about.md.html' },
    { ...markdownRoute('/en/about.md', html), contentType: 'text/html' },
    { route: '/en/about.md', fileName: '/en/about.md', contents: '' }
  ] satisfies PrerenderRoute[]) {
    handlers['prerender:generate']?.(route)
    assert.match(
      route.error?.message ?? '',
      /^Invalid static Markdown \/en\/about\.md: /u
    )
  }
})

it('preserva o erro HTTP registrado pelo Nitro', async () => {
  const { handlers } = await setup()
  const error = { message: '[500] Server Error', status: 500 }
  const route: PrerenderRoute = { route: '/en/about.md', error }
  handlers['prerender:generate']?.(route)
  assert.equal(route.error, error)
})

it('recusa .md fora da lista, .md.html, links simbólicos e arquivos ausentes no diretório publicado', async () => {
  const cases: [string, (publicDir: string) => Promise<void>][] = [
    [
      '/en/extra.md (not in the static Markdown list)',
      dir => writeFile(path.join(dir, 'en', 'extra.md'), '# Extra')
    ],
    [
      '/en/about.md.html (HTML written for a .md URL)',
      dir => writeFile(path.join(dir, 'en', 'about.md.html'), '<html></html>')
    ],
    [
      '/en/link.md (not a regular file)',
      dir =>
        symlink(
          path.join(dir, 'en', 'about.md'),
          path.join(dir, 'en', 'link.md')
        )
    ],
    [
      '/en/about.md (missing from the static output)',
      dir => rm(path.join(dir, 'en', 'about.md'))
    ]
  ]
  for (const [problem, change] of cases) {
    const target = await setup()
    const { handlers, publicDir } = target
    prerenderList({ handlers, paths: ['/en/about.md'] })
    await mkdir(path.join(publicDir, 'en'))
    await writeFile(path.join(publicDir, 'en', 'about.md'), '# About')
    await change(publicDir)
    handlers['prerender:generate']?.({
      route: '/llms.txt',
      contents: llmsIndex([])
    })
    await assert.rejects(
      async () => handlers['prerender:done']?.(written(['/en/about.md'])),
      { message: `Invalid static Markdown output: ${problem}` },
      problem
    )
  }
})

it('recusa um .md gravado pelo prerender fora da lista ou com outro nome de arquivo', async () => {
  const { handlers } = await setup()
  prerenderList({ handlers, paths: ['/en/about.md'] })
  await assert.rejects(
    async () =>
      handlers['prerender:done']?.(written(['/en/about.md', '/en/extra.md'])),
    { message: 'Static Markdown outside the list: /en/extra.md' }
  )
  const result: PrerenderResult = {
    prerenderedRoutes: [
      { route: '/en/about.md', fileName: '/en/about.md.html' }
    ],
    failedRoutes: []
  }
  await assert.rejects(async () => handlers['prerender:done']?.(result), {
    message: 'Static Markdown not generated: /en/about.md'
  })
})

it('recusa .md publicado vazio, corrompido ou trocado depois da validação', async () => {
  const approved = { '/en/a.md': '# Page A', '/en/b.md': '# Page B' }
  const cases: [string, Record<string, Uint8Array | string>][] = [
    ['/en/a.md', { '/en/a.md': '' }],
    ['/en/a.md', { '/en/a.md': Buffer.from('2320ff', 'hex') }],
    ['/en/a.md, /en/b.md', { '/en/a.md': '# Page B', '/en/b.md': '# Page A' }]
  ]
  for (const [paths, changes] of cases) {
    const target = await setup()
    const { handlers, publicDir } = target
    prerenderList({ handlers, paths: Object.keys(approved) })
    await mkdir(path.join(publicDir, 'en'))
    for (const [route, contents] of Object.entries(approved)) {
      await writeFile(path.join(publicDir, route), contents)
      const generated = markdownRoute(route, contents)
      handlers['prerender:generate']?.(generated)
      assert.equal(generated.error, undefined)
    }
    for (const [route, contents] of Object.entries(changes)) {
      await writeFile(path.join(publicDir, route), contents)
    }
    handlers['prerender:generate']?.({
      route: '/llms.txt',
      contents: llmsIndex([])
    })
    const problems = paths
      .split(', ')
      .map(route => `${route} (content differs from the approved artifact)`)
    await assert.rejects(
      async () => handlers['prerender:done']?.(written(Object.keys(approved))),
      { message: `Invalid static Markdown output: ${problems.join(', ')}` },
      paths
    )
  }
})

it('recusa .md registrado que não passou pela validação do prerender', async () => {
  const { handlers, publicDir } = await setup()
  prerenderList({ handlers, paths: ['/en/about.md'] })
  await mkdir(path.join(publicDir, 'en'))
  await writeFile(path.join(publicDir, 'en', 'about.md'), '# About')
  handlers['prerender:generate']?.({
    route: '/llms.txt',
    contents: llmsIndex([])
  })
  await assert.rejects(
    async () => handlers['prerender:done']?.(written(['/en/about.md'])),
    {
      message:
        'Invalid static Markdown output: /en/about.md (not validated by the prerender)'
    }
  )
})
