import path from 'node:path'

import type { Nitro } from 'nitro/types'
import { normalizePath, type Plugin, type ViteDevServer } from 'vite-plus'

import { generateMessages } from '../../i18n/generateMessages/index.ts'
import { isCatalogFile } from '../../i18n/readCatalogs/index.ts'
import { configureMarkdownPreview } from '../configureMarkdownPreview/index.ts'
import { MARKDOWN_HEADERS } from '../constants.ts'
import { loadArtifacts } from '../loadArtifacts/index.ts'
import { publishArtifacts } from '../publishArtifacts/index.ts'
import type { MarkdownArtifact } from '../types.ts'
import { writeDeploymentManifest } from '../writeDeploymentManifest/index.ts'

type MarkdownPluginOptions = { directory: string; shouldGenerate?: boolean }

const MANIFEST = 'virtual:markdown-manifest'

function serializeManifest(artifacts: MarkdownArtifact[]): string {
  const paths = Object.fromEntries(
    artifacts.map(artifact => [artifact.path, artifact.href])
  )
  const index = artifacts
    .filter(artifact => artifact.llms.shouldInclude)
    .map(artifact => ({
      path: artifact.href,
      title: artifact.title,
      description: artifact.description,
      section: artifact.llms.section,
      optional: artifact.llms.isOptional
    }))
  return `export const markdownPaths = ${JSON.stringify(paths)}; export const markdownIndex = ${JSON.stringify(index)};`
}

function reloadManifest(server: ViteDevServer): void {
  for (const environment of Object.values(server.environments)) {
    const manifest = environment.moduleGraph.getModuleById(`\0${MANIFEST}`)
    if (manifest) environment.moduleGraph.invalidateModule(manifest)
    if (environment.config.consumer === 'server') {
      environment.hot.send({ type: 'full-reload' })
    }
  }
  server.ws.send({ type: 'full-reload' })
}

export function markdownPlugin({
  directory,
  shouldGenerate = true
}: MarkdownPluginOptions): Plugin {
  let root = process.cwd()
  let mode: string | undefined
  let environment: Record<string, string | boolean> | undefined
  let nitro: Nitro | undefined
  let artifacts: MarkdownArtifact[] = []
  let dependencies = new Set<string>()
  let failure: Error | undefined
  let pending = Promise.resolve()
  const generate = async () => {
    await generateMessages(root)
    const result = await loadArtifacts({ root, directory, mode, environment })
    await publishArtifacts({ root, artifacts: result.artifacts })
    ;({ artifacts } = result)
    dependencies = new Set(
      result.dependencies.filter(
        file => !file.startsWith(path.join(root, 'paraglide/'))
      )
    )
  }
  return {
    name: 'project:markdown',
    enforce: 'pre',
    configResolved(config) {
      ;({ root } = config)
      ;({ mode, env: environment } = config)
    },
    nitro: {
      setup(instance) {
        nitro = instance
        instance.hooks.hook('compiled', () =>
          writeDeploymentManifest({
            output: instance.options.output.dir,
            artifacts
          })
        )
        instance.options.publicAssets.push({
          dir: path.join(instance.options.rootDir, '.markdown/public'),
          baseURL: '/',
          maxAge: 0,
          fallthrough: true
        })
      }
    },
    buildApp: {
      order: 'pre',
      async handler() {
        if (!shouldGenerate) return
        await generate()
        if (!nitro) {
          throw new Error('Markdown publication requires the Nitro plugin')
        }
      }
    },
    resolveId(id) {
      return id === MANIFEST ? `\0${MANIFEST}` : undefined
    },
    load(id) {
      if (
        normalizePath(id).startsWith(`${normalizePath(root)}/src/`) &&
        id.split('?')[0]?.endsWith('/markdown.ts')
      ) {
        throw new Error(
          'Markdown producers are build-only; import the shared public content instead'
        )
      }
      if (id !== `\0${MANIFEST}`) return null
      if (failure) throw failure
      return serializeManifest(artifacts)
    },
    async configureServer(server) {
      if (!shouldGenerate) return
      await generate()
      let requested = 0
      let isRunning = false
      const generateRequested = async () => {
        isRunning = true
        try {
          let handled = 0
          while (handled < requested) {
            handled = requested
            try {
              const previous = serializeManifest(artifacts)
              const shouldRecover = failure !== undefined
              await generate()
              failure = undefined
              server.watcher.add([...dependencies])
              if (shouldRecover || previous !== serializeManifest(artifacts)) {
                reloadManifest(server)
              }
            } catch (error) {
              failure =
                error instanceof Error ? error : new Error(String(error))
              server.ws.send({
                type: 'error',
                err: { message: failure.message, stack: failure.stack ?? '' }
              })
            }
          }
        } finally {
          isRunning = false
        }
      }
      const refresh = (file: string) => {
        if (
          !dependencies.has(file) &&
          !(
            file.startsWith(path.join(root, directory) + path.sep) &&
            /\.[jt]sx?$/u.test(file)
          ) &&
          !isCatalogFile({ root, file }) &&
          !file.startsWith(path.join(root, 'project.inlang/'))
        ) {
          return
        }
        requested += 1
        if (isRunning) return
        pending = generateRequested()
      }
      server.watcher.add([...dependencies, path.join(root, directory)])
      server.watcher
        .on('add', refresh)
        .on('change', refresh)
        .on('unlink', refresh)
      server.httpServer?.once('close', () => {
        server.watcher
          .off('add', refresh)
          .off('change', refresh)
          .off('unlink', refresh)
      })
      server.middlewares.use((request, response, next) => {
        if (failure) {
          response.statusCode = 500
          response.end(
            'Markdown generation failed; check the development server'
          )
          return
        }
        const { pathname } = new URL(request.url ?? '/', 'http://localhost')
        const artifact = artifacts.find(
          candidate => candidate.href === pathname
        )
        if (
          !artifact ||
          (request.method !== 'GET' && request.method !== 'HEAD')
        ) {
          next()
          return
        }
        for (const [name, value] of Object.entries(MARKDOWN_HEADERS)) {
          response.setHeader(name, value)
        }
        response.setHeader('content-language', artifact.locale)
        response.end(request.method === 'HEAD' ? undefined : artifact.body)
      })
    },
    configurePreviewServer(server) {
      return configureMarkdownPreview(server)
    },
    closeServer() {
      return pending
    }
  }
}
