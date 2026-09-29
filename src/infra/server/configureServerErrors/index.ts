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
// só uniformiza a mensagem pública e registra um log fixo, inclusive em falhas
// de render e rejeições fora de server functions. Ele roda de forma síncrona,
// seu retorno vai ao cliente sem nova sanitização e um lançamento aqui faria o
// runtime registrar o erro do hook.
function mapServerError(error: unknown): Error | undefined {
  try {
    // Sinais de controle seguem a política padrão do runtime.
    if (isControlSignal(error)) return undefined
    if (!isPublicError(error)) logServerFailure('server-error')
    // Sempre um erro novo, mesmo para um público, para descartar campos
    // adicionados depois da criação.
    return createPublicError()
  } catch {
    // O log é uma tentativa: se o destino continuar falhando, o hook ainda
    // devolve o erro público em vez de lançar.
    try {
      logServerFailure('server-error')
    } catch {
      // Sem destino de log disponível.
    }
    return createPublicError()
  }
}

// Em desenvolvimento o runtime envia o erro original, e o hook esconderia o
// diagnóstico; ele vale só para os builds de produção.
if (!import.meta.env.DEV) configureServerErrors({ onError: mapServerError })
