import path from 'node:path'

import type { Plugin, ViteDevServer } from 'vite-plus'

import { generateMessages } from '../generateMessages/index.ts'
import { isCatalogFile } from '../readCatalogs/index.ts'

type ReportErrorOptions = { server: ViteDevServer; error: Error }
type SettingsFileOptions = { root: string; file: string }

const SETTINGS_FILE = 'project.inlang/settings.json'
const COMPILER_CONFIG = 'project.inlang/paraglide.config.ts'
// O Chokidar do Vite descarta, sem reemitir depois, os `change` do mesmo
// arquivo nos 50 ms seguintes a um evento. Uma gravação concluída nessa
// janela não chega ao plugin, que ficaria com o conteúdo truncado.
const WATCHER_THROTTLE_MS = 50

function reportError({ server, error }: ReportErrorOptions): void {
  server.ws.send({
    type: 'error',
    err: { message: error.message, stack: error.stack ?? '' }
  })
}

function isSettingsFile({ root, file }: SettingsFileOptions): boolean {
  const relative = path.relative(root, file).split(path.sep).join('/')
  return relative === SETTINGS_FILE || relative === COMPILER_CONFIG
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function i18nPlugin(): Plugin {
  let root = process.cwd()
  let failure: Error | undefined
  let pendingGeneration: Promise<void> | undefined
  let stopWatching: (() => void) | undefined
  return {
    name: 'project:i18n',
    enforce: 'pre',
    async configResolved(config) {
      ;({ root } = config)
      await generateMessages(root)
    },
    configureServer(server) {
      let requested = 0
      let isRunning = false
      const generate = async () => {
        try {
          const recovering = failure !== undefined
          const { changed } = await generateMessages(root)
          failure = undefined
          // Sem mudança na saída, só a recuperação de uma falha recarrega.
          if (changed || recovering) server.ws.send({ type: 'full-reload' })
        } catch (error) {
          failure = toError(error)
          reportError({ server, error: failure })
        }
      }
      const generateRequested = async () => {
        isRunning = true
        try {
          let handled = 0
          while (handled < requested) {
            handled = requested
            await generate()
          }
        } finally {
          isRunning = false
        }
      }
      // Eventos que chegam durante uma geração viram uma única rodada extra.
      const regenerate = () => {
        requested += 1
        if (isRunning) return
        pendingGeneration = generateRequested()
      }
      let settleTimer: ReturnType<typeof setTimeout> | undefined
      // Agendado após o throttle, relê o arquivo quando a mesma janela termina.
      const settle = () => {
        clearTimeout(settleTimer)
        settleTimer = setTimeout(() => {
          settleTimer = undefined
          regenerate()
        }, WATCHER_THROTTLE_MS)
      }
      // Configurações e catálogos usam a mesma fila; os diretórios gerados
      // ficam fora do filtro para não disparar a própria geração.
      const update = (file: string) => {
        if (isSettingsFile({ root, file }) || isCatalogFile({ root, file })) {
          regenerate()
          settle()
        }
      }
      server.watcher.add([
        path.join(root, 'src'),
        path.join(root, SETTINGS_FILE),
        path.join(root, COMPILER_CONFIG)
      ])
      server.watcher.on('add', update).on('change', update).on('unlink', update)
      // Uma tradução inválida não pode continuar sendo servida a partir da
      // última compilação boa, inclusive num reload completo do navegador.
      server.middlewares.use((_request, response, next) => {
        if (!failure) {
          next()
          return
        }
        const internalServerError = 500
        response.statusCode = internalServerError
        response.setHeader('Content-Type', 'text/plain; charset=utf-8')
        response.end(failure.message)
      })
      // Drena a gravação que o watcher pode ter suprimido antes de fechar.
      stopWatching = () => {
        if (settleTimer) {
          clearTimeout(settleTimer)
          settleTimer = undefined
          regenerate()
        }
        server.watcher
          .off('add', update)
          .off('change', update)
          .off('unlink', update)
      }
      server.httpServer?.once('close', stopWatching)
    },
    closeServer() {
      stopWatching?.()
      return pendingGeneration
    }
  }
}
