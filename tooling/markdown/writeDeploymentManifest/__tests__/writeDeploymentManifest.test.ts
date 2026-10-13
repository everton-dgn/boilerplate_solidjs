/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import * as v from 'valibot'

import type { MarkdownArtifact } from '../../types.ts'
import { writeDeploymentManifest } from '../index.ts'

const routeSchema = v.object({
  src: v.optional(v.string()),
  continue: v.optional(v.boolean()),
  handle: v.optional(v.string())
})
const configSchema = v.object({ routes: v.array(routeSchema) })

describe('Markdown deployment metadata', () => {
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
      { href: artifact.href, locale: 'en' }
    ])
  })
})
