import { getRequestEvent, isServer, type JSX } from '@solidjs/web'
import {
  createSignal,
  Errored,
  onSettled,
  Show,
  untrack,
  type ParentProps
} from 'solid-js'

import { OutdatedPageNotice } from '@/components/molecules/OutdatedPageNotice/index.tsx'
import { Provider } from '@/components/molecules/Provider/index.tsx'
import { ErrorFallback } from '@/components/organisms/ErrorFallback/index.tsx'
import { createSeo } from '@/primitives/createSeo/index.ts'

import { createLocaleNavigationGuard } from './primitives/createLocaleNavigationGuard/index.ts'
import {
  claimOutdatedPageReload,
  createOutdatedPageGuard,
  isVersionError
} from './primitives/createOutdatedPageGuard/index.ts'
import { Router } from './router.ts'

import './theme/globalStyles.css'

// O gate precisa lançar antes do Router para alcançar o Errored raiz.
function ServerFailureGate(props: ParentProps) {
  const failure = isServer ? getRequestEvent()?.locals.serverFailure : undefined
  if (failure) throw failure
  return <>{props.children}</>
}

// Um beforeunload da página pode cancelar a recarga, e o primeiro SSR depois
// do deploy pode pegar o servidor a frio. Passado o prazo, a página de erro
// substitui a tela vazia.
const RELOAD_STALL_MS = 10_000

// O router grava a URL do destino num onSettled sem owner, que pode ficar para
// o passe seguinte da fila; o setTimeout recarrega depois que ela esvazia.
function ReloadWhenSettled() {
  const [isStalled, setIsStalled] = createSignal(false)
  onSettled(() => {
    setTimeout(() => {
      globalThis.location.reload()
    }, 0)
    const stall = setTimeout(() => {
      setIsStalled(true)
    }, RELOAD_STALL_MS)
    return () => {
      clearTimeout(stall)
    }
  })
  return (
    <Show when={isStalled()}>
      <ErrorFallback kind="runtime" />
    </Show>
  )
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
