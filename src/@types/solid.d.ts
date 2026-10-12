import '@solidjs/web'

declare module '@solidjs/web' {
  interface RequestEventLocals {
    requestId?: string
    // Base de página validada pelo middleware; ausente em RPC sem Referer seguro.
    localizedPageBase?: string
    serverFailure?: Error
  }
}
