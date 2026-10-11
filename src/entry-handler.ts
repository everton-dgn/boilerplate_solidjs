import { handleRequest } from 'virtual:solid-ssr-handler'

import { createNonce } from './helpers/createNonce/index.ts'

// A entrada gerada omite o nonce no redirect decidido depois do shell.
const handler = {
  fetch(request: Request): Promise<Response> {
    const nonce = createNonce()
    return handleRequest(request, { nonce, event: { locals: { nonce } } })
  }
}

export default handler
