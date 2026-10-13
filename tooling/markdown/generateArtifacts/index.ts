import { Buffer } from 'node:buffer'

import { createRouter, type RouteDefinition } from '@solidjs/router'
import { createAPIMatcher } from 'filesystem-routing/api'

import type { LlmsSelection } from '../../../src/@types/llms.ts'
import type {
  MarkdownBuildContext,
  MarkdownSource
} from '../../../src/@types/markdown.ts'
import { resolveRouteLlms } from '../../../src/routes/(seo)/llms.txt/helpers/resolveRouteLlms/index.ts'
import { MARKDOWN_LIMITS } from '../constants.ts'
import { renderMarkdown } from '../renderMarkdown/index.ts'
import type {
  GenerateArtifactsOptions,
  MarkdownArtifact,
  MarkdownRoute
} from '../types.ts'

type SelectedRoute = {
  id: string
  path: string
  source: string
  llms: LlmsSelection
  isDynamic: boolean
}
type RouteState = { path: string; isNoindex: boolean; llms: LlmsSelection }
type CollectOptions = {
  routes: MarkdownRoute[]
  parent: RouteState
  selected: SelectedRoute[]
  registeredPaths: string[]
}
type TimedOptions<T> = {
  run: (signal: AbortSignal) => T | Promise<T>
  label: string
}

const LAST_MATCH = -1

function collect({
  routes,
  parent,
  selected,
  registeredPaths
}: CollectOptions): void {
  for (const route of routes) {
    const path =
      `${parent.path}/${route.path}`
        .replaceAll(/\/+/gu, '/')
        .replace(/\/$/u, '') || '/'
    registeredPaths.push(path)
    const isNoindex = route.info?.seo?.noindex ?? parent.isNoindex
    const llms = resolveRouteLlms({
      parent: parent.llms,
      info: route.info?.llms
    })
    const publication = route.info?.markdown
    if (publication !== undefined && typeof publication !== 'boolean') {
      throw new Error(`Markdown publication must be a boolean: ${path}`)
    }
    if (publication === true) {
      if (isNoindex) {
        throw new Error(`Markdown publication conflicts with noindex: ${path}`)
      }
      if (route.children?.length) {
        throw new Error(`Declare Markdown on a leaf page: ${path}`)
      }
      if (!route.markdownSource) {
        throw new Error(`Missing colocated Markdown source: ${path}`)
      }
      selected.push({
        id: route.id,
        path,
        source: route.markdownSource,
        llms,
        isDynamic: /[:*]/u.test(path)
      })
    }
    collect({
      routes: route.children ?? [],
      parent: { path, isNoindex, llms },
      selected,
      registeredPaths
    })
  }
}

function matchingRoutes(routes: MarkdownRoute[]): RouteDefinition[] {
  return routes.map(route => ({
    path: route.path,
    matchFilters: route.matchFilters,
    info: { markdownRouteId: route.id },
    children: matchingRoutes(route.children ?? [])
  }))
}

function normalizePath(input: unknown): string {
  if (
    typeof input !== 'string' ||
    !input.startsWith('/') ||
    /[?#\\\s]/u.test(input) ||
    input.includes('//')
  ) {
    throw new Error(
      'Markdown paths must be absolute site paths without query, fragment or whitespace'
    )
  }
  const path = input.replace(/\/$/u, '') || '/'
  const url = new URL(path, 'https://markdown.invalid')
  const decoded = decodeURIComponent(path)
  if (
    url.pathname !== encodeURI(decodeURI(path)) ||
    /%2f|%5c/iu.test(path) ||
    /[\\%?#\s]/u.test(decoded) ||
    decoded.split('/').some(segment => segment === '.' || segment === '..')
  ) {
    throw new Error(`Non-canonical Markdown path: ${input}`)
  }
  return url.pathname
}

async function timed<T>({ run, label }: TimedOptions<T>): Promise<T> {
  const controller = new AbortController()
  const { promise: timeout, reject } = Promise.withResolvers<never>()
  const timer = setTimeout(() => {
    controller.abort()
    reject(new Error(`Markdown source timed out: ${label}`))
  }, MARKDOWN_LIMITS.sourceTimeoutMs)
  try {
    return await Promise.race([run(controller.signal), timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function sourcePaths(
  source: MarkdownSource,
  context: MarkdownBuildContext
): Promise<readonly string[]> {
  if (!source.getPaths) {
    throw new Error('Parameterized Markdown pages require getPaths')
  }
  const paths = await source.getPaths(context)
  if (!Array.isArray(paths) || paths.length > MARKDOWN_LIMITS.files) {
    throw new Error('Invalid or excessive Markdown path enumeration')
  }
  return paths.map((item: unknown) => normalizePath(item))
}

export async function generateArtifacts({
  routes,
  reservedPaths = [],
  locales,
  setLocale,
  localize,
  load
}: GenerateArtifactsOptions): Promise<MarkdownArtifact[]> {
  const selected: SelectedRoute[] = []
  const registeredPaths: string[] = []
  collect({
    routes,
    selected,
    registeredPaths,
    parent: { path: '', isNoindex: false, llms: resolveRouteLlms({}) }
  })
  const router = createRouter({ routes: matchingRoutes(routes) })
  const matchAPI = createAPIMatcher(
    reservedPaths.map(path => ({ path, $GET: { require: () => ({}) } }))
  )
  const artifacts: MarkdownArtifact[] = []
  const outputs = new Set<string>()
  let totalBytes = 0
  for (const locale of locales) {
    setLocale(locale)
    const reserved = new Set(
      [
        ...reservedPaths,
        ...registeredPaths
          .filter(path => !/[:*]/u.test(path))
          .map(path => normalizePath(localize(path)))
      ].map(path => path.toLowerCase())
    )
    for (const route of selected) {
      const { markdown } = await timed({
        label: route.source,
        run: () => load(route.source)
      })
      if (!markdown || typeof markdown.render !== 'function') {
        throw new Error(`Missing Markdown producer: ${route.source}`)
      }
      const paths = route.isDynamic
        ? await timed({
            label: route.path,
            run: signal => sourcePaths(markdown, { locale, signal })
          })
        : [route.path]
      for (const input of paths) {
        const path = normalizePath(input)
        if (
          router.match(`https://markdown.invalid${path}`).at(LAST_MATCH)?.info
            ?.markdownRouteId !== route.id
        ) {
          throw new Error(`Markdown path belongs to another page: ${path}`)
        }
        const localized = normalizePath(localize(path))
        const href =
          path === '/'
            ? `${localized === '/' ? '' : localized}/index.md`
            : `${localized}.md`
        if (reserved.has(href.toLowerCase()) || matchAPI(href, 'GET')) {
          throw new Error(`Markdown output conflicts with a route: ${href}`)
        }
        if (outputs.has(href.toLowerCase())) {
          throw new Error(`Duplicate Markdown output: ${href}`)
        }
        if (artifacts.length >= MARKDOWN_LIMITS.files) {
          throw new Error('Too many Markdown artifacts')
        }
        const page = await timed({
          label: path,
          run: signal => markdown.render({ path, locale, signal })
        })
        const body = renderMarkdown(page)
        const size = Buffer.byteLength(body)
        totalBytes += size
        if (
          size > MARKDOWN_LIMITS.pageBytes ||
          totalBytes > MARKDOWN_LIMITS.totalBytes
        ) {
          throw new Error('Markdown output exceeds the build size limit')
        }
        outputs.add(href.toLowerCase())
        artifacts.push({
          path: localized,
          href,
          locale,
          body,
          title: page.title,
          description: page.description,
          llms: route.llms
        })
      }
    }
  }
  return artifacts
}
