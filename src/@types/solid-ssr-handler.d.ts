import type { RequestEvent } from '@solidjs/web'

// O runtime aceita options.nonce, mas os tipos publicados ainda omitem a opção.
declare module 'virtual:solid-ssr-handler' {
  type HandleRequestNonceOptions = {
    nonce: string
    event: Partial<RequestEvent>
  }

  export function handleRequest(
    request: Request,
    options: HandleRequestNonceOptions
  ): Promise<Response>
}
