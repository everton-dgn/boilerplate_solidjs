import {
  configureServerFunctionsClient,
  UNKNOWN_HEADER
} from '@solidjs/web/server-functions/client'
import { configureClientErrors, getObserver } from 'solid-js'

import { HTTP_CONFLICT, HTTP_NOT_FOUND } from '@/constants/http.ts'
import {
  OUTDATED_FALLBACK_EVENT,
  REFUSED_SUBMIT_EVENT
} from '@/constants/outdated-page.ts'
import {
  isVersionError,
  markPageOutdated,
  recordChunkFailure
} from '@/primitives/createOutdatedPageGuard/index.ts'

function isDeclaredRead(meta: unknown): boolean {
  return (
    typeof meta === 'object' &&
    meta !== null &&
    'method' in meta &&
    meta.method === 'GET'
  )
}

function isVersionRefusal(response: Response): boolean {
  return (
    (response.status === HTTP_NOT_FOUND || response.status === HTTP_CONFLICT) &&
    response.headers.has(UNKNOWN_HEADER)
  )
}

// Sem preventDefault: cancelar o evento faria o import resolver undefined e o
// lazy da rota guardaria esse módulo vazio até a recarga.
function handlePreloadError(event: Event): void {
  recordChunkFailure('payload' in event ? event.payload : undefined)
}

// O evento sai depois do passe do boundary, fora da escrita que mostrou o
// fallback.
function announceOutdatedFallback(error: unknown): void {
  if (!isVersionError(error)) return
  queueMicrotask(() => {
    globalThis.dispatchEvent(new Event(OUTDATED_FALLBACK_EVENT))
  })
}

export function installOutdatedPageDetection(): () => void {
  globalThis.addEventListener('vite:preloadError', handlePreloadError)
  // O runtime chama o hook uma vez por erro, para todo boundary que mostra
  // fallback. A vaga é única, e um onError passado a render ou hydrate tem
  // precedência: um monitor de erros precisa ser composto aqui.
  configureClientErrors({ onError: announceOutdatedFallback })
  // O runtime guarda um único responseHandler; server components ocupariam a
  // mesma vaga (docs/server-errors.md#página-desatualizada-após-um-deploy).
  configureServerFunctionsClient({
    responseHandler: {
      // Leituras do render (computação rastreada) e as declaradas com GET,
      // como query(), GET() e live(), inclusive em preloads, rejeitam até um
      // Errored, que recarrega na raiz e avisa num limite local.
      capture: ({ meta }) => getObserver() === null && !isDeclaredRead(meta),
      // Qualquer valor devolvido resolveria a chamada; sem ele o runtime
      // rejeita com unknownFunction e o chamador mantém o próprio tratamento.
      handle(response, { context }): void {
        if (!isVersionRefusal(response)) return
        markPageOutdated()
        if (context === true) {
          globalThis.dispatchEvent(new Event(REFUSED_SUBMIT_EVENT))
        }
      }
    }
  })
  return () => {
    globalThis.removeEventListener('vite:preloadError', handlePreloadError)
    configureClientErrors({})
    configureServerFunctionsClient({
      responseHandler: {
        handle(): void {
          // O runtime não aceita null aqui; sem retorno, o transporte volta
          // ao comportamento padrão.
        }
      }
    })
  }
}
