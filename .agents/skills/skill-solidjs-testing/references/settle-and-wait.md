# Assentamento e espera

O agendador publica escritas por `queueMicrotask(flush)`. Espere pelo observável certo, nunca por tempo fixo.

## Tabela de assentamento

| Situação | Como assentar |
| --- | --- |
| Depois de `render()` | nada: o DOM inicial já está pronto |
| `element.click()` ou setter fora de flush | `await Promise.resolve()` ou `flush()` |
| Leitura logo depois do setter | devolve o valor anterior até `flush()` |
| `createRoot` com memo e effect | o memo calcula na criação; o apply do effect só roda depois de `flush()` |
| Memo assíncrono sob owner | `await resolve(() => memo())` |
| Conteúdo sob `Loading`, rota nova | `vi.waitFor`, `expect.poll` ou, no browser mode, `expect.element` |
| `await userEvent.click()` no Chromium | nada: o DOM já está assentado no retorno |
| Dentro de action, `onSettled` ou apply de effect | não chame `flush()`: lança ou vira no-op com diagnóstico |

`flush()` não resolve rede nem Promise. Para ordem entre operações assíncronas, controle cada Promise com `Promise.withResolvers()`.

```tsx
// tests/settle.dom.test.tsx
import { expect, test, vi } from 'vitest'
import { Loading, createMemo, createRoot, createSignal, flush, resolve } from 'solid-js'

import { Counter } from '../fixtures/Counter.tsx'
import { mount } from '../support/mount.tsx'

test('o clique só publica depois de uma microtask', async () => {
  const { host } = mount(() => <Counter />)
  host.querySelector('button')?.click()
  expect(host.textContent).toBe('n=0')
  await Promise.resolve()
  expect(host.textContent).toBe('n=1')
})

test('o setter deixa a leitura antiga até flush()', () => {
  const [value, setValue] = createSignal(1)
  setValue(2)
  expect(value()).toBe(1)
  flush()
  expect(value()).toBe(2)
})

test('resolve() espera um memo assíncrono sob owner', async () => {
  const gate = Promise.withResolvers<string>()
  const { value, dispose } = createRoot(disposeRoot => ({ value: createMemo(() => gate.promise), dispose: disposeRoot }))
  const pending = resolve(() => value())
  gate.resolve('done')
  await expect(pending).resolves.toBe('done')
  dispose()
})

test('Loading: vi.waitFor observa o DOM sem sleep', async () => {
  const gate = Promise.withResolvers<string>()
  const Async = () => {
    const value = createMemo(() => gate.promise)
    return <span>{value()}</span>
  }
  const { host } = mount(() => (
    <Loading fallback={<i>wait</i>}>
      <Async />
    </Loading>
  ))
  expect(host.textContent).toBe('wait')
  gate.resolve('ok')
  await vi.waitFor(() => {
    expect(host.textContent).toBe('ok')
  })
})
```

O componente `Counter` está em [ambientes](environments.md#receita-componente-em-happy-dom).

## Loading, lazy e isPending

- `screen.findByRole` do `@testing-library/dom` só funciona se o pacote estiver declarado; sob pnpm ele não resolve como peer implícito.
- `lazy()`: controle o import com um portão, monte duas instâncias da mesma fábrica sob `Loading`, descarte a primeira antes de liberar e confirme que a fábrica rodou uma vez.
- `isPending` só vira `true` numa refetch. Resolva o primeiro portão, confirme `isPending` falso, mude a entrada, confirme `true` com o valor antigo ainda na tela, resolva o segundo e confirme o valor novo.

## Fake timers

- O `vi.useFakeTimers()` padrão do Vitest 4 deixa `nextTick` e `queueMicrotask` de fora; mantenha assim. Com `toFake: ['queueMicrotask']`, o DOM fica parado até `vi.runAllTicks()` ou `flush()`.
- Timer que escreve signal: `await vi.advanceTimersByTimeAsync(ms)` já entrega o DOM atualizado; `vi.advanceTimersByTime(ms)` executa o callback, mas o DOM ainda espera uma microtask.
- `until(fn, { timeout })` só rejeita depois de avançar o relógio.

```tsx
// tests/fake-timers.dom.test.tsx
import { afterEach, expect, test, vi } from 'vitest'
import { createSignal, until } from 'solid-js'

import { mount } from '../support/mount.tsx'

afterEach(() => {
  vi.useRealTimers()
})

test('o timer que escreve um signal aparece depois de advanceTimersByTimeAsync', async () => {
  vi.useFakeTimers()
  const [count, setCount] = createSignal(0)
  const { host } = mount(() => <p>n={count()}</p>)
  setTimeout(() => setCount(1), 100)
  await vi.advanceTimersByTimeAsync(100)
  expect(host.textContent).toBe('n=1')
})

test('until() com timeout só rejeita depois de avançar o relógio', async () => {
  vi.useFakeTimers()
  const [ready] = createSignal(false)
  let state = 'pending'
  const settled = until(() => ready(), { timeout: 1000 }).then(
    () => {
      state = 'resolved'
    },
    (error: unknown) => {
      state = error instanceof Error ? error.name : 'rejected'
    }
  )
  await vi.advanceTimersByTimeAsync(999)
  expect(state).toBe('pending')
  await vi.advanceTimersByTimeAsync(1)
  await settled
  expect(state).toBe('TimeoutError')
})
```
