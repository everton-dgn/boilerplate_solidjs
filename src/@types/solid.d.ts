import '@solidjs/web'

declare module '@solidjs/web' {
  interface RequestEventLocals {
    requestId?: string
  }
}
