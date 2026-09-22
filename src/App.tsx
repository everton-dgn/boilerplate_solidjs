import { Errored } from 'solid-js'

import { Provider } from '@/components/atoms/Provider/index.tsx'
import { ErrorFallback } from '@/components/organisms/ErrorFallback/index.tsx'
import { createSeo } from '@/primitives/createSeo/index.ts'

import { Router } from './router.ts'

import './theme/globalStyles.css'

export default function App() {
  return (
    <Errored fallback={() => <ErrorFallback kind="runtime" />}>
      <Provider>
        <Router>
          {props => {
            createSeo({ route: true })
            return props.children
          }}
        </Router>
      </Provider>
    </Errored>
  )
}
