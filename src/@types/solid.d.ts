import '@solidjs/web'

// oxlint-disable-next-line typescript/consistent-type-definitions -- Apenas RequestEventLocals exige declaration merging.
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
