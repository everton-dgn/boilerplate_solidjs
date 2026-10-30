import '@solidjs/web'

type SsrRenderState = {
  readonly hasErrors: boolean | undefined
  readonly hasCompleted: boolean
}

declare module '@solidjs/web' {
  interface RequestEventLocals {
    ssrRenderState?: SsrRenderState
    // Base de página validada pelo middleware; ausente em RPC sem Referer seguro.
    localizedPageBase?: string
    serverFailure?: Error
  }
}
