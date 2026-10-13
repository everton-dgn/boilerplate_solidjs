/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { before as beforeAll, describe, it } from 'node:test'

import { generateMessages } from '../../../i18n/generateMessages/index.ts'
import { loadArtifacts } from '../index.ts'

const ROOT = path.resolve(import.meta.dirname, '../../../..')

// O runner importa @paraglide da raiz, ausente em um checkout limpo.
beforeAll(() => generateMessages(ROOT))

describe('isolated Markdown build runner', () => {
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
        info: { markdown: true, llms: false }
      };
      export default function Page() { return <MissingComponent />; }
    `
    )
    await writeFile(
      path.join(directory, 'markdown.ts'),
      `export { markdown } from '@/routes/(base)/about/markdown.ts';`
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
            ? true : undefined
        }
      }; export default function Page() { return null; }`
    )
    await writeFile(
      path.join(directory, 'markdown.ts'),
      `export { markdown } from '@/routes/(base)/about/markdown.ts';`
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

  it('follows relative re-export chains to the original producer instead of a sibling decoy', async context => {
    const directory = await mkdtemp(path.join(tmpdir(), 'markdown-chain-'))
    context.after(() => rm(directory, { recursive: true, force: true }))
    await writeFile(
      path.join(directory, 'fixture.tsx'),
      `export { default, route } from './bridge.ts';`
    )
    await writeFile(
      path.join(directory, 'bridge.ts'),
      `export { default, route } from '@/routes/(base)/about/index.tsx';`
    )
    await writeFile(
      path.join(directory, 'markdown.ts'),
      `throw new Error('re-export sibling must not load');`
    )
    const result = await loadArtifacts({ root: ROOT, directory })
    assert.ok(
      result.artifacts
        .find(artifact => artifact.href === '/en/fixture.md')
        ?.body.includes('About SolidJS Boilerplate')
    )
  })

  it('keeps a producer colocated when a parameterized page moves', async context => {
    const directory = await mkdtemp(path.join(tmpdir(), 'markdown-move-'))
    context.after(() => rm(directory, { recursive: true, force: true }))
    const original = path.join(directory, 'articles/[slug]')
    const moved = path.join(directory, 'posts/[slug]')
    await mkdir(original, { recursive: true })
    await mkdir(path.dirname(moved), { recursive: true })
    await writeFile(
      path.join(original, 'index.tsx'),
      `export const route = { info: { markdown: true } }; export default function Page() { return null; }`
    )
    await writeFile(
      path.join(original, 'markdown.ts'),
      `export const markdown = {
        getPaths: () => ['/posts/public'],
        render: ({ locale, path }) => ({ title: locale + path, description: 'Description', intro: 'Public text', sections: [], links: [] })
      };`
    )
    await rename(original, moved)
    const result = await loadArtifacts({ root: ROOT, directory })
    assert.deepEqual(
      result.artifacts.map(artifact => [artifact.href, artifact.title]),
      ['pt', 'en', 'es'].map(locale => [
        `/${locale}/posts/public.md`,
        `${locale}/posts/public`
      ])
    )
  })
})

describe('Markdown source selection', () => {
  it('does not load a producer for absent or false publication flags', async context => {
    const directory = await mkdtemp(path.join(tmpdir(), 'markdown-disabled-'))
    context.after(() => rm(directory, { recursive: true, force: true }))
    await writeFile(
      path.join(directory, 'markdown.ts'),
      `throw new Error('disabled producer must not load');`
    )
    for (const flag of ['false', 'undefined']) {
      await writeFile(
        path.join(directory, 'index.tsx'),
        `export const route = { info: { markdown: ${flag}, llms: true } }; export default function Page() { return null; }`
      )
      const result = await loadArtifacts({ root: ROOT, directory })
      assert.deepEqual(result.artifacts, [])
    }
  })

  it('fails with the expected producer path when an enabled page has no markdown.ts', async context => {
    const directory = await mkdtemp(path.join(tmpdir(), 'markdown-missing-'))
    context.after(() => rm(directory, { recursive: true, force: true }))
    await writeFile(
      path.join(directory, 'index.tsx'),
      `export const route = { info: { markdown: true } }; export default function Page() { return null; }`
    )
    await assert.rejects(loadArtifacts({ root: ROOT, directory }), error => {
      assert.ok(error instanceof Error)
      assert.ok(error.message.includes(path.join(directory, 'markdown.ts')))
      return true
    })
  })

  it('rejects obsolete publication objects instead of silently publishing', async context => {
    const directory = await mkdtemp(path.join(tmpdir(), 'markdown-legacy-'))
    context.after(() => rm(directory, { recursive: true, force: true }))
    await writeFile(
      path.join(directory, 'index.tsx'),
      `export const route = { info: { markdown: { source: 'obsolete' } } }; export default function Page() { return null; }`
    )
    await assert.rejects(
      loadArtifacts({ root: ROOT, directory }),
      /Markdown publication must be a boolean/u
    )
  })

  it('does not resolve producers behind non-publishing indirect re-exports', async context => {
    const directory = await mkdtemp(path.join(tmpdir(), 'markdown-opt-out-'))
    context.after(() => rm(directory, { recursive: true, force: true }))
    await writeFile(
      path.join(directory, 'index.tsx'),
      `export { route } from './shared.ts'; export default function Page() { return null; }`
    )
    await writeFile(
      path.join(directory, 'shared.ts'),
      `export * from './base.ts';`
    )
    for (const flag of ['false', 'undefined']) {
      await writeFile(
        path.join(directory, 'base.ts'),
        `export const route = { info: { markdown: ${flag} } };`
      )
      const result = await loadArtifacts({ root: ROOT, directory })
      assert.deepEqual(result.artifacts, [])
    }
  })

  it('does not confuse a namespace route with a default export producer', async context => {
    const directory = await mkdtemp(path.join(tmpdir(), 'markdown-namespace-'))
    context.after(() => rm(directory, { recursive: true, force: true }))
    await writeFile(
      path.join(directory, 'index.tsx'),
      `export * as route from './settings.ts'; export default function Page() { return null; }`
    )
    for (const flag of ['false', 'true']) {
      await writeFile(
        path.join(directory, 'settings.ts'),
        `export const info = { markdown: ${flag} };`
      )
      const result = loadArtifacts({ root: ROOT, directory })
      if (flag === 'true') {
        await assert.rejects(result, /Use a named Markdown route re-export/u)
      } else {
        const { artifacts } = await result
        assert.deepEqual(artifacts, [])
      }
    }
  })
})
