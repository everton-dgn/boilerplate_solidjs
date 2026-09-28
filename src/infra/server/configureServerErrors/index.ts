import 'server-only'
import { configureServerErrors, isResponseEnvelope } from '@solidjs/web'
import { configureServerFunctionsServer } from '@solidjs/web/server-functions/server'
import { NotReadyError } from 'solid-js'

import { logServerFailure } from '../logServerFailure/index.ts'
import { protectServerOperation } from '../protectServerOperation/index.ts'
import { createPublicError, isPublicError } from '../publicErrors/index.ts'

configureServerFunctionsServer({
  wrapInvocation: run => protectServerOperation({ run, allowControl: true })
})

function isControlSignal(value: unknown): boolean {
  try {
    // Como no wrapper e no middleware, só uma Response sem corpo é controle.
    return (
      (value instanceof Response && value.body === null) ||
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
    // Se o próprio log falhar de novo, o runtime registra o erro do hook, que
    // não carrega o erro original.
    logServerFailure('server-error')
    return createPublicError()
  }
}

// Em desenvolvimento o runtime envia o erro original, e o hook esconderia o
// diagnóstico; ele vale só para os builds de produção.
if (!import.meta.env.DEV) configureServerErrors({ onError: mapServerError })
