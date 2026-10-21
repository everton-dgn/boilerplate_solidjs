import 'server-only'
import {
  configureServerErrors,
  isResponseEnvelope,
  type ServerErrorContext
} from '@solidjs/web'
import { configureServerFunctionsServer } from '@solidjs/web/server-functions/server'
import { NotReadyError } from 'solid-js'

import { isControlResponse } from '../isControlResponse/index.ts'
import { logServerFailure } from '../logServerFailure/index.ts'
import { protectServerOperation } from '../protectServerOperation/index.ts'
import { createPublicError, isPublicError } from '../publicErrors/index.ts'

const isDevelopment = import.meta.env.DEV

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
  if (!isPublicError(error)) {
    logServerFailure({ source: 'server-error', error })
  }
  // Em desenvolvimento o runtime envia o erro original, e o erro público
  // esconderia o diagnóstico. O log acima substitui o que o runtime deixa de
  // imprimir quando há um hook instalado.
  if (isDevelopment) return undefined
  // Descarta também campos adicionados a um erro público depois da criação.
  return createPublicError()
}

// O Markdown só publica um render sem falhas, e desde o solidjs/solid#4130 o
// hook é a fonte desse sinal; por isso ele vale também em desenvolvimento.
function handleServerError(
  error: unknown,
  context: ServerErrorContext
): Error | undefined {
  // Marcar um redirect ou respond() lançado no render faria o Markdown
  // recusá-lo como falha.
  if (isControlSignal(error)) return undefined
  const state = context.event?.locals.ssrRenderState
  if (context.kind === 'render' && state) state.hasErrors = true
  return mapServerError(error)
}

configureServerErrors({ onError: handleServerError })
