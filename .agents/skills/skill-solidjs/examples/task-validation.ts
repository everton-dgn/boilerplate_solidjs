import type { Task } from "./task-types"

export class InvalidTasksResponse extends Error {
  constructor() {
    super("A resposta de tarefas é inválida")
    this.name = "InvalidTasksResponse"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseTask(value: unknown): Task {
  if (!isRecord(value)) throw new InvalidTasksResponse()

  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.title !== "string" ||
    value.title.trim().length === 0 ||
    typeof value.completed !== "boolean"
  ) {
    throw new InvalidTasksResponse()
  }

  return {
    id: value.id,
    title: value.title,
    completed: value.completed
  }
}

export function parseTasks(value: unknown): Task[] {
  if (!Array.isArray(value)) throw new InvalidTasksResponse()

  const tasks = value.map(parseTask)
  const ids = new Set<string>()

  for (const task of tasks) {
    if (ids.has(task.id)) throw new InvalidTasksResponse()
    ids.add(task.id)
  }

  return tasks
}
