import { render } from '@solidjs/web'
import { afterEach, expect, it } from 'vite-plus/test'

import Home from './index.tsx'

let dispose: (() => void) | undefined
let host: HTMLDivElement | undefined

afterEach(() => {
  dispose?.()
  host?.remove()
  dispose = undefined
  host = undefined
})

it('incrementa o contador', async () => {
  host = document.createElement('div')
  document.body.append(host)
  dispose = render(() => <Home />, host)

  const button = host.querySelector('button.counter')

  if (!(button instanceof HTMLButtonElement)) {
    throw new TypeError('Counter button not found')
  }

  button.click()

  await expect.poll(() => button.textContent).toBe('Count is 1')
})
