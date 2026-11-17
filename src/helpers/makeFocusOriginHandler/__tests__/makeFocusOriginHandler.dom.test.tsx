import { render } from '@solidjs/web'

import { makeFocusOriginHandler } from '../index.ts'

type RememberOrigin = (origin: HTMLElement | undefined) => void
type MountedRegion = { region: HTMLElement; inner: HTMLButtonElement }
type FocusMove = { target: HTMLElement; origin: EventTarget | null }

function mountRegion(remember: RememberOrigin): MountedRegion {
  const host = document.createElement('div')
  document.body.append(host)
  const dispose = render(
    () => (
      <section onFocusIn={makeFocusOriginHandler(remember)}>
        <button type="button">Inside</button>
      </section>
    ),
    host
  )
  onTestFinished(() => {
    dispose()
    host.remove()
  })
  const region = host.querySelector('section')
  const inner = host.querySelector('button')
  assert(region)
  assert(inner)
  return { region, inner }
}

function appendOutside<T extends Element>(element: T): T {
  document.body.append(element)
  onTestFinished(() => element.remove())
  return element
}

// Pins the origin without depending on how the environment fills relatedTarget.
function moveFocus({ target, origin }: FocusMove): void {
  target.dispatchEvent(
    new FocusEvent('focusin', { bubbles: true, relatedTarget: origin })
  )
}

describe('focus origin', () => {
  it('keeps the outside element that had the focus', () => {
    const remember = vi.fn<RememberOrigin>()
    const { inner } = mountRegion(remember)
    const origin = appendOutside(document.createElement('button'))
    moveFocus({ target: inner, origin })
    expect(remember).toHaveBeenCalledExactlyOnceWith(origin)
  })

  it('ignores the focus that moves inside the region itself', () => {
    const remember = vi.fn<RememberOrigin>()
    const { region, inner } = mountRegion(remember)
    moveFocus({ target: inner, origin: region })
    expect(remember).not.toHaveBeenCalled()
  })

  it.each([
    ['without an origin', () => null],
    [
      'with an origin outside the HTML',
      () =>
        appendOutside(
          document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        )
    ]
  ])('forgets the origin when the focus arrives %s', (_case, createOrigin) => {
    const remember = vi.fn<RememberOrigin>()
    const { inner } = mountRegion(remember)
    moveFocus({ target: inner, origin: createOrigin() })
    expect(remember).toHaveBeenCalledOnce()
    expect(remember.mock.lastCall?.[0]).toBeUndefined()
  })
})
