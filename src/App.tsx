import { getRequestEvent, isServer } from '@solidjs/web'
import { Errored, type ParentProps } from 'solid-js'

import { Provider } from '@/components/atoms/Provider/index.tsx'
import { ErrorFallback } from '@/components/organisms/ErrorFallback/index.tsx'
import { createSeo } from '@/primitives/createSeo/index.ts'

import { Router } from './router.ts'

import './theme/globalStyles.css'

// Quando containFailures renderiza a página de erro, o erro público gravado
// em locals é lançado aqui, antes do Router, e o Errored raiz mostra o
// fallback. No cliente o boundary hidrata a partir do erro serializado.
function ServerFailureGate(props: ParentProps) {
  const failure = isServer ? getRequestEvent()?.locals.serverFailure : undefined
  if (failure) throw failure
  return <>{props.children}</>
}

export default function App() {
  return (
    <Errored fallback={() => <ErrorFallback kind="runtime" />}>
      <ServerFailureGate>
        <Provider>
          <Router>
            {props => {
              createSeo({ route: true })
              return props.children
            }}
          </Router>
        </Provider>
      </ServerFailureGate>
    </Errored>
  )
}
