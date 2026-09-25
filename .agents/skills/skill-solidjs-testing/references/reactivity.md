# Primitives, stores e actions

Contratos em [reatividade e ownership](../../skill-solidjs/references/02-reactivity-and-ownership.md), [effects](../../skill-solidjs/references/03-effects-and-lifecycle.md), [stores](../../skill-solidjs/references/05-stores-and-projections.md) e [actions](../../skill-solidjs/references/10-actions-optimism-and-confirmation.md).

Crie as primitivas sob owner, retenha só getters, setters e disposer, e escreva depois que `createRoot` retornou: dentro do corpo do root a escrita lança `[REACTIVE_WRITE_IN_OWNED_SCOPE]`. `ownedWrite` é opção de criação do signal, não do setter; não o use para calar esse diagnóstico.

## Receita: primitive sob createRoot

O memo calcula na criação; o apply inicial do effect só roda depois de `flush()`. O teste mostra o sinal positivo (o effect aplicou) antes da asserção negativa (parou depois do dispose).

```ts
// tests/counter-model.graph.test.ts
import { expect, test } from 'vitest'
import { createEffect, createMemo, createRoot, createSignal, flush } from 'solid-js'

test('memo e effect seguem o signal e param depois do dispose', () => {
  const [count, setCount] = createSignal(1)
  const applied: number[] = []
  const { doubled, dispose } = createRoot(disposeRoot => {
    createEffect(
      () => count(),
      value => {
        applied.push(value)
      }
    )
    return { doubled: createMemo(() => count() * 2), dispose: disposeRoot }
  })
  expect(doubled()).toBe(2)
  expect(applied).toEqual([])
  flush()
  expect(applied).toEqual([1])
  setCount(2)
  flush()
  expect(doubled()).toBe(4)
  expect(applied).toEqual([1, 2])
  dispose()
  setCount(3)
  flush()
  expect(applied).toEqual([1, 2])
})
```

Primitive que lê contexto precisa do provider acima: teste por um componente sonda ([contexto](mount-dispose-diagnostics.md#contexto)).

## Receita: store

O setter recebe só um callback sobre o draft; `setState('tasks', 0, 'done', true)` lança `TypeError` no Solid 2. Conte as execuções de cada consumidor para provar a granularidade: alterar uma folha não reexecuta quem lê outra.

```ts
// tests/task-store.graph.test.ts
import { expect, onTestFinished, test } from 'vitest'
import { createEffect, createRoot, createStore, flush } from 'solid-js'

type Task = { id: string; title: string; done: boolean }
type TaskState = { tasks: Task[]; filter: 'all' | 'done' }

test('o setter por draft atualiza só o consumidor da folha alterada', () => {
  const doneRuns: boolean[] = []
  const filterRuns: string[] = []
  const { toggle, setFilter, dispose } = createRoot(disposeRoot => {
    const [state, setState] = createStore<TaskState>({
      tasks: [{ id: 'a', title: 'Ler', done: false }],
      filter: 'all'
    })
    createEffect(() => state.tasks[0]?.done, done => { doneRuns.push(Boolean(done)) })
    createEffect(() => state.filter, filter => { filterRuns.push(filter) })
    return {
      toggle: (id: string) =>
        setState(draft => {
          const task = draft.tasks.find(item => item.id === id)
          if (task) task.done = !task.done
        }),
      setFilter: (filter: TaskState['filter']) =>
        setState(draft => {
          draft.filter = filter
        }),
      dispose: disposeRoot
    }
  })
  onTestFinished(dispose)
  flush()
  toggle('a')
  flush()
  expect(doneRuns).toEqual([false, true])
  expect(filterRuns).toEqual(['all'])
  setFilter('done')
  flush()
  expect(doneRuns).toEqual([false, true])
  expect(filterRuns).toEqual(['all', 'done'])
})
```

## Receita: action com otimismo

Chame a action no handler, depois de `flush()` das escritas comuns, e trate a Promise. Dentro de `createRoot`, `createEffect` ou `createMemo` ela lança `[ACTION_CALLED_IN_OWNED_SCOPE]` em dev; numa fixture fora de componente, use `runWithOwner(null, fn)`.

A escrita otimista reverte no fim da action, com sucesso ou falha. O item só fica porque a fonte (`api.list`) passa a devolvê-lo e `refresh` a relê. Por isso a receita testa os dois desfechos: sem o caso de sucesso, uma action que nunca grava passaria no caso de falha.

```tsx
// tests/todos.dom.test.tsx
import { expect, test, vi } from 'vitest'
import { For, Loading, action, createOptimisticStore, createSignal, flush, refresh } from 'solid-js'
import type { JSX } from '@solidjs/web'

import { mount } from '../support/mount.tsx'

type Item = { id: string; title: string; pending?: boolean }
type TodoApi = { list: () => Promise<Item[]>; save: (title: string) => Promise<void> }
type TodosProps = { api: TodoApi }

const Todos = (props: TodosProps): JSX.Element => {
  const [items, setItems] = createOptimisticStore<Item[]>(() => props.api.list(), [])
  const [error, setError] = createSignal('')
  const add = action(function* (title: string) {
    setItems(draft => {
      draft.push({ id: `temp-${title}`, title, pending: true })
    })
    yield props.api.save(title)
    yield refresh(items)
  })
  const submit = () => {
    setError('')
    flush()
    void add('Nova').catch(() => {
      setError('Falha ao salvar')
    })
  }
  return (
    <Loading fallback={<p>Carregando</p>}>
      <ul>
        <For each={items}>{item => <li aria-busy={item.pending ? 'true' : undefined}>{item.title}</li>}</For>
      </ul>
      <button type="button" onClick={submit}>Adicionar</button>
      <p role="alert">{error()}</p>
    </Loading>
  )
}

// Servidor falso: a lista só muda quando save resolve.
const createFakeApi = () => {
  const stored: Item[] = []
  const saving = Promise.withResolvers<void>()
  const api: TodoApi = {
    list: () => Promise.resolve(stored.map(item => ({ ...item }))),
    save: async title => {
      await saving.promise
      stored.push({ id: title, title })
    }
  }
  return { api, saving }
}

const titles = (host: HTMLElement) => [...host.querySelectorAll('li')].map(li => li.textContent)

const renderReady = async (api: TodoApi) => {
  const mounted = mount(() => <Todos api={api} />)
  await vi.waitFor(() => expect(mounted.host.querySelector('ul')).not.toBeNull())
  return mounted
}

test('o item otimista aparece no clique e fica depois da gravação', async () => {
  const { api, saving } = createFakeApi()
  const { host } = await renderReady(api)
  host.querySelector('button')?.click()
  flush()
  expect(titles(host)).toEqual(['Nova'])
  expect(host.querySelector('li')?.getAttribute('aria-busy')).toBe('true')
  saving.resolve()
  await vi.waitFor(() => expect(host.querySelector('li')?.getAttribute('aria-busy')).toBeNull())
  expect(titles(host)).toEqual(['Nova'])
})

test('o item otimista some e o erro aparece quando a gravação falha', async () => {
  const { api, saving } = createFakeApi()
  const { host } = await renderReady(api)
  host.querySelector('button')?.click()
  flush()
  expect(titles(host)).toEqual(['Nova'])
  saving.reject(new Error('offline'))
  await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toBe('Falha ao salvar'))
  expect(titles(host)).toEqual([])
})
```

- `flush()` dentro da action lança `FLUSH_IN_ACTION`; escreva e dê `flush()` antes de chamá-la.
- Signal comum escrito no mesmo tick da chamada só publica quando a action termina. Limpar o input depois de chamar a action deixa o texto antigo na tela até o fim.

## Sequências que discriminam erro

| Área | Sequência | Asserção |
| --- | --- | --- |
| Setters | Duas atualizações funcionais antes do assentamento | Composição preservada; leitura imediata ainda devolve o valor anterior |
| Memo condicional | Escrever no ramo inativo, alternar, voltar | Contagem de execuções e valor atual do ramo reativado |
| Effect | Alterar dependência lida só no apply, depois a do compute | Só o compute controla a reexecução; cleanup antes de reconectar e no dispose |
| Props | Mudar prop com a mesma instância montada | Texto muda sem remontar: o nó é o mesmo |
| For | Reordenar mantendo IDs, alterar payload | Estado local e foco seguem a identidade |
| Async | Iniciar A e B, resolver B antes de A | A atrasada não sobrescreve B |
| Otimismo | Duas alterações sobrepostas, uma falha | O overlay que falhou sai sem apagar a confirmação da outra |
| Owner | Descartar o pai e disparar callback tardio | Cleanup único, nada reconectado sob owner morto |

## Armadilhas

- `NotReadyError` é exportado por `solid-js` e reconhecido por `instanceof`. Uma classe local com o mesmo nome faz `Loading` e `Errored` tratarem o caso como falha real; não a declare em fixture.
- `isPending` pode absorver um erro lançado dentro do próprio callback e devolver `false`. Registre a exceção dentro do callback antes de afirmar sobre pending.
- Async precisa de consumidor vivo durante a espera: leitor criado sob owner já descartado não publica, e o silêncio dele não prova nada.
- Controle cada Promise com `Promise.withResolvers()` e libere na ordem do caso; sleep fixo esconde corridas.
