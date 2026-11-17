# Mount, context, diagnostics and halt

Diagnostic and repair codes: [diagnostics](../../skill-solidjs/references/15-diagnostics-checklists-and-recipes.md#correctness-and-repair-diagnostics) of the main skill.

## Mount with guaranteed disposal

Reuse the render helper of the project. Without it, this recipe registers the disposal before mounting. `render()` calls `flush()` before returning, so the initial DOM already exists on return:

```tsx
// support/mount.tsx
import { onTestFinished } from 'vitest'
import { render } from '@solidjs/web'
import type { JSX } from '@solidjs/web'

export type Mounted = { host: HTMLDivElement; dispose: () => void }

export const mount = (ui: () => JSX.Element): Mounted => {
  const host = document.createElement('div')
  document.body.append(host)
  let disposeRoot: (() => void) | undefined
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    try {
      disposeRoot?.()
    } finally {
      host.remove()
    }
  }
  onTestFinished(dispose)
  disposeRoot = render(ui, host)
  return { host, dispose }
}
```

Primitives outside a component use `createRoot(dispose => ...)`, with `dispose()` at the end or `onTestFinished(dispose)` right after ([recipe](reactivity.md#recipe-primitive-under-createroot)).

Order of the Vitest hooks: `afterEach` runs before `onTestFinished`, and the `onTestFinished` hooks run in reverse registration order. A spy or global restored in `afterEach` misses what the tree disposal records; when the disposal depends on it, restore it in an `onTestFinished` registered before `mount()`.

## Context

The context is the provider itself, without `.Provider`. A primitive that reads context must be called by a probe component inside the real provider. Without a default or a provider, `useContext` throws `ContextNotFoundError`; the class is not exported, so compare `constructor.name`. Contract in [context](../../skill-solidjs/references/04-components-props-and-context.md#context).

## Capture diagnostics

The diagnostics of the dev build go to the console with a `[CODE]` prefix: `console.error` for the error severity and `console.warn` for the others. For error diagnostics that do not go through that report, such as the halt, the repair footer arrives alone in `console.warn` (it starts with `[CODE] repair guide:` on the historical base and with `[CODE] what it means and how to fix it:` in later packages) in a microtask, once per code and per engine instance. That is why the capture only restores the console after a microtask:

```ts
// support/capture-console.ts
type ConsoleLevel = 'warn' | 'error'

export type ConsoleEntry = { level: ConsoleLevel; text: string }

export type ConsoleCapture = {
  entries: ConsoleEntry[]
  codes: () => string[]
  uncoded: () => string[]
  restore: () => Promise<void>
}

type ConsoleMethod = (...args: unknown[]) => void

const FOOTER = /^\[[A-Z][A-Z0-9_]*\] (?:what it means and how to fix it|repair guide):/
const CODE = /^\[([A-Z][A-Z0-9_]*)\]/

const readCode = (entry: ConsoleEntry): string | undefined => CODE.exec(entry.text)?.[1]

export const captureConsole = (): ConsoleCapture => {
  const entries: ConsoleEntry[] = []
  const originalWarn: ConsoleMethod = console.warn
  const originalError: ConsoleMethod = console.error
  console.warn = (...args: unknown[]) => {
    entries.push({ level: 'warn', text: args.map(String).join(' ') })
  }
  console.error = (...args: unknown[]) => {
    entries.push({ level: 'error', text: args.map(String).join(' ') })
  }
  return {
    entries,
    codes: () =>
      entries
        .filter(entry => !FOOTER.test(entry.text))
        .map(readCode)
        .filter((code): code is string => code !== undefined),
    // codes() ignores entries without a leading [CODE]; pair it with uncoded().
    uncoded: () =>
      entries.filter(entry => !FOOTER.test(entry.text) && readCode(entry) === undefined).map(entry => entry.text),
    restore: async () => {
      await Promise.resolve()
      console.warn = originalWarn
      console.error = originalError
    }
  }
}
```

The capture must cover `dispose()` and the microtask before `restore()`. When setting up or investigating a capture that returns zero, check the dev build and a known negative: `NO_OWNER_EFFECT` in the client graph, `STRICT_READ_UNTRACKED` in the DOM or `SERVER_WRITE` on the server. Reuse the control of the project, if there is one.

`Errored` in the dev build logs the original error with `console.error` when the fallback is an element or a function without a parameter, and does not log it when the fallback receives the error. In a test with a static fallback, require that exact entry instead of accepting a dirty console.

## Reactive halt

An uncontained error in an effect or computation stops the scheduler of the whole module. The halt carries over to the next test of the same file: `[REACTIVITY_HALTED] Update ignored` shows up and the new effect never applies, without failing if the test has no positive assertion.

- `render()` resets the halt when mounting, only in the dev build. `createRoot` never resets: a primitive test does not recover by itself.
- A test that causes a halt on purpose registers `onTestFinished(() => resetErrorHalt())`. When the halt is not the subject, contain the error with `Errored` and a fallback that receives the error.
- Nodes created during the halt become unstable after the reset; recreate the tree.
- In Chromium the halt reaches `reportError`: the run can exit with code 1 even with the test green. In a test that causes a halt on purpose, listen to `error` on `globalThis` and call `preventDefault()` only when `event.error` is the expected cause; the runtime reports the original error, not the `REACTIVITY_HALTED` text. Assert that the expected event happened and remove the listener in an `onTestFinished`. Other errors stay unsuppressed.
- Do not run concurrently tests that cause a halt, capture the console or change global engine state: the failure or the reset of one contaminates the other.
