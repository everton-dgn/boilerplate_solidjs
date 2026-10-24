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
import {
  markRenderFailure,
  observeRenderFailures
} from '../renderIntegrity/index.ts'

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
  if (isControlSignal(error)) return undefined
  if (!isPublicError(error)) {
    // Com um hook instalado, o runtime deixa de imprimir o erro; em
    // desenvolvimento o log devolve o original ao terminal.
    logServerFailure({
      source: 'server-error',
      error,
      shouldPrintOriginal: isDevelopment
    })
  }
  // Em desenvolvimento o runtime envia o erro original, e o erro público
  // esconderia o diagnóstico.
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
  // Sinais de controle também marcam: um redirect() ou respond() lançado no
  // render e capturado por um <Errored> aninhado vira fallback com HTML 200.
  if (context.kind === 'render') markRenderFailure(context.event)
  return mapServerError(error)
}

configureServerErrors({ onError: handleServerError })
observeRenderFailures()
