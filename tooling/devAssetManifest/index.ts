import type { Plugin } from 'vite-plus'

export function devAssetManifest(): Plugin {
  let listening: Promise<void> | undefined

  return {
    name: 'project:dev-asset-manifest',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      const http = server.httpServer
      if (!http || http.listening) {
        listening = undefined
        return
      }
      // oxlint-disable-next-line promise/avoid-new -- events.once rejeita em EADDRINUSE antes de o Vite tentar outra porta.
      listening = new Promise(resolve => {
        const finish = () => {
          http.off('listening', finish)
          http.off('close', finish)
          resolve()
        }
        // O Vite trata EADDRINUSE tentando outra porta antes de emitir listening.
        http.once('listening', finish)
        http.once('close', finish)
        // Antes do primeiro listen, server.close não fecha o servidor HTTP.
        const close = server.close.bind(server)
        server.close = () => {
          finish()
          return close()
        }
      })
    },
    async load(id) {
      if (id !== '\0virtual:solid-manifest') return
      // O Nitro importa o manifest antes do listen. O Solid precisa da porta
      // real para gerar a URL da ponte de CSS usada pelo worker isolado.
      await listening
    }
  }
}
