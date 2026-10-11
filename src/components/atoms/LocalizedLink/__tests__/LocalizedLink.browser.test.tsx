import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { LocalizedLink } from '../index.tsx'

describe('localized link in the browser', () => {
  it('renders outside the Router with a localized root href and document target', () => {
    const host = renderComponent(
      () => (
        <LocalizedLink href="/docs?q=1#part" locale="es">
          Docs
        </LocalizedLink>
      ),
      { providers: false }
    )
    const anchor = host.querySelector('a')
    expect(anchor?.getAttribute('href')).toBe('/es/docs?q=1#part')
    expect(anchor?.target).toBe('_self')
    expect(anchor?.textContent).toBe('Docs')
  })
})
