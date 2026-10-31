import { render } from '@solidjs/web'

import { createFocusOriginHandler } from '../index.ts'

type RememberOrigin = (origin: HTMLElement | undefined) => void
type MountedRegion = { region: HTMLElement; inner: HTMLButtonElement }
type FocusMove = { target: HTMLElement; origin: EventTarget | null }

function mountRegion(remember: RememberOrigin): MountedRegion {
  const host = document.createElement('div')
  document.body.append(host)
  const dispose = render(
    () => (
      <section onFocusIn={createFocusOriginHandler(remember)}>
        <button type="button">Dentro</button>
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

// Fixa a origem sem depender de como o ambiente preenche relatedTarget.
function moveFocus({ target, origin }: FocusMove): void {
  target.dispatchEvent(
    new FocusEvent('focusin', { bubbles: true, relatedTarget: origin })
  )
}

describe('origem do foco', () => {
  it('guarda o elemento de fora que tinha o foco', () => {
    const remember = vi.fn<RememberOrigin>()
    const { inner } = mountRegion(remember)
    const origin = appendOutside(document.createElement('button'))
    moveFocus({ target: inner, origin })
    expect(remember).toHaveBeenCalledExactlyOnceWith(origin)
  })

  it('ignora o foco que se move dentro da própria região', () => {
    const remember = vi.fn<RememberOrigin>()
    const { region, inner } = mountRegion(remember)
    moveFocus({ target: inner, origin: region })
    expect(remember).not.toHaveBeenCalled()
  })

  it.each([
    ['sem origem', () => null],
    [
      'com uma origem fora do HTML',
      () =>
        appendOutside(
          document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        )
    ]
  ])('esquece a origem quando o foco chega %s', (_case, createOrigin) => {
    const remember = vi.fn<RememberOrigin>()
    const { inner } = mountRegion(remember)
    moveFocus({ target: inner, origin: createOrigin() })
    expect(remember).toHaveBeenCalledOnce()
    expect(remember.mock.lastCall?.[0]).toBeUndefined()
  })
})
