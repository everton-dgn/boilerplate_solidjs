import '@solidjs/web'

declare module '@solidjs/web' {
  interface RequestEventLocals {
    requestId?: string
    // Erro público gravado por containFailures para renderizar a página de erro.
    serverFailure?: Error
  }
}
