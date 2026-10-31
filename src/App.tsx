import { getRequestEvent, isServer, type JSX } from '@solidjs/web'
import { Errored, onSettled, untrack, type ParentProps } from 'solid-js'

import { OutdatedPageNotice } from '@/components/atoms/OutdatedPageNotice/index.tsx'
import { Provider } from '@/components/atoms/Provider/index.tsx'
import { ErrorFallback } from '@/components/organisms/ErrorFallback/index.tsx'
import { createSeo } from '@/primitives/createSeo/index.ts'

import { Router } from './router.ts'
import { createLocaleNavigationGuard } from './router/createLocaleNavigationGuard/index.ts'
import {
  claimOutdatedPageReload,
  createOutdatedPageGuard,
  isVersionError
} from './router/outdatedPage/index.ts'

import './theme/globalStyles.css'

// O gate precisa lançar antes do Router para alcançar o Errored raiz.
function ServerFailureGate(props: ParentProps) {
  const failure = isServer ? getRequestEvent()?.locals.serverFailure : undefined
  if (failure) throw failure
  return <>{props.children}</>
}

// O router grava a URL do destino num onSettled sem owner, que pode ficar para
// o passe seguinte da fila; o setTimeout recarrega depois que ela esvazia.
function ReloadWhenSettled() {
  onSettled(() => {
    setTimeout(() => {
      globalThis.location.reload()
    }, 0)
  })
  return null
}

// Um chunk ou uma server function que o deploy novo não tem não é falha da
// página: o documento novo resolve, então a página de erro fica para a
// recarga que não resolveu.
function renderRootFallback(error: unknown): JSX.Element {
  if (!isServer && isVersionError(error) && claimOutdatedPageReload()) {
    return <ReloadWhenSettled />
  }
  return <ErrorFallback kind="runtime" />
}

export default function App() {
  // Os parâmetros em rest mantêm fallback.length em zero, condição para o
  // Errored do Solid reportar o erro no console em desenvolvimento. O erro é
  // lido sem rastrear: um erro posterior reconstruiria o fallback, e a trava já
  // gravada trocaria a recarga pendente pela página de erro.
  return (
    <Errored fallback={(...args) => renderRootFallback(untrack(args[0]))}>
      <ServerFailureGate>
        <Provider>
          {/* Dentro do Errored raiz: o fallback global desmonta o aviso. */}
          <OutdatedPageNotice />
          <Router>
            {props => {
              createLocaleNavigationGuard()
              createOutdatedPageGuard()
              createSeo({ route: true })
              return props.children
            }}
          </Router>
        </Provider>
      </ServerFailureGate>
    </Errored>
  )
}
