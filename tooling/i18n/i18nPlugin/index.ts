import path from 'node:path'

import type { Plugin, ViteDevServer } from 'vite-plus'

import { generateMessages } from '../generateMessages/index.ts'
import { isCatalogFile } from '../readCatalogs/index.ts'

type ReportErrorOptions = { server: ViteDevServer; error: Error }

function reportError({ server, error }: ReportErrorOptions): void {
  server.ws.send({
    type: 'error',
    err: { message: error.message, stack: error.stack ?? '' }
  })
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function i18nPlugin(): Plugin {
  let root = process.cwd()
  let failure: Error | undefined
  return {
    name: 'project:i18n',
    enforce: 'pre',
    async configResolved(config) {
      ;({ root } = config)
      await generateMessages(root)
    },
    configureServer(server) {
      let requested = 0
      let running = false
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
      // Eventos que chegam durante uma geração viram uma única rodada extra.
      const regenerate = async () => {
        requested += 1
        if (running) return
        running = true
        let handled = 0
        while (handled < requested) {
          handled = requested
          await generate()
        }
        running = false
      }
      // Agregados em .paraglide/ e a saída em src/paraglide/ são escritos pela
      // própria geração e não a disparam de novo.
      const update = (file: string) => {
        if (isCatalogFile({ root, file })) void regenerate()
      }
      server.watcher.add(path.join(root, 'src'))
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
      server.httpServer?.once('close', () => {
        server.watcher
          .off('add', update)
          .off('change', update)
          .off('unlink', update)
      })
    }
  }
}
