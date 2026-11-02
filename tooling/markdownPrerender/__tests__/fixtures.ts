import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after } from 'node:test'

import type { PrerenderRoute } from 'nitro/types'
import * as v from 'valibot'

import { MARKDOWN_PRERENDER_PATH } from '../../../src/middleware/markdownContent/constants.ts'
import { SITEMAP_INVENTORY_PATH } from '../../publicationArtifacts/constants.ts'
import { markdownPrerender } from '../index.ts'
import { SITE_URL, MARKDOWN_TYPE, BUILD_ID } from './constants.ts'
import type { Prerender, PrerenderResult } from './types.ts'

type Handlers = {
  'prerender:init'?: () => void
  'prerender:routes'?: (routes: Set<string>) => void
  'prerender:generate'?: (route: PrerenderRoute) => void
  'prerender:done'?: (result: PrerenderResult) => Promise<void>
  compiled?: () => Promise<void>
}
type Config = v.InferOutput<typeof ConfigSchema>
type Setup = {
  prerender: Prerender
  handlers: Handlers
  config: Config
  publicDir: string
  outputDir: string
  finish: () => Promise<v.InferOutput<typeof ConfigSchema>>
}
type Listing = {
  handlers: Handlers
  paths: string[]
  baseLocalePaths?: string[]
  mismatches?: string[]
}
type Manifest = Omit<Listing, 'handlers'>
type WrittenRoute = { publicDir: string; route: string; contents: string }
type Publication = {
  setup: Setup
  files: Record<string, string>
  llms: string
}

const VERCEL_CONFIG_VERSION = 3
const EMPTY_INVENTORY = JSON.stringify({
  version: 1,
  buildId: BUILD_ID,
  siteUrl: SITE_URL,
  byteBudget: 4_194_304,
  pagePartCount: 0,
  hasLegacySources: false,
  hasPartitionSources: false,
  identities: null
})
// Rotas de prerender que o Nitro grava no diretório público depois do hook.
const WRITTEN_ROUTES = new Set(['/llms.txt', MARKDOWN_PRERENDER_PATH])
const HeaderSchema = v.record(v.string(), v.string())
const OverridesSchema = v.record(v.string(), v.looseObject({}))
const RouteSchema = v.looseObject({
  src: v.optional(v.string()),
  dest: v.optional(v.string()),
  handle: v.optional(v.string()),
  continue: v.optional(v.boolean()),
  headers: v.optional(HeaderSchema)
})
const ConfigSchema = v.looseObject({
  version: v.literal(VERCEL_CONFIG_VERSION),
  routes: v.array(RouteSchema),
  overrides: v.optional(OverridesSchema)
})

async function writePublished({
  publicDir,
  route,
  contents
}: WrittenRoute): Promise<void> {
  const file = path.join(publicDir, route)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, contents)
}

export async function setup(): Promise<Setup> {
  const dir = await mkdtemp(path.join(tmpdir(), 'markdown-routing-'))
  after(() => rm(dir, { recursive: true, force: true }))
  const publicDir = path.join(dir, 'static')
  await mkdir(publicDir)
  const serverDir = path.join(dir, 'functions', '__server.func')
  const prerender: Prerender = { routes: ['/existing'] }
  const handlers: Handlers = {}
  const config: Config = {
    version: 3,
    routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/__server' }]
  }
  markdownPrerender({ buildId: BUILD_ID })({
    options: { prerender, output: { dir, publicDir, serverDir } },
    hooks: {
      hook<Name extends keyof Handlers>(
        name: Name,
        handler: NonNullable<Handlers[Name]>
      ) {
        handlers[name] = handler
      }
    }
  })
  const generate = handlers['prerender:generate']
  const finishPrerender = handlers['prerender:done']
  const writes: Promise<void>[] = []
  handlers['prerender:generate'] = route => {
    generate?.(route)
    if (route.skip || route.error || !WRITTEN_ROUTES.has(route.route)) return
    writes.push(
      writePublished({
        publicDir,
        route: route.route,
        contents: route.contents ?? ''
      })
    )
  }
  handlers['prerender:done'] = async result => {
    await Promise.all(writes)
    return finishPrerender?.(result)
  }
  return {
    prerender,
    handlers,
    config,
    publicDir,
    outputDir: dir,
    async finish() {
      const file = path.join(dir, 'config.json')
      await writeFile(file, JSON.stringify(config))
      await handlers.compiled?.()
      return v.parse(ConfigSchema, JSON.parse(await readFile(file, 'utf8')))
    }
  }
}

// Sem idioma explícito, todos os arquivos contam como do idioma base.
export function manifest({
  paths,
  baseLocalePaths = paths,
  mismatches = []
}: Manifest): string {
  return JSON.stringify({
    siteUrl: SITE_URL,
    baseLocale: 'en',
    paths,
    baseLocalePaths,
    mismatches
  })
}

export function prerenderList({ handlers, ...listing }: Listing): void {
  handlers['prerender:routes']?.(new Set())
  handlers['prerender:generate']?.({
    route: MARKDOWN_PRERENDER_PATH,
    contents: manifest(listing)
  })
  handlers['prerender:generate']?.({
    route: SITEMAP_INVENTORY_PATH,
    contents: EMPTY_INVENTORY
  })
}

// O Nitro grava a URL `.md` com o mesmo nome de arquivo da rota decodificada.
export function written(routes: string[]): PrerenderResult {
  return {
    prerenderedRoutes: routes.map(route => ({ route, fileName: route })),
    failedRoutes: []
  }
}

export function markdownRoute(route: string, contents: string): PrerenderRoute {
  return { route, fileName: route, contentType: MARKDOWN_TYPE, contents }
}

export function llmsIndex(links: string[]): string {
  return [
    '# Site',
    '',
    '> Description',
    '',
    '## Pages',
    '',
    ...links.map(link => `- [Page](${new URL(link, SITE_URL).href})`),
    ''
  ].join('\n')
}

// Simula o prerender completo: lista, `.md` gravados no diretório estático e
// llms.txt lido pelo hook.
export async function publish({
  setup: target,
  files,
  llms
}: Publication): Promise<void> {
  const paths = Object.keys(files)
  prerenderList({ handlers: target.handlers, paths })
  for (const [route, contents] of Object.entries(files)) {
    const file = path.join(target.publicDir, decodeURI(route))
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, contents)
    const generated = markdownRoute(decodeURI(route), contents)
    target.handlers['prerender:generate']?.(generated)
    assert.equal(generated.error, undefined, route)
  }
  target.handlers['prerender:generate']?.({
    route: '/llms.txt',
    fileName: '/llms.txt',
    contentType: MARKDOWN_TYPE,
    contents: llms
  })
  return target.handlers['prerender:done']?.(
    written(paths.map(route => decodeURI(route)))
  )
}
