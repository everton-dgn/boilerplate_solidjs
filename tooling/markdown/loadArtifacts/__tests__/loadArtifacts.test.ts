/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { before as beforeAll, describe, it } from 'node:test'

import { generateMessages } from '../../../i18n/generateMessages/index.ts'
import { loadArtifacts } from '../index.ts'

const ROOT = path.resolve(import.meta.dirname, '../../../..')

describe('isolated Markdown build runner', () => {
  // O runner importa @paraglide da raiz, ausente em um checkout limpo.
  beforeAll(() => generateMessages(ROOT))

  it('loads colocated producers with locale isolation without rendering or importing UI', async context => {
    const directory = await mkdtemp(path.join(tmpdir(), 'markdown-routes-'))
    context.after(() => rm(directory, { recursive: true, force: true }))
    await writeFile(
      path.join(directory, 'fixture.tsx'),
      `
      import MissingComponent from './ui-must-not-load.tsx';
      import './styles-must-not-load.css';
      export const route = {
        preload() { throw new Error('preload must not execute'); },
        info: { markdown: { source: '@/routes/(base)/about/helpers/markdown.ts' }, llms: false }
      };
      export default function Page() { return <MissingComponent />; }
    `
    )
    const result = await loadArtifacts({ root: ROOT, directory })
    assert.deepEqual(
      result.artifacts.map(artifact => artifact.href),
      ['/pt/fixture.md', '/en/fixture.md', '/es/fixture.md']
    )
    assert.equal(
      result.artifacts[0]?.body.startsWith('# Sobre o SolidJS Boilerplate\n'),
      true
    )
    assert.equal(
      result.artifacts[1]?.body.startsWith('# About SolidJS Boilerplate\n'),
      true
    )
    assert.equal(
      result.artifacts[2]?.body.startsWith('# Acerca de SolidJS Boilerplate\n'),
      true
    )
    assert.equal(
      result.artifacts.every(artifact => !artifact.llms.shouldInclude),
      true
    )
  })

  it('follows route metadata re-exports without loading the original page component', async context => {
    const directory = await mkdtemp(path.join(tmpdir(), 'markdown-reexports-'))
    context.after(() => rm(directory, { recursive: true, force: true }))
    await writeFile(
      path.join(directory, 'fixture.tsx'),
      `export { default, route } from '@/routes/(base)/about/index.tsx';`
    )
    const result = await loadArtifacts({ root: ROOT, directory })
    assert.deepEqual(
      result.artifacts.map(artifact => artifact.href),
      ['/pt/fixture.md', '/en/fixture.md', '/es/fixture.md']
    )
    assert.ok(result.artifacts[1]?.body.includes('About SolidJS Boilerplate'))
  })

  it('uses the application build mode and public environment for route metadata', async context => {
    const directory = await mkdtemp(path.join(tmpdir(), 'markdown-env-'))
    context.after(() => rm(directory, { recursive: true, force: true }))
    await writeFile(
      path.join(directory, 'fixture.tsx'),
      `export const route = {
        info: {
          markdown: import.meta.env.MODE === 'staging' && import.meta.env.PROD && import.meta.env.VITE_MARKDOWN_ENABLED === 'yes'
            ? { source: '@/routes/(base)/about/helpers/markdown.ts' } : undefined
        }
      }; export default function Page() { return null; }`
    )
    const result = await loadArtifacts({
      root: ROOT,
      directory,
      mode: 'staging',
      environment: { MODE: 'staging', PROD: true, VITE_MARKDOWN_ENABLED: 'yes' }
    })
    assert.deepEqual(
      result.artifacts.map(artifact => artifact.locale),
      ['pt', 'en', 'es']
    )
  })
})
