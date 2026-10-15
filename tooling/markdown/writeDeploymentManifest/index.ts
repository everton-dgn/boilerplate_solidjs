import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import * as v from 'valibot'

import { MARKDOWN_HEADERS } from '../constants.ts'
import type { MarkdownArtifact } from '../types.ts'

type WriteOptions = { output: string; artifacts: MarkdownArtifact[] }

const routeSchema = v.looseObject({
  src: v.optional(v.string()),
  dest: v.optional(v.string()),
  handle: v.optional(v.string()),
  continue: v.optional(v.boolean())
})
const configSchema = v.looseObject({ routes: v.array(routeSchema) })
const JSON_INDENT = 2
const INDEX_FILE = '/index.md'
const MISSING_INDEX = -1

type DeploymentRoute = v.InferOutput<typeof routeSchema>
type ServerFallback = { filesystem: number; destination: string }

function escapePattern(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)
}

function resolveServerFallback(routes: DeploymentRoute[]): ServerFallback {
  const filesystem = routes.findIndex(route => route.handle === 'filesystem')
  const phase = routes.slice(filesystem + 1)
  const boundary = phase.findIndex(route => route.handle !== undefined)
  const candidates = phase
    .slice(0, boundary === MISSING_INDEX ? phase.length : boundary)
    .filter(route => route.src === '/(.*)')
  const [fallback] = candidates
  const destination = fallback?.dest
  if (
    filesystem === MISSING_INDEX ||
    routes.filter(route => route.handle === 'filesystem').length !== 1 ||
    candidates.length !== 1 ||
    !destination?.startsWith('/') ||
    destination.startsWith('//') ||
    /[$?#]/u.test(destination) ||
    fallback?.continue === true ||
    ['has', 'missing', 'methods', 'status', 'check'].some(
      key => fallback?.[key] !== undefined
    )
  ) {
    throw new Error(
      'Markdown publication requires an unconditional Nitro server fallback'
    )
  }
  return { filesystem, destination }
}

export async function writeDeploymentManifest({
  output,
  artifacts
}: WriteOptions): Promise<void> {
  const file = path.join(output, 'config.json')
  const config = v.parse(configSchema, JSON.parse(await readFile(file, 'utf8')))
  const headers = artifacts.map(artifact => ({
    src: `^${escapePattern(artifact.href)}$`,
    headers: { ...MARKDOWN_HEADERS, 'content-language': artifact.locale },
    continue: true
  }))
  const directories = new Set(
    artifacts
      .filter(artifact => artifact.href.endsWith(INDEX_FILE))
      .map(artifact => artifact.href.slice(0, -INDEX_FILE.length))
  )
  if (directories.size > 0) {
    const { filesystem, destination } = resolveServerFallback(config.routes)
    // Vercel resolves any index.* as a directory index before reaching SSR.
    const rewrites = [...directories].map(directory => ({
      src: `^${escapePattern(directory)}/?$`,
      dest: destination
    }))
    config.routes.splice(filesystem, 0, ...rewrites)
  }
  config.routes = [...headers, ...config.routes]
  await writeFile(
    file,
    `${JSON.stringify(config, null, JSON_INDENT)}\n`,
    'utf8'
  )
  await writeFile(
    path.join(output, 'markdown.json'),
    JSON.stringify(
      artifacts.map(({ path: pagePath, href, locale }) => ({
        path: pagePath,
        href,
        locale
      }))
    ),
    'utf8'
  )
}
