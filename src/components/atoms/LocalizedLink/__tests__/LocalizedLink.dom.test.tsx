import { createRouter, memoryHistory } from '@solidjs/router'
import { createSignal } from 'solid-js'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import { LocalizedLink } from '../index.tsx'

describe('localizedLink contracts', () => {
  it('works outside a Router and reacts to href and locale changes', async () => {
    const [href, setHref] = createSignal('/docs?q=1#section')
    const host = renderComponent(
      () => (
        <LocalizedLink href={href()} locale="en">
          Docs
        </LocalizedLink>
      ),
      { providers: false }
    )
    const anchor = host.querySelector('a')
    expect(anchor?.getAttribute('href')).toBe('/en/docs?q=1#section')
    expect(anchor?.target).toBe('_self')
    setHref('/es/next')
    await expect.poll(() => anchor?.getAttribute('href')).toBe('/en/next')
  })

  it('leaves same-locale links available for SPA navigation and preserves native attributes', () => {
    const click = vi.fn<(event: MouseEvent) => void>(event => {
      expect(event.defaultPrevented).toBe(false)
      event.preventDefault()
    })
    const host = renderComponent(
      () => (
        <LocalizedLink
          href="/docs"
          locale="pt"
          onClick={click}
          download="manual"
          target="_blank"
        >
          Docs
        </LocalizedLink>
      ),
      { providers: false }
    )
    const anchor = host.querySelector('a')
    assert(anchor)
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true
    })
    anchor.dispatchEvent(event)
    expect(click).toHaveBeenCalledOnce()
    expect(anchor.target).toBe('_blank')
    expect(anchor.download).toBe('manual')
  })

  it('opts endpoints out without guessing extensions and keeps fragments intact', () => {
    const host = renderComponent(
      () => (
        <>
          <LocalizedLink href="/api/report" localize={false}>
            Report
          </LocalizedLink>
          <LocalizedLink href="/guide.pdf">Page</LocalizedLink>
          <LocalizedLink href="#section">Section</LocalizedLink>
        </>
      ),
      { providers: false }
    )
    const anchors = host.querySelectorAll('a')
    expect(anchors[0]?.getAttribute('href')).toBe('/api/report')
    expect(anchors[0]?.target).toBe('_self')
    expect(anchors[1]?.getAttribute('href')).toBe('/pt/guide.pdf')
    expect(anchors[1]?.target).toBe('')
    expect(anchors[2]?.getAttribute('href')).toBe('#section')
  })

  it('resolves relative hrefs with Router location and accepts typed paths', async () => {
    const Router = createRouter({
      history: memoryHistory('/pt/docs/start'),
      routes: [
        {
          path: '/pt/docs/start',
          component: () => (
            <>
              <LocalizedLink href="../next?q=1#part" locale="es">
                Next
              </LocalizedLink>
              <LocalizedLink href={Router.paths}>Home</LocalizedLink>
            </>
          )
        }
      ]
    })
    const host = renderComponent(
      () => <Router>{props => props.children}</Router>,
      { providers: false }
    )
    await expect
      .poll(() => host.querySelector('a')?.getAttribute('href'))
      .toBe('/es/next?q=1#part')
    expect(host.querySelectorAll('a')[1]?.getAttribute('href')).toBe('/pt')
  })
})
