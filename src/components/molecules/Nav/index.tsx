import { paths } from '@/router.ts'

export function Nav() {
  return (
    <nav class="site-nav" aria-label="Navegação principal">
      <a href={paths}>Início</a>
      <a href={paths('404')}>Página de erro</a>
    </nav>
  )
}
