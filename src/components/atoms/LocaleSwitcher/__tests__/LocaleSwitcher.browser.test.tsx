import { createRouter, memoryHistory } from '@solidjs/router'
import { page } from 'vite-plus/test/browser/context'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import '@/theme/globalStyles.css'

import { LocaleSwitcher } from '../index.tsx'

function mountSwitcher() {
  const Router = createRouter({
    history: memoryHistory('/en'),
    routes: [{ path: '*all', component: LocaleSwitcher }]
  })
  return renderComponent(() => <Router>{props => props.children}</Router>, {
    providers: false
  })
}

describe('seletor de idioma', () => {
  afterEach(() => {
    document.documentElement.toggleAttribute('data-js', false)
  })

  it('inclui o idioma visível no nome acessível do gatilho', async () => {
    document.documentElement.toggleAttribute('data-js', true)
    mountSwitcher()
    const trigger = page.getByRole('button', { name: /select language/u })
    await expect.element(trigger).toHaveTextContent('EN')
    await expect.element(trigger).toHaveAccessibleName('EN, select language')
    await trigger.click()
    await expect
      .element(page.getByRole('menuitemradio', { name: 'English' }))
      .toHaveAttribute('aria-checked', 'true')
  })

  it('oculta o gatilho quando o documento não tem JavaScript', async () => {
    const host = mountSwitcher()
    await expect.poll(() => host.querySelector('button')).not.toBeNull()
    const trigger = host.querySelector('button')
    assert(trigger)
    await expect.element(trigger).not.toBeVisible()
    document.documentElement.toggleAttribute('data-js', true)
    await expect.element(trigger).toBeVisible()
  })
})
