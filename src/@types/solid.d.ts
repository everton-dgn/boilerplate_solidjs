import '@solidjs/web'

declare module '@solidjs/web' {
  interface RequestEventLocals {
    requestId?: string
    // Nonce CSP da requisição: no build nasce em src/entry-handler.ts; fora
    // dele, requestNonce o cria no middleware.
    nonce?: string
    // Erro público gravado por containFailures para renderizar a página de erro.
    serverFailure?: Error
  }
}
