import { Provider } from '@/components/atoms/Provider/index.tsx'
import { Nav } from '@/components/molecules/Nav/index.tsx'

import { Router } from './router.ts'

import './style.css'

export default function App() {
  return (
    <Provider>
      <Router>
        {props => (
          <main class="layout">
            <Nav />
            {props.children}
          </main>
        )}
      </Router>
    </Provider>
  )
}
