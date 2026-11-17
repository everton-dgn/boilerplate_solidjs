# Settling and waiting

The scheduler publishes writes through `queueMicrotask(flush)`.

## Settling table

| Situation | How to settle |
| --- | --- |
| After `render()` | The initial DOM is already ready |
| `element.click()` or a setter outside flush | `await Promise.resolve()` or `flush()` |
| Read right after the setter | Sees the previous value until `flush()` |
| `createRoot` with a memo and an effect | The memo computes on creation; the effect apply waits for `flush()` |
| Async memo under an owner | `await resolve(() => memo())` |
| Content under `Loading` or a new route | `vi.waitFor`, `expect.poll` or `expect.element` in browser mode |
| `await userEvent.click()` in Chromium | The DOM is already settled on return |
| Inside an action, `onSettled` or an effect apply | `flush()` throws or becomes a no-op with a diagnostic |

`flush()` resolves neither network nor Promises. For out-of-order responses, control each operation with `Promise.withResolvers()`, confirm that A and B started and release B before A.

## Loading, lazy and isPending

To test pending during a reload, resolve the first load before changing the input. Observe the pending state and the old content during the second wait, then the new value. The first load without data depends on `Loading`; do not confuse it with this reload scenario.

`lazy()` shares the import between instances of the same factory. When testing cancellation, unmounting one of them before the import resolves must not keep the other from rendering.

## Fake timers

- Keep the real `queueMicrotask`. With `toFake: ['queueMicrotask']`, the DOM stays still until `vi.runAllTicks()` or `flush()`.
- A timer that writes a signal: `await vi.advanceTimersByTimeAsync(ms)` delivers the updated DOM; `vi.advanceTimersByTime(ms)` runs the callback and leaves the publication to the microtask.
- `until(fn, { timeout })` only rejects by timeout after the clock is advanced.
