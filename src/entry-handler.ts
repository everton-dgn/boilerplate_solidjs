import { handleRequest } from 'virtual:solid-ssr-handler'

import { createNonce } from './helpers/createNonce/index.ts'

// Entrada de produção no lugar do fetch padrão do @solidjs/vite-plugin, que
// chama handleRequest sem opções. O nonce nasce aqui, vai para locals, onde o
// middleware o lê para a CSP, e para handleRequest, que o grava no script do
// redirect decidido depois do shell. Em desenvolvimento o plugin chama o
// handler direto e esta entrada não roda; a CSP também não é enviada.
const handler = {
  fetch(request: Request): Promise<Response> {
    const nonce = createNonce()
    return handleRequest(request, { nonce, event: { locals: { nonce } } })
  }
}

export default handler
