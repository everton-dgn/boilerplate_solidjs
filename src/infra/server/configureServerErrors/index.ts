import 'server-only'
import { configureServerErrors, isResponseEnvelope } from '@solidjs/web'
import { configureServerFunctionsServer } from '@solidjs/web/server-functions/server'
import { NotReadyError } from 'solid-js'

import { isControlResponse } from '../isControlResponse/index.ts'
import { logServerFailure } from '../logServerFailure/index.ts'
import { protectServerOperation } from '../protectServerOperation/index.ts'
import { createPublicError, isPublicError } from '../publicErrors/index.ts'

configureServerFunctionsServer({
  wrapInvocation: run => protectServerOperation({ run, allowControl: true })
})

function isControlSignal(value: unknown): boolean {
  try {
    return (
      isControlResponse(value) ||
      value instanceof NotReadyError ||
      isResponseEnvelope(value)
    )
  } catch {
    // A inspeção de um objeto lançado também pode falhar (getter ou Proxy).
    return false
  }
}

// O runtime já troca erros lançados pela mensagem genérica em produção. O hook
// só uniformiza a mensagem pública e registra o log filtrado, inclusive em
// falhas de render e rejeições fora de server functions. Ele roda de forma
// síncrona, seu retorno vai ao cliente sem nova sanitização e um lançamento
// aqui faria o runtime registrar o erro do hook.
function mapServerError(error: unknown): Error | undefined {
  if (isControlSignal(error)) return undefined
  if (!isPublicError(error)) {
    logServerFailure({ source: 'server-error', error })
  }
  // Descarta também campos adicionados a um erro público depois da criação.
  return createPublicError()
}

// Em desenvolvimento o runtime envia o erro original, e o hook esconderia o
// diagnóstico; ele vale só para os builds de produção.
if (!import.meta.env.DEV) configureServerErrors({ onError: mapServerError })
