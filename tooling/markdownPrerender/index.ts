import type { PrerenderRoute } from 'nitro/types'
import * as v from 'valibot'

import { MARKDOWN_PRERENDER_PATH } from '../../src/middleware/markdownContent/constants.ts'
import { readLlmsIndex } from '../../src/routes/(seo)/llms.txt/helpers/readLlmsIndex/index.ts'
import { LLMS_FULL_MAX_BYTES, LLMS_FULL_PATH, LLMS_PATH } from './constants.ts'
import { digestBytes, readRouteBytes } from './helpers/artifactDigest/index.ts'
import { assertStaticOutput } from './helpers/assertStaticOutput/index.ts'
import { inspectMarkdownArtifact } from './helpers/inspectMarkdownArtifact/index.ts'
import { selectLlmsFullDocuments } from './helpers/selectLlmsFullDocuments/index.ts'
import { writeLlmsFull } from './helpers/writeLlmsFull/index.ts'
import { writeVercelRoutes } from './helpers/writeVercelRoutes/index.ts'
import type { ArtifactDigest } from './types.ts'

type PrerenderResult = {
  prerenderedRoutes: PrerenderRoute[]
  failedRoutes: PrerenderRoute[]
}
type RoutesHook = (routes: Set<string>) => void
type GenerateHook = (route: PrerenderRoute) => void
type DoneHook = (result: PrerenderResult) => Promise<void>
type CompiledHook = () => Promise<void>
type PrerenderOptions = {
  routes?: string[]
  failOnError?: boolean
}
type Options = {
  prerender: PrerenderOptions
  output: { dir: string; publicDir: string }
}
type PrerenderNitro = {
  options: Options
  hooks: {
    hook: ((name: 'prerender:routes', handler: RoutesHook) => unknown) &
      ((name: 'prerender:generate', handler: GenerateHook) => unknown) &
      ((name: 'prerender:done', handler: DoneHook) => unknown) &
      ((name: 'compiled', handler: CompiledHook) => unknown)
  }
}
type Manifest = v.InferOutput<typeof ManifestSchema>
type Inventory = {
  manifest: Manifest
  expected: Map<string, string>
  baseLocalePaths: Set<string>
}
type LlmsFullOptions = {
  inventory: Inventory
  llmsText: string
  outputDir: string
  publicDir: string
}
type RegistrationOptions = {
  prerenderedRoutes: PrerenderRoute[]
  expected: Map<string, string>
}

const MARKDOWN_FILE = /^\/[^?#]+\.md$/u
const MarkdownPathSchema = v.pipe(v.string(), v.regex(MARKDOWN_FILE))
const ManifestSchema = v.object({
  siteUrl: v.pipe(v.string(), v.url()),
  baseLocale: v.pipe(v.string(), v.nonEmpty()),
  paths: v.array(MarkdownPathSchema),
  baseLocalePaths: v.array(MarkdownPathSchema),
  mismatches: v.array(v.string())
})

// O Nitro registra a rota decodificada; o mapa guarda a forma publicada.
function readInventory(contents: string | undefined): Inventory | undefined {
  try {
    const manifest = v.parse(ManifestSchema, JSON.parse(contents ?? ''))
    const expected = new Map(
      manifest.paths.map(path => [decodeURI(path), path])
    )
    const baseLocalePaths = new Set(
      manifest.baseLocalePaths.map(path => decodeURI(path))
    )
    const isValid =
      expected.size === manifest.paths.length &&
      [...baseLocalePaths].every(path => expected.has(path))
    return isValid ? { manifest, expected, baseLocalePaths } : undefined
  } catch {
    return undefined
  }
}

function isMarkdownArtifact(route: PrerenderRoute): boolean {
  return route.route.endsWith('.md') || route.fileName?.endsWith('.md') === true
}

function assertRegistered({
  prerenderedRoutes,
  expected
}: RegistrationOptions): void {
  const written = new Map(prerenderedRoutes.map(route => [route.route, route]))
  const missing = [...expected]
    .filter(([path]) => written.get(path)?.fileName !== path)
    .map(([, published]) => published)
  if (missing.length > 0) {
    throw new Error(`Static Markdown not generated: ${missing.join(', ')}`)
  }
  const extra = prerenderedRoutes
    .filter(route => isMarkdownArtifact(route) && !expected.has(route.route))
    .map(route => route.route)
  if (extra.length > 0) {
    throw new Error(`Static Markdown outside the list: ${extra.join(', ')}`)
  }
}

// O agregado só lê os `.md` aprovados que o índice editorial cita. O anúncio
// no llms.txt precisa coincidir com a existência do arquivo.
async function publishLlmsFull({
  inventory,
  llmsText,
  outputDir,
  publicDir
}: LlmsFullOptions): Promise<boolean> {
  const { manifest, expected, baseLocalePaths } = inventory
  const index = readLlmsIndex(llmsText)
  const { documents, omitted } = selectLlmsFullDocuments({
    links: index.links,
    siteUrl: manifest.siteUrl,
    inventory: new Set(expected.keys()),
    baseLocalePaths,
    ownPaths: new Set([LLMS_PATH, LLMS_FULL_PATH])
  })
  const fullUrl = new URL(LLMS_FULL_PATH, manifest.siteUrl).href
  const isAnnounced = index.links.some(({ href }) => href === fullUrl)
  if (isAnnounced !== documents.length > 0) {
    throw new Error(
      isAnnounced
        ? `llms.txt announces ${LLMS_FULL_PATH} without static Markdown pages`
        : `llms.txt does not announce ${LLMS_FULL_PATH} for its static Markdown pages`
    )
  }
  await writeLlmsFull({
    outputDir,
    publicDir,
    maxBytes: LLMS_FULL_MAX_BYTES,
    index: {
      title: index.title,
      description: index.description,
      url: new URL(LLMS_PATH, manifest.siteUrl).href
    },
    baseLocale: manifest.baseLocale,
    documents,
    omitted
  })
  return documents.length > 0
}

// O build pede ao middleware a lista de páginas estáticas e prerenderiza cada
// `.md` pela mesma conversão da requisição. Cada artefato é conferido pelo tipo
// e pelo arquivo realmente gravados, e o diretório publicado é confrontado com
// a lista e com os bytes aprovados. O llms.txt é lido sem ser gravado para
// montar o llms-full.txt. Uma falha em qualquer etapa interrompe o build.
export function markdownPrerender(nitro: PrerenderNitro): void {
  let queue: Set<string> | undefined
  let inventory: Inventory | undefined
  let llmsText: string | undefined
  let hasLlmsFull = false
  const approved = new Map<string, ArtifactDigest>()
  const routes = nitro.options.prerender.routes ?? []
  const isLlmsOwned = !routes.includes(LLMS_PATH)
  nitro.options.prerender.failOnError = true
  nitro.options.prerender.routes = [
    ...routes,
    MARKDOWN_PRERENDER_PATH,
    ...(isLlmsOwned ? [LLMS_PATH] : [])
  ]
  nitro.hooks.hook('prerender:routes', initial => {
    queue = initial
  })
  nitro.hooks.hook('prerender:generate', route => {
    if (route.route === MARKDOWN_PRERENDER_PATH) {
      route.skip = true
      if (route.error) return
      inventory = readInventory(route.contents)
      if (!queue || !inventory) {
        route.error = new Error('Invalid static Markdown list')
        return
      }
      const { mismatches, paths } = inventory.manifest
      if (mismatches.length > 0) {
        route.error = new Error(
          `Static Markdown pages resolve to another route: ${mismatches.join(', ')}`
        )
        return
      }
      for (const path of paths) queue.add(path)
      return
    }
    if (route.route === LLMS_PATH) {
      if (isLlmsOwned) route.skip = true
      if (!route.error) llmsText = route.contents
      return
    }
    if (!isMarkdownArtifact(route) || route.error) return
    const problem = inspectMarkdownArtifact(route)
    if (problem) {
      route.error = new Error(
        `Invalid static Markdown ${route.route}: ${problem}`
      )
      return
    }
    // Os bytes aprovados aqui são confrontados com o arquivo publicado.
    approved.set(route.route, digestBytes(readRouteBytes(route)))
  })
  // O Nitro só falha o build por rota com `error`. Uma exceção no fetch, na
  // gravação ou no hook de geração, ou uma rota ignorada, termina sem arquivo e
  // sem erro registrado.
  nitro.hooks.hook(
    'prerender:done',
    async ({ prerenderedRoutes, failedRoutes }) => {
      // Com `failOnError`, o Nitro interrompe o build em seguida e lista as rotas.
      if (failedRoutes.length > 0 && nitro.options.prerender.failOnError) return
      if (!inventory) {
        throw new Error('Static Markdown list was not prerendered')
      }
      const { expected } = inventory
      assertRegistered({ prerenderedRoutes, expected })
      const { dir: outputDir, publicDir } = nitro.options.output
      await assertStaticOutput({ publicDir, expected, approved })
      if (llmsText === undefined) {
        throw new Error('llms.txt was not prerendered')
      }
      hasLlmsFull = await publishLlmsFull({
        inventory,
        llmsText,
        outputDir,
        publicDir
      })
    }
  )
  nitro.hooks.hook('compiled', () =>
    writeVercelRoutes({
      outputDir: nitro.options.output.dir,
      paths: inventory?.manifest.paths ?? [],
      hasLlmsFull
    })
  )
}
