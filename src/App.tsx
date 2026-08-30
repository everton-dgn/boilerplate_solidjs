import { Router } from './router.ts'
import './style.css'

export default function App() {
  return (
    <Router>{props => <main class="layout">{props.children}</main>}</Router>
  )
}
