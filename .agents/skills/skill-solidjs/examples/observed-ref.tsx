import { createSignal, onSettled } from "solid-js"
import type { ParentComponent } from "solid-js"

function createObservedRef(onWidth: (width: number) => void) {
  let element: HTMLElement | undefined

  onSettled(() => {
    if (!element) return

    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) onWidth(entry.contentRect.width)
    })

    observer.observe(element)
    return () => observer.disconnect()
  })

  return (value: HTMLElement) => {
    element = value
  }
}

export const ObservedPanel: ParentComponent = props => {
  const [width, setWidth] = createSignal(0)
  const ref = createObservedRef(setWidth)

  return (
    <section ref={ref} aria-label="Painel observado">
      <p>Largura: {Math.round(width())} px</p>
      {props.children}
    </section>
  )
}
