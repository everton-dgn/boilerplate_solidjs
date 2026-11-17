# Actions, optimism and confirmation

Runtime contracts of the [verified base](../SKILL.md). `action` here comes from `solid-js`; the `formAction` of the router (with the deprecated `action` alias) has another contract.

## Generators and reentry

Contract: create the model under an owner and invoke the action in the handler, handling its Promise. An invocation in the body of a component/root or in the compute of a memo/effect throws `ACTION_CALLED_IN_OWNED_SCOPE` in dev. The apply of `createEffect` and `onSettled` allow the invocation; `runWithOwner(null, fn)` serves imperative integration, not disguising a mutation during a compute. A generator keeps the synchronous steps in the transaction; `action(async () => ...)` does not replace that form. `affects` marks the impact before the wait and `refresh` gets the authoritative state.

Recipe:
```ts
const items = createMemo(() => api.list())
const add = action(function* (text: string) {
  affects(items)
  yield api.add(text)
  yield refresh(items)
})
```

Contract: an async generator lets you infer the result with await, but the code between the await and the next yield stays outside the transaction. That includes writing and creating `until`, `latest`, a memo, an effect or a mount. The expression of `yield until(...)` is evaluated before reentering: do an empty yield first.

Recipe:
```ts
const save = action(async function* (input: Input) {
  const saved = await api.save(input)
  yield
  setSelected(saved.id)
  yield until(() => items().some(item => item.id === saved.id), { timeout: 10_000 })
})
```

Pitfall: without the empty yield, a confirmation already received in the held store can create a held reader, waiting for the commit that the action itself blocks, until `TimeoutError`. Test the confirmation before and after the response of the mutation. `flush()` inside the action rejects with `FLUSH_IN_ACTION` in dev.

Contract: an `async` helper yielded through `yield helper()` only runs in the transaction until its first `await`. A write and a `refresh` made in the helper after that point stay outside the action. The helper returns the result and the generator does the writes and the `yield refresh(source)`; to reuse the step, use a generator delegated through `yield*`, like `revalidate` in [tasks](../examples/tasks.tsx). In an `async function*`, `yield refresh(source)` right after `await` also runs before reentering: do an empty `yield` first. Prefer that form when you need the type of the result: in a `function*`, the value of `yield` is `any` by the signature of `action`.

Recipe:
```ts
async function persist(input: Input) {
  const saved = await api.save(input)
  return saved.id
}

const save = action(async function* (input: Input) {
  affects(items)
  const id = await persist(input)
  yield
  yield refresh(items)
  setSelected(id)
})
```

Pitfall: none of the outcomes raises an error, and the result depends on the graph. Measured on 2026-10-27 in the installed runtime, graph without DOM, dev and prod builds, with `await refresh(source)` in the helper after another `await`:
- a source that reads state already written by the action (a memo that reads a signal written in the generator, or `createOptimistic` with an optimistic write): the Promise of the action did not settle, still pending after 2 to 5 s against about 12 ms in the control;
- an independent source: the new value publishes in the middle of the action, even with `isPending` still true through `affects`. A signal that the action has not written yet, written in the helper, also publishes right away;
- a write in the helper to a signal that the action already wrote interleaves with the transaction and stays held, dragging along the `refresh` made right after.

With the writes and the `refresh` in the generator, all of them settled together. In review, look for `refresh(` and setters in `async` functions called by actions.

## Overlay and durable state

Contract: `createOptimistic` and `createOptimisticStore` provide a transient overlay. The derivation keeps the authoritative source; every optimistic write inside the action reverts on settle, on success or failure, including a write after yield using the server response. Durable truth comes from the derivation rerun through refresh/an input or from a separate plain store. An optimistic write outside an action shows for one flush and reverts at its end. `setOptimistic` is not an export of the base; use the setter of the pair.

Recipe:
```ts
const [items, setItems] = createOptimisticStore<Item[]>(() => api.list(), [])
const [saving, setSaving] = createOptimistic(false)
const complete = action(function* (id: string) {
  setSaving(true)
  setItems(draft => {
    const item = draft.find(item => item.id === id)
    if (item) item.completed = true
  })
  yield api.complete(id)
  yield refresh(items)
})
```

Pitfall: documentation examples that write the response into the optimistic value after yield do not make it persistent. In the measured case, a plain signal/store written before the first yield stayed invisible to the external effect during the wait and published even after the rejection of the yielded Promise; the success control published the same. Reads by the action itself after the write and after an empty yield saw the base, of the optimistic source included. That does not measure an exception in the body, a rejection after a later yield nor a write after reentry. Do not infer success from the final state nor a rollback of plain sources. An old snapshot restored manually can erase a valid concurrent change.

## Operation indicator and publication on click

Contract: pending observes an expression of the graph; not every mutation has a dependency the button can observe. An optimistic flag written inside the action shows on the next flush and reverts on settle. A plain signal written in the same tick, before or after the call, enters the transaction and only publishes on settle; an independent write in a later tick publishes. To clear an error/input on click and show an optimistic preview, do the plain write and the flush before the synchronous call of the action.

Recipe:
```ts
const submit = () => {
  const value = text()
  setText("")
  setError("")
  flush()
  void save(value).catch(() => { setError("Failed") })
}
```

Pitfall: `save(text()); setText("")` holds the text until the end. Deferring only the action with await/microtask delays the preview, which will still be old after the flush of the event. The recipe is for a DOM handler or code outside a running flush: in `onSettled`/`createTrackedEffect`, flush throws; in the apply, it is a no-op with `FLUSH_IN_EFFECT_CALLBACK`; in the action, `FLUSH_IN_ACTION`. If the command starts in those contexts, schedule the whole block of write, flush and action in `queueMicrotask`. Result messages can be plain signals after the Promise; the accessible region must be mounted before the text.

Alternative outside the verified base (documentation, without a probe in this skill): later packages export `onFlush(callback)`, which runs once right after the pending flush, before painting, without waiting for async work. According to the JSDoc of the package and the official `solid-2.0` skill, it serves to take a write out of the hold of another update, as in `onFlush(() => setOpen(false)); props.onSelect?.(id)`. Call it in a handler or an effect callback, `onSettled` and `createTrackedEffect` included; in the body of the component or in a computation it warns in dev. Limits from the JSDoc: the write only stays independent if nothing it changes also derives from the held work; it arrives after the inline writes of the same frame, so do not write the same signal inside and outside the callback; and a `queueMicrotask` called before the first write of the frame enters the same flush, without replacing `onFlush`. Check the export in the installed `solid-js` and keep the recipe above until a probe compares both with a pending action.

## affects, properties and latest

Contract: an isolated refresh is silent for pending. `affects` before a refresh in the action makes the wait visible until it settles. `affects(store, key)` accepts a slot key, not a path of several keys; use the right node/leaf. `isPending(() => store)` only returns the proxy, without observing a field. Before the first data, a property read can throw NotReadyError; the indicator does not hold the initial loading.

Pitfall: `latest` does not filter every reload. In a settled derived store, a global affects + refresh kept the plain read and latest pending. With an optimistic edit + `affects(store, 0)`, only the plain read of the first row stayed pending; latest and the second row did not. An optimistic edit without affects did not turn on the indicators. That proves an array slot, not the isolation of two properties of the same row. Do not mark the whole application for a change in one row.

## Three waits

Contract: `resolve(expression)` returns a settled read; an awaited refresh returns the next settled state of the invalidation, supersession included; until waits for an authoritative condition correlated with timeout/cancellation. Refresh resolves even with an equal value without a plain notification. Inside the action, it can deliver a staged authoritative value without waiting for the commit blocked by the action itself. For an optimistic accessor, the resolved value is authoritative while a direct read sees the overlay; for a store, it resolves the node itself, and a read through the proxy still sees the overlay. The guarantee of not returning the overlay refers to the resolved value, not to the proxy read afterwards.

Pitfall: the initial window of `loadingValue` lets refresh resolve with the provisional value before the real data. Until does not confirm through the overlay itself; falsy keeps waiting, error/timeout/abort rejects. An ID already present, an absence in a partial page or a counter changed by another client does not confirm your mutation. Use a correlation ID or a version, shared by the reconciliation and the test. A refetch after a confirmed response is usually enough; until serves when the confirmation comes through an independent live source. Test an early, a late and another operation's confirmation: a timeout only limits a wrong condition.

## Concurrent operations

Contract: two clicks can happen before disabled publishes. For local serialization use an imperative guard; for parallelism, a key per entity. Define serialization, last write wins or a version with conflict in the domain. Private setters and named commands prevent an overlap without confirmation. Do not use a global queue for independent records nor a global boolean for multiple operations.

Recipe: in the tasks example, a plain `Set` reserves `form` and `task:<id>` for creation and `task:<id>` for completion before the action. A synchronous refusal shows in an accessible status. An optimistic flag per key feeds disabled/aria-busy; a new row stays blocked while the server does not know the ID. Completing A while B is created allows both, but revalidating a shared source can settle both together on screen: the Promise of A ended after its refresh, while the value/flag of A waited for B.

Pitfall: the end of the Promise does not guarantee a confirmed DOM. Use a stable client ID when allowed or an explicit correlation; swapping a temporary key without reconciling unmounts the row, loses focus or duplicates the entity. A dropped stale response does not cancel the server effect. The backend still requires a precondition, version, transaction or idempotent key.

## Publishing the confirmation of an overlapped action

Contract: a confirmation written inside the action, after the yield, waits for the other overlapped ones. A write after the Promise of the action itself publishes right away, with an order guard. Pass an already created Promise to write once. If waiting for all of them is the desired UX, the write inside is still right.

Recipe:
```ts
type Submission = { text: string; response: Promise<string> }
const execute = action(function* ({ text, response }: Submission) {
  setPreview(text)
  yield response
})
let generation = 0
let confirmedGeneration = 0
const save = async (text: string) => {
  const current = ++generation
  const response = api.save(text)
  await execute({ text, response })
  const canonical = await response
  if (current > confirmedGeneration) {
    confirmedGeneration = current
    setConfirmed(canonical)
  }
}
```

Pitfall: without a guard, an old response can overwrite a new confirmation. Keep the persistent intent, the draft and the transient flag separate; do not turn every visual signal into an optimistic one.

## Write, revalidation and failures

Contract: validation, conflict and permission can return a typed domain result; infrastructure can reject. Define the public presentation, the retry and the retention of the draft. The rejection of a yielded Promise enters the generator through throw. A `throw` inside the `async function*` of an action rejects the returned Promise without locking, directly or after an inner `await`. A confirmed write followed by a failed refresh must produce its own result and not repeat the write.

Recipe:
```ts
yield api.save(input)
try {
  yield refresh(items)
} catch {
  return { saved: true, refreshed: false }
}
return { saved: true, refreshed: true }
```

Pitfall: `void action()` does not handle the rejection. Do not expose a raw server message. In the example, a refresh failure says that it saved without updating the list, clears the saved draft and keeps the Errored of the list; a write failure keeps the field, removes the optimistic row and does not redo the list. On the base, writing the overlay of a derived store and failing its refresh causes another run of the derivation on settle, without a request from the application; without an optimistic write, it does not. That extra read can recover the list without a reset. Count requests with that rule, without generalizing it to future versions.

Contract: disposing of the screen/aborting does not undo a late confirmation of the backend; the next read must converge. Test the absence of subscriptions/writes on a dead owner. Compensation requires knowledge of the version/intent, not a generic catch. Pin consistent confirmed data and indicator, not a historical commit count; duplication or growing subscriptions call for a local reproduction before blaming the model or the risks R01/R02.
