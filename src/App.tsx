import { getRequestEvent, isServer } from '@solidjs/web'
import { Errored, type ParentProps } from 'solid-js'

import { Provider } from '@/components/atoms/Provider/index.tsx'
import { ErrorFallback } from '@/components/organisms/ErrorFallback/index.tsx'
import { createSeo } from '@/primitives/createSeo/index.ts'

import { Router } from './router.ts'
import { createLocaleNavigationGuard } from './router/createLocaleNavigationGuard/index.ts'

import './theme/globalStyles.css'

// O gate precisa lançar antes do Router para alcançar o Errored raiz.
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
              createLocaleNavigationGuard()
              createSeo({ route: true })
              return props.children
            }}
          </Router>
        </Provider>
      </ServerFailureGate>
    </Errored>
  )
}
