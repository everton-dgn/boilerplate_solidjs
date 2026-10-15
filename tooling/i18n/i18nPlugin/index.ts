import path from 'node:path'

import { paraglideVitePlugin } from '@inlang/paraglide-js'
import type { Plugin, PluginOption, ViteDevServer } from 'vite-plus'

import { prepareMessages } from '../prepareMessages/index.ts'
import { isCatalogFile } from '../readCatalogs/index.ts'

type ReportErrorOptions = { server: ViteDevServer; error: Error }
type SettingsFileOptions = { root: string; file: string }

const PROJECT = './project.inlang'
const SETTINGS_FILE = 'project.inlang/settings.json'
// O watcher só avisa depois que o tamanho do arquivo para de mudar. Sem isso,
// uma gravação em partes seria lida pela metade e publicaria um erro
// passageiro. A espera vale para todos os arquivos observados pelo Vite.
const WRITE_STABILITY = { stabilityThreshold: 100, pollInterval: 10 }

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
    config(config) {
      // O merge do Vite trocaria `watch: null` pelo objeto e religaria o watcher.
      if (config.server?.watch === null) return null
      return { server: { watch: { awaitWriteFinish: WRITE_STABILITY } } }
    },
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
    async watchChange(file) {
      if (!isSettingsFile({ root, file }) && !isCatalogFile({ root, file })) {
        return
      }
      await schedule()
    },
    // O Vite fecha o watcher antes deste hook: uma gravação ainda na janela de
    // estabilidade fica para a preparação da próxima inicialização.
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
