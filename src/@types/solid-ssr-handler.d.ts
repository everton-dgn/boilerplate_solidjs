import type { RequestEvent } from '@solidjs/web'

// O handler do @solidjs/vite-plugin repassa options.nonce ao createSSRResponse
// do runtime, que o grava no script do redirect depois do shell, mas os tipos
// publicados ainda não declaram a opção. Este overload acompanha o handler.
declare module 'virtual:solid-ssr-handler' {
  type HandleRequestNonceOptions = {
    nonce: string
    event: Partial<RequestEvent>
  }

  // oxlint-disable-next-line eslint/max-params -- O plugin define a assinatura (request, options).
  export function handleRequest(
    request: Request,
    options: HandleRequestNonceOptions
  ): Promise<Response>
}
