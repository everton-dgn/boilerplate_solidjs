import assert from 'node:assert/strict'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { it } from 'node:test'

import {
  LLMS_DESCRIBEDBY_LINK,
  LLMS_FULL_PATH
} from '../../../src/constants/llms.ts'
import { SITE_URL, MARKDOWN_TYPE } from './constants.ts'
import {
  setup,
  prerenderList,
  written,
  markdownRoute,
  llmsIndex,
  publish
} from './fixtures.ts'

type Route = { headers?: Record<string, string> }

function isDescribedby(route: Route): boolean {
  return route.headers?.link === LLMS_DESCRIBEDBY_LINK
}

it('aceita zero opt-in sem gerar o agregado nem regras', async () => {
  const target = await setup()
  await publish({ setup: target, files: {}, llms: llmsIndex(['/en']) })
  const published = await readdir(target.publicDir)
  assert.deepEqual(published.toSorted(), ['_markdown', 'llms.txt'])
  assert.deepEqual(await target.finish(), {
    ...target.config,
    overrides: { 'llms.txt': { contentType: MARKDOWN_TYPE } }
  })
})

it('recusa um agregado residual mesmo sem páginas selecionadas', async () => {
  const target = await setup()
  const aggregate = path.join(target.publicDir, 'llms-full.txt')
  await writeFile(aggregate, 'stale-public-artifact')
  await assert.rejects(
    publish({ setup: target, files: {}, llms: llmsIndex(['/en']) }),
    { message: '/llms-full.txt already exists in the static output' }
  )
  assert.equal(await readFile(aggregate, 'utf8'), 'stale-public-artifact')
})

it('falha quando o llms.txt não passa pelo prerender', async () => {
  const { handlers } = await setup()
  prerenderList({ handlers, paths: [] })
  await assert.rejects(async () => handlers['prerender:done']?.(written([])), {
    message: 'llms.txt was not prerendered'
  })
})

it('exige que o anúncio do llms-full.txt coincida com os documentos selecionados', async () => {
  const full = new URL(LLMS_FULL_PATH, SITE_URL).href
  await assert.rejects(
    publish({
      setup: await setup(),
      files: { '/en/about.md': '# About' },
      llms: llmsIndex(['/en/about.md'])
    }),
    {
      message: `llms.txt does not announce ${LLMS_FULL_PATH} for its static Markdown pages`
    }
  )
  await assert.rejects(
    publish({
      setup: await setup(),
      files: { '/en/about.md': '# About' },
      llms: llmsIndex(['/en/contact', full])
    }),
    {
      message: `llms.txt announces ${LLMS_FULL_PATH} without static Markdown pages`
    }
  )
})

it('publica o llms-full.txt com Link e tipo Markdown no artefato da Vercel', async () => {
  const target = await setup()
  const full = new URL(LLMS_FULL_PATH, SITE_URL).href
  await publish({
    setup: target,
    files: { '/en/index.md': '# Home', '/en/about.md': '# About' },
    llms: llmsIndex(['/en/about.md', '/en/index.md', '/en/about.md#team', full])
  })
  const body = await readFile(
    path.join(target.publicDir, 'llms-full.txt'),
    'utf8'
  )
  assert.equal(
    body,
    [
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
      '',
      `Source: ${SITE_URL}en/about.md`,
      'Bytes: 7',
      '',
      '# About',
      '',
      `Source: ${SITE_URL}en/index.md`,
      'Bytes: 6',
      '',
      '# Home',
      ''
    ].join('\n')
  )
  // O diretório temporário da montagem não sobra ao lado da saída estática.
  assert.deepEqual(await readdir(target.outputDir), ['static'])
  const { routes, overrides } = await target.finish()
  const describedby = routes.find(route => isDescribedby(route))
  const pattern = new RegExp(describedby?.src ?? '', 'u')
  assert.equal(pattern.test(LLMS_FULL_PATH), true)
  assert.equal(pattern.test('/en/about.md'), true)
  assert.equal(pattern.test('/llms.txt'), false)
  assert.deepEqual(overrides?.['llms-full.txt'], { contentType: MARKDOWN_TYPE })
})

it('deixa fora do agregado o .md estático de outro idioma citado pelo índice', async () => {
  const target = await setup()
  const { handlers, publicDir } = target
  const files = { '/en/about.md': '# About', '/pt/sobre.md': '# Sobre' }
  prerenderList({
    handlers,
    paths: Object.keys(files),
    baseLocalePaths: ['/en/about.md']
  })
  for (const [route, contents] of Object.entries(files)) {
    await mkdir(path.join(publicDir, path.dirname(route)), { recursive: true })
    await writeFile(path.join(publicDir, route), contents)
    handlers['prerender:generate']?.(markdownRoute(route, contents))
  }
  const full = new URL(LLMS_FULL_PATH, SITE_URL).href
  handlers['prerender:generate']?.({
    route: '/llms.txt',
    contents: llmsIndex(['/pt/sobre.md', '/en/about.md', full])
  })
  await handlers['prerender:done']?.(written(Object.keys(files)))
  const body = await readFile(path.join(publicDir, 'llms-full.txt'), 'utf8')
  assert.ok(body.includes(`- ${SITE_URL}pt/sobre.md: page in another language`))
  assert.ok(body.includes(`Source: ${SITE_URL}en/about.md\n`))
  assert.equal(body.includes('# Sobre'), false)
})
