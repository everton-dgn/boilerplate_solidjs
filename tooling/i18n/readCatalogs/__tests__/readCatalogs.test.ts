/* oxlint-disable vitest/no-import-node-test -- O tooling usa o runner nativo do Node.js. */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'

import { moveToTrash } from '../../moveToTrash/index.ts'
import { isCatalogFile, readCatalogs } from '../index.ts'

type FixtureOptions = {
  parent: string
  messages?: Record<string, unknown>
  locales?: string[]
}
type WriteOptions = {
  root: string
  locale: string
  value: unknown
  consumer?: string
}

const LOCALES = ['pt', 'en', 'es']

// Sem `trash` nem `gio`, como num runner de CI sem GLib, o diretório fica no
// temporário da máquina efêmera: os testes nunca apagam de forma permanente.
async function sandbox(context: TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'i18n-catalogs-'))
  context.after(async () => {
    await moveToTrash([directory])
  })
  return directory
}

async function writeCatalog({
  root,
  locale,
  value,
  consumer = 'Home'
}: WriteOptions): Promise<void> {
  const directory = path.join(root, 'src/routes', consumer, 'messages')
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, `${locale}.json`), JSON.stringify(value))
}

async function fixture({
  parent,
  messages = { home_hello: 'Hello {name}' },
  locales = LOCALES
}: FixtureOptions) {
  const root = await mkdtemp(path.join(parent, 'case-'))
  for (const locale of locales) {
    await writeCatalog({ root, locale, value: messages })
  }
  return { root, locales: LOCALES, baseLocale: 'pt' }
}

describe('colocated translations', () => {
  it('collects all three locales and parameters', async context => {
    const parent = await sandbox(context)
    const catalogs = await readCatalogs(await fixture({ parent }))
    assert.deepEqual(Object.keys(catalogs), LOCALES)
    assert.equal(catalogs.en?.home_hello, 'Hello {name}')
  })

  it('fails when a locale file is absent, even when it is the reference', async context => {
    const parent = await sandbox(context)
    for (const missing of LOCALES) {
      const available = LOCALES.filter(locale => locale !== missing)
      await assert.rejects(
        readCatalogs(await fixture({ parent, locales: available })),
        new RegExp(`missing locales \\[${missing}\\]`, 'u')
      )
    }
  })

  it('fails on missing, extra and mismatched parameters', async context => {
    const parent = await sandbox(context)
    for (const value of [
      { home_other: 'Hello' },
      { home_hello: 'Hello', home_extra: 'Extra' },
      { home_hello: 'Hello {username}' }
    ]) {
      const options = await fixture({ parent })
      await writeCatalog({ root: options.root, locale: 'es', value })
      await assert.rejects(
        readCatalogs(options),
        /es\.json: missing keys.*different parameters/u
      )
    }
  })

  it('rejects blank messages, malformed JSON and repeated JSON properties', async context => {
    const parent = await sandbox(context)
    for (const source of [
      '{"home_hello":"   "}',
      '{bad}',
      '{"home_hello":"a","home_hello":"b"}',
      '{}'
    ]) {
      const options = await fixture({ parent })
      await writeFile(
        path.join(options.root, 'src/routes/Home/messages/es.json'),
        source
      )
      await assert.rejects(readCatalogs(options), /Invalid catalog.*es\.json/u)
    }
  })

  it('rejects duplicate IDs across consumers and unexpected locale files', async context => {
    const parent = await sandbox(context)
    const duplicate = await fixture({ parent })
    for (const locale of LOCALES) {
      await writeCatalog({
        root: duplicate.root,
        locale,
        consumer: 'Other',
        value: { home_hello: 'Hello {name}' }
      })
    }
    await assert.rejects(
      readCatalogs(duplicate),
      /Duplicate message "home_hello"/u
    )
    const unexpected = await fixture({
      parent,
      locales: [...LOCALES, 'fr']
    })
    await assert.rejects(readCatalogs(unexpected), /unexpected \[fr\]/u)
  })

  it('supports plural variants and checks their input declarations', async context => {
    const parent = await sandbox(context)
    const plural = [
      {
        declarations: ['input count', 'local countPlural = count: plural'],
        selectors: ['countPlural'],
        match: {
          'countPlural=one': '{count} item',
          'countPlural=*': '{count} items'
        }
      }
    ]
    const options = await fixture({ parent, messages: { home_count: plural } })
    const catalogs = await readCatalogs(options)
    assert.deepEqual(catalogs.es?.home_count, plural)
    await writeCatalog({
      root: options.root,
      locale: 'es',
      value: { home_count: 'Items' }
    })
    await assert.rejects(
      readCatalogs(options),
      /different parameters \[home_count\]/u
    )
  })
})

describe('catalog file filter', () => {
  it('matches only the colocated catalogs that the generator reads', () => {
    const root = path.join(tmpdir(), 'project')
    const accepted = [
      'src/routes/(base)/(home)/messages/pt.json',
      'src/components/atoms/Button/messages/en.json',
      'src/messages/es.json'
    ]
    const ignored = [
      '.paraglide/messages/pt.json',
      'src/paraglide/messages/home_title.js',
      'src/paraglide/messages/pt.json',
      'src/tests/fixtures/messages/pt.json',
      'src/components/Button/__tests__/messages/pt.json',
      'src/routes/Home/messages/nested/pt.json',
      'src/routes/Home/messages/pt.js',
      '../outside/src/routes/Home/messages/pt.json'
    ]
    for (const file of accepted) {
      assert.equal(isCatalogFile({ root, file: path.join(root, file) }), true)
    }
    for (const file of ignored) {
      assert.equal(isCatalogFile({ root, file: path.join(root, file) }), false)
    }
  })
})
