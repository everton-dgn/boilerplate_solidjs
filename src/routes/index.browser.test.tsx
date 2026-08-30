import { render } from '@solidjs/web'
import { afterEach, expect, it } from 'vite-plus/test'
import { page, userEvent } from 'vite-plus/test/browser/context'

import Home from './index.tsx'

let dispose: (() => void) | undefined
let host: HTMLDivElement | undefined

afterEach(() => {
  dispose?.()
  host?.remove()
  dispose = undefined
  host = undefined
})

it('incrementa o contador no Chromium', async () => {
  host = document.createElement('div')
  document.body.append(host)
  dispose = render(() => <Home />, host)

  await userEvent.click(page.getByRole('button', { name: 'Count is 0' }))

  await expect
    .element(page.getByRole('button', { name: 'Count is 1' }))
    .toBeVisible()
})
