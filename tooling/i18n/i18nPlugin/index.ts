import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { paraglideVitePlugin } from '@inlang/paraglide-js'
import type { Plugin, PluginOption, ViteDevServer } from 'vite-plus'

import { prepareMessages } from '../prepareMessages/index.ts'
import { isCatalogFile } from '../readCatalogs/index.ts'

type ReportErrorOptions = { server: ViteDevServer; error: Error }
type SettingsFileOptions = { root: string; file: string }

const PROJECT = './project.inlang'
const SETTINGS_FILE = 'project.inlang/settings.json'
const PREPARATION_DELAY_MS = 100

function reportError({ server, error }: ReportErrorOptions): void {
  server.ws.send({
    type: 'error',
    err: { message: error.message, stack: error.stack ?? '' }
  })
}

function isSettingsFile({ root, file }: SettingsFileOptions): boolean {
  const relative = path.relative(root, file).split(path.sep).join('/')
  return relative === SETTINGS_FILE
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function catalogPreparation(): Plugin {
  let root = process.cwd()
  let server: ViteDevServer | undefined
  let failure: Error | undefined
  let pendingPreparation: Promise<void> | undefined
  let requested = 0
  let isRunning = false
  const prepare = async () => {
    try {
      await prepareMessages(root)
      if (!failure) return
      failure = undefined
      // Agregados restaurados ao conteúdo anterior não geram compilação nem
      // HMR, então só um reload remove o overlay do erro.
      server?.ws.send({ type: 'full-reload' })
    } catch (error) {
      failure = toError(error)
      if (server) reportError({ server, error: failure })
    }
  }
  const prepareRequested = async () => {
    isRunning = true
    try {
      let handled = 0
      while (handled < requested) {
        handled = requested
        await delay(PREPARATION_DELAY_MS)
        if (handled < requested) continue
        await prepare()
      }
    } finally {
      isRunning = false
    }
  }
  const schedule = () => {
    requested += 1
    if (!isRunning) pendingPreparation = prepareRequested()
    return pendingPreparation
  }
  return {
    name: 'project:i18n-catalogs',
    enforce: 'pre',
    async configResolved(config) {
      ;({ root } = config)
      await prepareMessages(root)
    },
    configureServer(devServer) {
      server = devServer
      // Um catálogo inválido não pode continuar sendo servido a partir da
      // última compilação boa, inclusive num reload completo do navegador.
      devServer.middlewares.use((_request, response, next) => {
        if (!failure) {
          next()
          return
        }
        const internalServerError = 500
        response.statusCode = internalServerError
        response.setHeader('Content-Type', 'text/plain; charset=utf-8')
        response.end(failure.message)
      })
    },
    // Agregados e saída ficam fora do filtro para não disparar outra preparação.
    watchChange: {
      // O plugin oficial também lê settings; precisa aguardar este evento.
      sequential: true,
      handler(file) {
        const shouldPrepare =
          isSettingsFile({ root, file }) || isCatalogFile({ root, file })
        return shouldPrepare ? schedule() : undefined
      }
    },
    closeServer() {
      return pendingPreparation
    }
  }
}

export function i18nPlugin(): PluginOption[] {
  return [
    catalogPreparation(),
    paraglideVitePlugin({ project: PROJECT, devErrorResponse: true })
  ]
}
