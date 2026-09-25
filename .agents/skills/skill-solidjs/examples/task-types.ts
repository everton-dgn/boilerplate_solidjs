export type Task = {
  id: string
  title: string
  completed: boolean
}

export type NewTask = {
  id: string
  title: string
}

export type TasksApi = {
  list: () => Promise<Task[]>
  create: (entry: NewTask) => Promise<void>
  complete: (id: string) => Promise<void>
}
