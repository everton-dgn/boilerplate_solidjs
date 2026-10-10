import { m } from '@/paraglide/messages.js'

type NavLink = {
  href: string
  label: string
}

export const BRAND_NAME = 'SolidJS Boilerplate'

export const NAV_LINKS: readonly NavLink[] = [
  {
    href: '/',
    get label() {
      return m.topbar_home()
    }
  },
  { href: '/404', label: '404' }
]
