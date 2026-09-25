import { For, createStore } from "solid-js"

export type ListItem = {
  readonly id: string
  readonly title: string
}

export type ListWithLocalStateProps = {
  items: readonly ListItem[]
}

type VisualState = Record<string, { selected: boolean }>

export function ListWithLocalState(props: ListWithLocalStateProps) {
  const [visual, setVisual] = createStore<VisualState>({})
  const visualKey = (id: string) => `row:${id}`

  const toggleSelection = (id: string) => {
    setVisual(draft => {
      const key = visualKey(id)
      draft[key] = { selected: !draft[key]?.selected }
    })
  }

  return (
    <ul aria-label="Itens disponíveis">
      <For each={props.items} keyed={item => item.id}>
        {item => (
          <li>
            <button
              type="button"
              aria-pressed={visual[visualKey(item().id)]?.selected ? "true" : "false"}
              onClick={() => toggleSelection(item().id)}
            >
              {item().title}
            </button>
          </li>
        )}
      </For>
    </ul>
  )
}
