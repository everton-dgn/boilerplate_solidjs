import {
  action,
  createOptimisticStore,
  createSignal,
  createUniqueId,
  Errored,
  For,
  Loading,
  refresh,
  Show,
  untrack
} from "solid-js"
import type { JSX } from "@solidjs/web"
import type { TasksApi, NewTask, Task } from "./task-types"

type WriteResult = "confirmed" | "confirmed-without-list"

type WriteSteps = Generator<Promise<unknown>, WriteResult, unknown>

type Operation = {
  keys: readonly string[]
  refusalMessage: string
  failureMessage: string
  start: () => Promise<WriteResult>
}

type PendingOperations = {
  reserve: (keys: readonly string[]) => boolean
  release: (keys: readonly string[]) => void
  mark: (keys: readonly string[]) => void
  pending: (key: string) => boolean
}

const FORM_KEY = "form"
const taskKey = (id: string) => `task:${id}`

function createPendingOperations(): PendingOperations {
  const reserved = new Set<string>()
  const [marked, setMarked] = createOptimisticStore<Record<string, boolean>>({})

  return {
    reserve(keys) {
      if (keys.some(key => reserved.has(key))) return false
      for (const key of keys) reserved.add(key)
      return true
    },
    release(keys) {
      for (const key of keys) reserved.delete(key)
    },
    mark(keys) {
      setMarked(draft => {
        for (const key of keys) draft[key] = true
      })
    },
    pending: key => marked[key] === true
  }
}

function createTasksModel(api: TasksApi) {
  const [tasks, setTasks] = createOptimisticStore<Task[]>(() => api.list(), [])
  const pendingOperations = createPendingOperations()
  const [failure, setFailure] = createSignal<string | null>(null)
  const [notice, setNotice] = createSignal("")

  function* revalidate(): WriteSteps {
    try {
      yield refresh(tasks)
    } catch {
      return "confirmed-without-list"
    }
    return "confirmed"
  }

  const saveNew = action(function* (entry: NewTask): WriteSteps {
    pendingOperations.mark([FORM_KEY, taskKey(entry.id)])
    setTasks(draft => {
      draft.push({ ...entry, completed: false })
    })
    yield api.create(entry)
    return yield* revalidate()
  })

  const completeTask = action(function* (id: string): WriteSteps {
    pendingOperations.mark([taskKey(id)])
    setTasks(draft => {
      const task = draft.find(item => item.id === id)
      if (task) task.completed = true
    })
    yield api.complete(id)
    return yield* revalidate()
  })

  async function run({ keys, refusalMessage, failureMessage, start }: Operation): Promise<boolean> {
    if (!pendingOperations.reserve(keys)) {
      setNotice(refusalMessage)
      return false
    }

    try {
      const result = await start()
      setFailure(null)
      setNotice(result === "confirmed" ? "" : "A alteração foi salva, mas a lista não pôde ser atualizada.")
      return true
    } catch {
      setNotice("")
      setFailure(failureMessage)
      return false
    } finally {
      pendingOperations.release(keys)
    }
  }

  function create(title: string): Promise<boolean> {
    const text = title.trim()

    if (text.length === 0 || text.length > 120) {
      setFailure("Informe um título com até 120 caracteres.")
      return Promise.resolve(false)
    }

    const entry: NewTask = { id: crypto.randomUUID(), title: text }
    return run({
      keys: [FORM_KEY, taskKey(entry.id)],
      refusalMessage: "Aguarde: a tarefa anterior ainda está sendo salva.",
      failureMessage: "Não foi possível salvar a tarefa. O texto digitado foi mantido.",
      start: () => saveNew(entry)
    })
  }

  function complete(id: string): Promise<boolean> {
    return run({
      keys: [taskKey(id)],
      refusalMessage: "Aguarde: esta tarefa ainda está sendo salva.",
      failureMessage: "Não foi possível concluir a tarefa. Tente novamente.",
      start: () => completeTask(id)
    })
  }

  return {
    tasks,
    failure,
    notice,
    creating: () => pendingOperations.pending(FORM_KEY),
    saving: (id: string) => pendingOperations.pending(taskKey(id)),
    create,
    complete
  }
}

type TasksModel = ReturnType<typeof createTasksModel>

type ListProps = {
  model: TasksModel
}

function TaskList(props: ListProps) {
  return (
    <ul>
      <For
        each={props.model.tasks}
        keyed={task => task.id}
        fallback={<li>Nenhuma tarefa cadastrada.</li>}
      >
        {task => (
          <li
            class={{ completed: task().completed }}
            aria-busy={props.model.saving(task().id) ? "true" : "false"}
          >
            <span>{task().title}</span>
            <button
              type="button"
              disabled={task().completed || props.model.saving(task().id)}
              onClick={() => { void props.model.complete(task().id) }}
            >
              {task().completed ? "Concluída" : "Concluir"}
            </button>
          </li>
        )}
      </For>
    </ul>
  )
}

type Props = {
  api: TasksApi
}

export function Tasks(props: Props) {
  const model = createTasksModel(untrack(() => props.api))
  const [title, setTitle] = createSignal("")
  const fieldId = createUniqueId()

  const submit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = event => {
    event.preventDefault()
    const submittedText = title()

    void model.create(submittedText).then(saved => {
      if (saved && title() === submittedText) setTitle("")
    })
  }

  return (
    <section aria-label="Tarefas">
      <form onSubmit={submit} aria-busy={model.creating() ? "true" : "false"}>
        <label for={fieldId}>Nova tarefa</label>
        <input
          id={fieldId}
          name="title"
          value={title()}
          maxlength={120}
          required
          onInput={event => setTitle(event.currentTarget.value)}
        />
        <button type="submit" disabled={model.creating()}>Adicionar</button>
      </form>

      <p role="status">{model.notice()}</p>
      <Show when={model.failure()}>
        {message => <p role="alert">{message()}</p>}
      </Show>

      <Errored fallback={(_error, retry) => (
        <div role="alert">
          <p>Não foi possível carregar as tarefas.</p>
          <button type="button" onClick={() => retry()}>Tentar novamente</button>
        </div>
      )}>
        <Loading fallback={<p role="status">Carregando tarefas...</p>}>
          <TaskList model={model} />
        </Loading>
      </Errored>
    </section>
  )
}
