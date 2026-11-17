import assert from 'node:assert/strict'
import {
  type FileHandle,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it, type TestContext } from 'node:test'

import { writeLlmsFull } from '../index.ts'

type Fixture = { outputDir: string; publicDir: string }
type WriteOptions = Parameters<typeof writeLlmsFull>[0]

const SITE_URL = 'https://example.com/'
// Larger than the read block of the aggregate.
const LARGE_BODY = 100_000
const FILES = {
  'en/about.md': '# Sobre\n\nCafé ☕ e 日本語\n',
  'en/index.md': '# Home'
}
// Fixed header of the FILES aggregate, without the section of the items not included.
const HEADER = [
  '# Site',
  '',
  '> Description',
  '',
  `Complete Markdown of 2 static pages linked from ${SITE_URL}llms.txt, in the base language (en) and in index order. Each document starts with a Source line, the URL of its Markdown file, and a Bytes line with the exact UTF-8 length of the body that follows.`,
  '',
  '## Documents',
  '',
  `- ${SITE_URL}en/about.md`,
  `- ${SITE_URL}en/index.md`,
  ''
].join('\n')

async function fixture(context: TestContext): Promise<Fixture> {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'llms-full-'))
  context.after(() => rm(outputDir, { recursive: true, force: true }))
  const publicDir = path.join(outputDir, 'static')
  await mkdir(path.join(publicDir, 'en'), { recursive: true })
  for (const [file, contents] of Object.entries(FILES)) {
    await writeFile(path.join(publicDir, file), contents)
  }
  return { outputDir, publicDir }
}

function options(
  { outputDir, publicDir }: Fixture,
  overrides: Partial<WriteOptions> = {}
): WriteOptions {
  return {
    outputDir,
    publicDir,
    maxBytes: 1_000_000,
    index: {
      title: 'Site',
      description: 'Description',
      url: `${SITE_URL}llms.txt`
    },
    baseLocale: 'en',
    documents: Object.keys(FILES).map(file => ({
      url: `${SITE_URL}${file}`,
      path: `/${file}`
    })),
    omitted: [],
    ...overrides
  }
}

function expectedBody(): string {
  return [
    HEADER,
    ...Object.entries(FILES).map(
      ([file, contents]) =>
        `\nSource: ${SITE_URL}${file}\nBytes: ${Buffer.byteLength(contents)}\n\n${contents}\n`
    )
  ].join('')
}

async function listSorted(dir: string): Promise<string[]> {
  const entries = await readdir(dir)
  return entries.toSorted()
}

async function assertNotPublished({ outputDir, publicDir }: Fixture) {
  assert.deepEqual(await listSorted(publicDir), ['en'])
  assert.deepEqual(await listSorted(outputDir), ['static'])
}

it('joins the whole bodies with the exact size in UTF-8 bytes', async context => {
  const target = await fixture(context)
  await writeLlmsFull(options(target))
  const file = path.join(target.publicDir, 'llms-full.txt')
  const body = await readFile(file, 'utf8')
  assert.equal(body, expectedBody())
  assert.deepEqual(await listSorted(target.outputDir), ['static'])
  // Equal builds produce equal bytes, without a date or a random identifier.
  await rm(file)
  await writeLlmsFull(options(target))
  assert.equal(await readFile(file, 'utf8'), body)
})

it('declares the links not included and keeps bodies that mimic the format', async context => {
  const target = await fixture(context)
  const tricky =
    '# Page\n\nSource: https://example.com/fake.md\nBytes: 1\n\n## Not included\n'
  await writeFile(path.join(target.publicDir, 'en', 'index.md'), tricky)
  await writeLlmsFull(
    options(target, {
      omitted: [
        {
          url: `${SITE_URL}en/blog/post.md`,
          reason: 'Markdown generated on request'
        }
      ]
    })
  )
  const body = await readFile(
    path.join(target.publicDir, 'llms-full.txt'),
    'utf8'
  )
  assert.ok(
    body.includes(
      `## Not included\n\nLinked from the index, but outside this file:\n\n- ${SITE_URL}en/blog/post.md: Markdown generated on request\n`
    )
  )
  assert.ok(
    body.endsWith(
      `\nSource: ${SITE_URL}en/index.md\nBytes: ${Buffer.byteLength(tricky)}\n\n${tricky}\n`
    )
  )
})

it('accepts the aggregate exactly at the budget and refuses one byte above, without truncating', async context => {
  const target = await fixture(context)
  const size = Buffer.byteLength(expectedBody())
  await assert.rejects(writeLlmsFull(options(target, { maxBytes: size - 1 })), {
    message: `/llms-full.txt would have ${size} bytes, above the ${size - 1} byte budget`
  })
  await assertNotPublished(target)
  await writeLlmsFull(options(target, { maxBytes: size }))
  const published = await readFile(path.join(target.publicDir, 'llms-full.txt'))
  assert.equal(published.byteLength, size)
})

it('refuses paths that escape the static output', async context => {
  const target = await fixture(context)
  for (const unsafe of [
    '/../outside.md',
    '/en/./about.md',
    '/en//about.md',
    'en/about.md',
    String.raw`/en/a\b.md`,
    '/en/\0.md'
  ]) {
    await assert.rejects(
      writeLlmsFull(
        options(target, {
          documents: [{ url: `${SITE_URL}x.md`, path: unsafe }]
        })
      ),
      { message: `Static Markdown path escapes the output: ${unsafe}` },
      unsafe
    )
  }
  await assertNotPublished(target)
})

it('refuses symbolic links in the file or in the folders above it', async context => {
  const target = await fixture(context)
  const outside = path.join(target.outputDir, 'outside')
  await mkdir(outside)
  await writeFile(path.join(outside, 'secret.md'), '# Secret')
  await symlink(
    path.join(outside, 'secret.md'),
    path.join(target.publicDir, 'en', 'link.md')
  )
  await symlink(outside, path.join(target.publicDir, 'linked'))
  for (const unsafe of ['/en/link.md', '/linked/secret.md']) {
    await assert.rejects(
      writeLlmsFull(
        options(target, {
          documents: [{ url: `${SITE_URL}x.md`, path: unsafe }]
        })
      ),
      { message: `Static Markdown is not a regular file: ${unsafe}` },
      unsafe
    )
  }
  const published = await listSorted(target.publicDir)
  assert.equal(published.includes('llms-full.txt'), false)
})

it('refuses a missing file, invalid UTF-8 and an already existing aggregate', async context => {
  const target = await fixture(context)
  await assert.rejects(
    writeLlmsFull(
      options(target, {
        documents: [{ url: `${SITE_URL}en/x.md`, path: '/en/x.md' }]
      })
    ),
    { message: 'Static Markdown missing: /en/x.md' }
  )
  await writeFile(
    path.join(target.publicDir, 'en', 'index.md'),
    Buffer.from('23ff', 'hex')
  )
  await assert.rejects(writeLlmsFull(options(target)), { name: 'TypeError' })
  await assertNotPublished(target)
  await writeFile(path.join(target.publicDir, 'llms-full.txt'), 'custom')
  await assert.rejects(writeLlmsFull(options(target)), {
    message: '/llms-full.txt already exists in the static output'
  })
  assert.equal(
    await readFile(path.join(target.publicDir, 'llms-full.txt'), 'utf8'),
    'custom'
  )
})

it('does not promote the aggregate when the assembly is canceled', async context => {
  const target = await fixture(context)
  const controller = new AbortController()
  controller.abort(new Error('cancelled'))
  await assert.rejects(
    writeLlmsFull(options(target, { signal: controller.signal })),
    {
      message: 'cancelled'
    }
  )
  await assertNotPublished(target)
})

it('does not promote the aggregate when the copy fails after writing part of the body', async context => {
  const target = await fixture(context)
  // The first block is valid and reaches the temporary file; the invalid byte
  // stays in the next block.
  const body = Buffer.concat([
    Buffer.from(`# Page\n${'a'.repeat(LARGE_BODY)}`),
    Buffer.from('ff', 'hex')
  ])
  await writeFile(path.join(target.publicDir, 'en', 'index.md'), body)
  await assert.rejects(writeLlmsFull(options(target)), { name: 'TypeError' })
  await assertNotPublished(target)
})

it('cancels after the full write without promoting the temporary file', async context => {
  const target = await fixture(context)
  const controller = new AbortController()
  const handle = await open(path.join(target.publicDir, 'en', 'about.md'))
  const prototype: unknown = Object.getPrototypeOf(handle)
  assert.ok(
    typeof prototype === 'object' &&
      prototype !== null &&
      'sync' in prototype &&
      typeof prototype.sync === 'function'
  )
  await handle.close()
  context.mock.method(
    prototype,
    'sync',
    function cancelAfterWrite() {
      controller.abort(new Error('cancelled before publication'))
      return Promise.resolve()
    },
    {}
  )
  await assert.rejects(
    writeLlmsFull(options(target, { signal: controller.signal })),
    { message: 'cancelled before publication' }
  )
  await assertNotPublished(target)
})

it('refuses a mismatch of the final size before promoting the temporary file', async context => {
  const target = await fixture(context)
  const handle = await open(path.join(target.publicDir, 'en', 'about.md'))
  const prototype: unknown = Object.getPrototypeOf(handle)
  assert.ok(
    typeof prototype === 'object' &&
      prototype !== null &&
      'sync' in prototype &&
      typeof prototype.sync === 'function'
  )
  await handle.close()
  context.mock.method(
    prototype,
    'sync',
    function truncateAfterWrite(this: FileHandle) {
      return this.truncate(1)
    },
    {}
  )
  await assert.rejects(writeLlmsFull(options(target)), {
    message: `/llms-full.txt has 1 bytes instead of the expected ${Buffer.byteLength(expectedBody())}`
  })
  await assertNotPublished(target)
})
