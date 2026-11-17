import '@solidjs/web'

type SsrRenderState = {
  readonly hasErrors: boolean | undefined
  readonly hasCompleted: boolean
}

declare module '@solidjs/web' {
  interface RequestEventLocals {
    ssrRenderState?: SsrRenderState
    // Page base validated by the middleware; missing in RPC without a safe Referer.
    localizedPageBase?: string
    serverFailure?: Error
  }
}
