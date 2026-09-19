import { Errored } from 'solid-js'

import { Provider } from '@/components/atoms/Provider/index.tsx'
import { Topbar } from '@/components/molecules/Topbar/index.tsx'
import { ErrorFallback } from '@/components/organisms/ErrorFallback/index.tsx'

import { Router } from './router.ts'

import './theme/globalStyles.css'

export default function App() {
  return (
    <Errored fallback={() => <ErrorFallback kind="runtime" />}>
      <Provider>
        <Router>
          {props => (
            <>
              <Topbar />
              {props.children}
            </>
          )}
        </Router>
      </Provider>
    </Errored>
  )
}
