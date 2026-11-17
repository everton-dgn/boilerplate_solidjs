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
    hasProviders: false
  })
}

describe('locale switcher', () => {
  it('includes the visible locale in the accessible name of the trigger', async () => {
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
