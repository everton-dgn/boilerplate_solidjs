import { getRequestEvent, isServer, type JSX } from '@solidjs/web'
import { Errored, onSettled, type ParentProps } from 'solid-js'

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

// O router grava a URL do destino quando a navegação recusada assenta.
function ReloadWhenSettled() {
  onSettled(() => {
    globalThis.location.reload()
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
  // Errored do Solid reportar o erro no console em desenvolvimento.
  return (
    <Errored fallback={(...args) => renderRootFallback(args[0]())}>
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
