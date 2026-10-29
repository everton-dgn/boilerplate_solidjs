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
  it('inclui o idioma visível no nome acessível do gatilho', async () => {
    mountSwitcher()
    const trigger = page.getByRole('button', { name: /select language/u })
    await expect.element(trigger).toHaveTextContent('EN')
    await expect.element(trigger).toHaveAccessibleName('EN, select language')
    await trigger.click()
    await expect
      .element(page.getByRole('menuitemradio', { name: 'English' }))
      .toHaveAttribute('aria-checked', 'true')
  })
})
