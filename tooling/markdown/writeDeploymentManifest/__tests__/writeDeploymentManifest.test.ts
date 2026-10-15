/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import * as v from 'valibot'

import type { MarkdownArtifact } from '../../types.ts'
import { writeDeploymentManifest } from '../index.ts'

const methodsSchema = v.array(v.string())
const routeSchema = v.object({
  src: v.optional(v.string()),
  dest: v.optional(v.string()),
  continue: v.optional(v.boolean()),
  handle: v.optional(v.string()),
  methods: v.optional(methodsSchema)
})
const configSchema = v.object({ routes: v.array(routeSchema) })
const MISSING_INDEX = -1

function createArtifact(href: string): MarkdownArtifact {
  return {
    path: href.slice(0, -'.md'.length),
    href,
    locale: 'pt',
    body: '# Page\n',
    title: 'Page',
    description: 'Description',
    llms: { shouldInclude: true, section: 'Pages', isOptional: false }
  }
}

describe('Markdown deployment metadata', () => {
  it('keeps directory URLs out of static index resolution without intercepting Markdown files', async context => {
    const output = await mkdtemp(path.join(tmpdir(), 'markdown-deployment-'))
    context.after(() => rm(output, { recursive: true, force: true }))
    const hrefs = [
      '/index.md',
      '/pt/index.md',
      '/en/index.md',
      '/es/index.md',
      '/pt/blog/index.md',
      '/pt/a+b/index.md',
      '/pt/about.md'
    ]
    const routes = [
      { src: '/assets/(.*)', headers: { 'cache-control': 'public' } },
      { handle: 'filesystem' },
      { src: '/api/(.*)', dest: '/api' },
      { src: '/(.*)', dest: '/app-handler' },
      { handle: 'error' },
      { src: '/(.*)', dest: '/error', status: 404 }
    ]
    await writeFile(
      path.join(output, 'config.json'),
      JSON.stringify({ version: 3, routes })
    )
    await writeDeploymentManifest({
      output,
      artifacts: hrefs.map(href => createArtifact(href))
    })
    const configText = await readFile(path.join(output, 'config.json'), 'utf8')
    const config = v.parse(configSchema, JSON.parse(configText))
    const filesystem = config.routes.findIndex(
      route => route.handle === 'filesystem'
    )
    assert.notEqual(filesystem, MISSING_INDEX)
    const rewrites = config.routes
      .slice(0, filesystem)
      .filter(route => route.dest !== undefined)
    for (const pathname of [
      '/',
      '/pt',
      '/pt/',
      '/en',
      '/en/',
      '/es',
      '/es/',
      '/pt/blog',
      '/pt/blog/',
      '/pt/a+b',
      '/pt/a+b/'
    ]) {
      const route = rewrites.find(candidate =>
        new RegExp(candidate.src ?? '', 'u').test(pathname)
      )
      assert.ok(route, `${pathname} would be served as a static index`)
      assert.equal(route.dest, '/app-handler')
      assert.notEqual(route.continue, true)
      assert.equal(route.methods, undefined)
    }
    for (const pathname of [
      ...hrefs,
      '/pt/about',
      '/pt/blog/post',
      '/pt/ab',
      '/pt/index.md/extra'
    ]) {
      assert.equal(
        rewrites.some(route => new RegExp(route.src ?? '', 'u').test(pathname)),
        false,
        pathname
      )
    }
    assert.deepEqual(
      config.routes.slice(filesystem),
      v.parse(configSchema, { routes: routes.slice(1) }).routes
    )
  })

  it('rejects missing, conditional or ambiguous server fallbacks before writing output', async context => {
    const output = await mkdtemp(path.join(tmpdir(), 'markdown-deployment-'))
    context.after(() => rm(output, { recursive: true, force: true }))
    const configs = [
      [{ src: '/(.*)', dest: '/server' }],
      [{ handle: 'filesystem' }],
      [
        { handle: 'filesystem' },
        { handle: 'error' },
        { src: '/(.*)', dest: '/error' }
      ],
      [
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/one' },
        { src: '/(.*)', dest: '/two' }
      ],
      [
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/server', methods: ['GET'] }
      ],
      [
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/server', continue: true }
      ],
      [
        { handle: 'filesystem' },
        {
          src: '/(.*)',
          dest: '/server',
          has: [{ type: 'header', key: 'x-preview' }]
        }
      ],
      [{ handle: 'filesystem' }, { src: '/(.*)', dest: 'https://example.com' }],
      [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/server/$1' }]
    ]
    for (const routes of configs) {
      const file = path.join(output, 'config.json')
      const original = JSON.stringify({ version: 3, routes })
      await writeFile(file, original)
      await assert.rejects(
        writeDeploymentManifest({
          output,
          artifacts: [createArtifact('/pt/index.md')]
        }),
        /unconditional Nitro server fallback/u
      )
      assert.equal(await readFile(file, 'utf8'), original)
    }
  })

  it('restricts header patterns to exact files and retains filesystem precedence', async context => {
    const output = await mkdtemp(path.join(tmpdir(), 'markdown-deployment-'))
    context.after(() => rm(output, { recursive: true, force: true }))
    const artifact: MarkdownArtifact = {
      path: '/en/a+b',
      href: '/en/a+b.md',
      locale: 'en',
      body: '# Page\n',
      title: 'Page',
      description: 'Description',
      llms: { shouldInclude: true, section: 'Pages', isOptional: false }
    }
    await writeFile(
      path.join(output, 'config.json'),
      JSON.stringify({
        version: 3,
        routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/__server' }]
      })
    )
    await writeDeploymentManifest({ output, artifacts: [artifact] })
    const configFile = path.join(output, 'config.json')
    const manifestFile = path.join(output, 'markdown.json')
    const config = v.parse(
      configSchema,
      JSON.parse(await readFile(configFile, 'utf8'))
    )
    const pattern = new RegExp(config.routes[0]?.src ?? '', 'u')
    assert.equal(pattern.test('/en/a+b.md'), true)
    assert.equal(pattern.test('/en/abXmd'), false)
    assert.equal(pattern.test('/en/a+b.md/extra'), false)
    assert.equal(config.routes[0]?.continue, true)
    assert.equal(config.routes[1]?.handle, 'filesystem')
    assert.deepEqual(JSON.parse(await readFile(manifestFile, 'utf8')), [
      { path: artifact.path, href: artifact.href, locale: 'en' }
    ])
  })
})
