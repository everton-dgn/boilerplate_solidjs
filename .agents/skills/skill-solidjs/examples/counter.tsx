import { createEffect, createMemo, createSignal } from "solid-js"

type Props = {
  step?: number
  onValueConfirmed?: (value: number) => void
}

export function Counter(props: Props) {
  const [value, setValue] = createSignal(0)
  const doubled = createMemo(() => value() * 2)

  createEffect(
    () => ({ value: value(), notify: props.onValueConfirmed }),
    ({ value, notify }) => {
      notify?.(value)
    }
  )

  function increment() {
    const step = props.step ?? 1
    setValue(current => current + step)
  }

  function incrementTwice() {
    const step = props.step ?? 1
    setValue(current => current + step)
    setValue(current => current + step)
  }

  return (
    <section aria-label="Contador">
      <p>Valor: <output>{value()}</output></p>
      <p>Dobro: {doubled()}</p>
      <button type="button" onClick={increment}>Incrementar</button>
      <button type="button" onClick={incrementTwice}>Incrementar duas vezes</button>
      <button type="button" onClick={() => setValue(0)}>Zerar</button>
    </section>
  )
}
