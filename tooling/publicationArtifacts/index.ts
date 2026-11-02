import type { PrerenderRoute } from 'nitro/types'
import * as v from 'valibot'

import {
  digestBytes,
  readRouteBytes
} from '../markdownPrerender/helpers/artifactDigest/index.ts'
import type { ArtifactDigest } from '../markdownPrerender/types.ts'
import {
  SITEMAP_ARTIFACT_VERSION,
  SITEMAP_IDENTITIES_MAX_BYTES,
  SITEMAP_INVENTORY_PATH
} from './constants.ts'
import { assertPublishedArtifacts } from './helpers/assertPublishedArtifacts/index.ts'
import { writeServerArtifacts } from './helpers/writeServerArtifacts/index.ts'
import type { PublishedOptions, SitemapInventory } from './types.ts'

type PublicationOptions = { buildId: string }
type InspectOptions = { route: PrerenderRoute; queue: Set<string> | undefined }
type ApproveOptions = { route: PrerenderRoute; maxBytes?: number }
type XmlProblemOptions = { route: PrerenderRoute; byteBudget: number }
type PublicationArtifacts = {
  inspect: (options: InspectOptions) => boolean
  approve: (options: ApproveOptions) => void
  assertPublished: (options: PublishedOptions) => Promise<void>
  writeServer: (serverDir: string) => Promise<void>
}

const SITEMAP_ROOT = '/sitemap.xml'
const XML_TYPE = 'application/xml'
const XML_START = '<?xml'
const encoder = new TextEncoder()
const CountSchema = v.pipe(v.number(), v.integer(), v.minValue(0))
const EntrySchema = v.object({
  path: v.string(),
  lastmod: v.optional(v.string())
})
const IdentityListSchema = v.object({
  urls: v.array(v.string()),
  entries: v.array(EntrySchema)
})
const InventorySchema = v.object({
  version: v.literal(SITEMAP_ARTIFACT_VERSION),
  buildId: v.pipe(v.string(), v.nonEmpty()),
  siteUrl: v.pipe(v.string(), v.url()),
  byteBudget: v.pipe(CountSchema, v.minValue(1)),
  pagePartCount: CountSchema,
  hasLegacySources: v.boolean(),
  hasPartitionSources: v.boolean(),
  identities: v.nullable(IdentityListSchema)
})

function partPath(index: number): string {
  return `/sitemaps/pages/${index}.xml`
}

function readInventory(
  contents: string | undefined
): SitemapInventory | undefined {
  try {
    const inventory = v.parse(InventorySchema, JSON.parse(contents ?? ''))
    return inventory.hasLegacySources === (inventory.identities !== null)
      ? inventory
      : undefined
  } catch {
    return undefined
  }
}

function findXmlProblem({
  route,
  byteBudget
}: XmlProblemOptions): string | undefined {
  const bytes = readRouteBytes(route)
  if (route.fileName !== route.route) return `written as ${route.fileName}`
  if (!route.contentType?.startsWith(XML_TYPE)) {
    return `content type ${route.contentType}`
  }
  if (bytes.byteLength > byteBudget) {
    return `${bytes.byteLength} bytes, above the ${byteBudget} byte budget`
  }
  return route.contents?.startsWith(XML_START)
    ? undefined
    : 'not an XML document'
}

// Acompanha o que o build publica além dos `.md`: partes do sitemap, a raiz
// quando ela não depende de nenhuma fonte, o llms.txt e a lista de Markdown. Só
// um artefato aprovado no prerender e reencontrado com os mesmos bytes no
// diretório público chega ao manifesto da função.
export function publicationArtifacts({
  buildId
}: PublicationOptions): PublicationArtifacts {
  const approved = new Map<string, ArtifactDigest>()
  const xmlPaths = new Set<string>()
  let inventory: SitemapInventory | undefined
  let identities: Uint8Array | undefined
  let isVerified = false

  function readSitemapInventory({ route, queue }: InspectOptions): void {
    route.skip = true
    if (route.error) return
    inventory = readInventory(route.contents)
    if (!queue || !inventory) {
      route.error = new Error('Invalid sitemap inventory')
      return
    }
    // O inventário responde com o valor gravado no SSR: a divergência aqui
    // reprova o build em vez de virar 503 em toda requisição de produção.
    if (inventory.buildId !== buildId) {
      route.error = new Error('Sitemap inventory belongs to another build')
      return
    }
    if (inventory.identities) {
      identities = encoder.encode(JSON.stringify(inventory.identities))
      if (identities.byteLength > SITEMAP_IDENTITIES_MAX_BYTES) {
        route.error = new Error(
          `Sitemap identities have ${identities.byteLength} bytes, above the ${SITEMAP_IDENTITIES_MAX_BYTES} byte budget`
        )
        return
      }
    }
    const { pagePartCount, hasLegacySources, hasPartitionSources } = inventory
    for (let index = 1; index <= pagePartCount; index += 1) {
      xmlPaths.add(partPath(index))
    }
    if (pagePartCount > 0 && !hasLegacySources && !hasPartitionSources) {
      xmlPaths.add(SITEMAP_ROOT)
    }
    for (const path of xmlPaths) queue.add(path)
  }

  function approveXml(options: XmlProblemOptions): void {
    const { route } = options
    if (route.error) return
    const problem = findXmlProblem(options)
    if (problem) {
      route.error = new Error(`Invalid sitemap ${route.route}: ${problem}`)
      return
    }
    approved.set(route.route, digestBytes(readRouteBytes(route)))
  }

  return {
    inspect(options) {
      const { route } = options
      if (route.route === SITEMAP_INVENTORY_PATH) {
        readSitemapInventory(options)
        return true
      }
      if (!inventory || !xmlPaths.has(route.route)) return false
      approveXml({ route, byteBudget: inventory.byteBudget })
      return true
    },
    approve({ route, maxBytes }) {
      const digest = digestBytes(readRouteBytes(route))
      if (maxBytes !== undefined && digest.size > maxBytes) {
        route.error = new Error(
          `${route.route} has ${digest.size} bytes, above the ${maxBytes} byte budget`
        )
        return
      }
      approved.set(route.route, digest)
    },
    async assertPublished(options) {
      if (!inventory) throw new Error('Sitemap inventory was not prerendered')
      await assertPublishedArtifacts({ ...options, xmlPaths, approved })
      isVerified = true
    },
    // O hook `compiled` também dispara na instância do prerender, sem artefatos.
    async writeServer(serverDir) {
      if (!inventory || !isVerified) return
      const partDigests = Array.from(
        { length: inventory.pagePartCount },
        (_, index) => {
          const digest = approved.get(partPath(index + 1))
          if (!digest) throw new Error(`Unverified sitemap part ${index + 1}`)
          return digest
        }
      )
      await writeServerArtifacts({
        serverDir,
        inventory,
        identities,
        partDigests
      })
    }
  }
}
