# Reactivity and ownership

## Source, derivation, owner and observer

Contract: a source keeps/produces state; a derivation computes; an owner controls life/context/cleanup; an observer tracks. An owner does not imply tracking, and `untrack` keeps the owner. A component mounts once; JSX, memos and computes track. Structural callbacks do not rerun on every update either.

Recipe: read `props.name` in the JSX or in an accessor/memo. Use a memo for a relevant or shared computation, equality or an async source, without wrapping every trivial concatenation. An object getter keeps the read if the consumer accesses it under tracking. Check who tracks, where it writes, who disposes and what it waits for (confirmed, pending, network or DOM).

Pitfall: copying/destructuring props in the setup freezes the value. A read in an event does not subscribe; creating memos/effects per event repeats primitives outside the lifecycle.

## Choosing the primitive

Contract: `createSignal(value)` keeps independent state; `createMemo(fn)` derives a read; `createSignal(fn)` allows a temporary override; a store allows a write per property; a projection derives a structure without a setter; optimistic keeps a transient attempt; an effect syncs an external system. Granular selection can use a projection by ID.

Pitfall: keep these primitives under the right owner. `Accessor<T>` is `() => T`; `SourceAccessor<T>` also identifies the source, which `refresh` needs. Wrapping it in an arbitrary function loses that identity. The setter returns the written value: an apply with an arrow without braces can receive it as an invalid cleanup. Avoid a mirrored signal for a derivation.

## Writes and purity

Contract: setters, actions and `refresh` belong to handlers, action steps, an effect apply or `onSettled`, outside the build/compute bodies. In dev, an external or local signal written in the body of a root, in the `untrack` of that body, in a memo compute, in a component, in context children or a store setter at the root throws `REACTIVE_WRITE_IN_OWNED_SCOPE`. A guard does not stop an independent effect. The top of `render` is also construction in the runtime, without a case of its own.

Recipe:

```ts
createRoot(() => {
  const [ready, setReady] = createSignal(false)
  onSettled(() => { setReady(true) })
  return ready
})
```

Contract: the apply, `onSettled` and code after `createRoot` returns can write. `ownedWrite: true` only exists in `SignalOptions`, allows a write even in a memo compute and must stay restricted to infrastructure; `StoreOptions` holds `name` and `shallow` (plus `loc` in 2.0.0, written by the compiler), without that exception.

The guard depends on the resolved engine: in the dev client, a write in the root throws; in the default build, it passes silently; on the server, it logs `SERVER_WRITE`. Mixing a core and an engine from different builds can leave `DEV` undefined with the guard on, or expose a dev core without the guard. The `test` export condition is not equivalent to the Vitest test mode; check the [runner posture](../../skill-solidjs-testing/references/vitest-config.md#posture-canary).

Pitfall: silence and an undefined `DEV` do not prove compliance. `untrack(accessor)` is equivalent to `untrack(() => accessor())` and does not authorize a write.

## Microtasks and flush

Contract: synchronous writes are grouped and publish on flush. In a handler, reading right after the setter returns the previous value. Updaters compose; `flush()` drains and `flush(fn)` also returns the result of `fn`, such as `42`. `batch` is not exported.

Recipe:

```ts
function incrementTwice() {
  setCount(value => value + 1)
  setCount(value => value + 1)
}
```

Pitfall: keep the next value locally for immediate decisions. Do not flush per keystroke, to release an action or in the apply. A timer does not prove that the graph/action/network settled; wait for an observable.

## Write held in a transition

Contract: a render effect reading an async source made pending by the write holds the commit until the response. JSX bindings use a render effect; the proof uses the primitive directly, without JSX. In both builds, after flush, the handler reads the confirmed value, `latest(source)` reads the in-flight value, `isPending(() => data())` is true and effects that only read the signal also wait. A superseded response does not publish: for IDs 1, 2, 3, with 3 resolving before 2, only `1:one` and `3:three` show up.

Recipe:

```ts
function select(nextId: number) {
  setId(nextId)
  report(nextId)
}
```

Pitfall: `report(id())` still uses the confirmed value during the hold. `latest` does not confirm arrival and throws `NotReadyError` if the source never resolved; after the response it delivers the value. If only `createEffect` reads the async source, the write is not held: ID effects publish each step and only the async reader waits, without a torn `2:one` pair.

## Conditional dependencies

Contract: `createMemo(() => useA() ? a() : b())` subscribes to the reads of that pass. An inactive B does not recompute; on a switch, A stops triggering; on the way back, it reads the updated A, including writes made while it was inactive.

Recipe: read each input inside the branch that really needs it and keep an external observer when measuring recomputations.

Pitfall: reading A and B before the ternary subscribes to both. The measurement covers synchronous passes without errors, not the removal of dependencies in suspension/failure. A count does not prove performance/Show/DOM/SSR.

## Writable derivation and stored function

Contract: `createSignal(() => props.value)` creates a writable derivation. A manual write holds until the origin changes: `source() * 2`, overwritten with 99, goes back to 4 when source becomes 2. For an initial snapshot, compute it once with `untrack` when needed. A derivation avoids imperative I/O, subscriptions and external writes.

Recipe:

```ts
const initial = () => 'initial'
const [execute, setExecute] = createSignal<() => string>(() => initial)
function replace() { setExecute(() => () => 'next') }
```

Contract: `execute()` returns the function and `execute()()` runs it. The second argument of a derivation is options, not a positional initialValue. `{ loadingValue: 7 }` offers a provisional value without declaring readiness; without it, a pending Promise throws `NotReadyError` and must be read under Loading. `createSignal(() => pendingPromise, 7)` fails in the type with TS2769.

Pitfall: `createSignal(() => window.innerWidth, { ssrSource: 'client' })` turns on the client gate; a literal first argument ignores `ssrSource`, because there is no compute to defer. Without loadingValue, the server stays in `NotReadyError` until hydration settles; use Loading or a suitable non-null provisional value. That initial function is not a one-time React initializer.

## Memo, equality and lazy

Contract: `createMemo(compute, options?)` receives options in the second argument. The compute can receive the previous value, absent at first without a provisional value. `loadingValue` defines an explicit provisional value; do not add undefined to disguise a read outside Loading. `equals` does not run on the initial commit; from the second run on it compares the concrete previous/new values. Do not detect the first run through `previous === undefined` in the comparator; for example, signal 0 updated to 1 compares `(0, 1)`.

Recipe: put a memo before the effect to cut equal applies, because effects have no `equals`. Use stable names in `createSignal`, `createMemo` and `createEffect`; `name` shows up in attribution/`whyDidRun` and in the write stack in dev/observe.

Contract: a lazy memo defers until the first read and loses the computation when it loses its last subscriber; a later read recomputes from scratch. A non-lazy one lives until its owner is disposed. A consumer in another root does not transfer ownership. The lazy case after disposing the creator with a live consumer in another root still has no fixture/is not verified. A cache requires a key/scope/expiration; a derivation tolerates rerun/disposal/supersession.

Pitfall: equality that ignores fields freezes the UI; equals false can increase work. Lazy is not a permanent cache nor a place for a one-time effect. `sync: true` declares an exclusively synchronous compute; the types say that a Promise/AsyncIterable stays raw and classify that use as undefined, without a new runtime proof.

## Async reads

Contract: a memo accepts a Promise/AsyncIterable and its accessor stands for the resolved value. Only reads before the first await track; a later read sees the current value but does not rerun the memo when it changes. Another dependency can trigger an updated reread. After the previous base, dev started warning `UNTRACKED_READ_AFTER_AWAIT` on that read; the default build does not warn.

Recipe:

```ts
const summary = createMemo(async () => {
  const userId = id()
  const currentRole = role()
  const user = await fetchUser(userId)
  return `${user.name}:${currentRole}`
})
```

Pitfall: the first read of an async source still pending after await emits in dev ``Read of an unresolved async source after an `await` ``; in the default build it leaves the dependent stuck. `isPending` is false on every path below, so it does not detect the lock. `await accessor()` does not establish tracking; the `.loading` of `createResource` does not belong to this contract.

| Reader | Development | Default |
| --- | --- | --- |
| effect without error | console.error, skips the round, no halt | neither publishes nor reports |
| effect with error | error in the error arm | neither publishes nor reports |
| render effect under a boundary | fallback, the sibling of the resolved source publishes | both stop publishing |
| render effect without a boundary | halt, unhandled rejection, every root stops | both stop publishing, no halt |

Contract: `Errored` is the public error boundary; in 2.0.0 its primitive `createErrorBoundary` is typed only in `solid-js/internal`, not application API. Read the inputs before the await, also when starting independent requests in parallel.

## Ownership and disposal

Contract: a root provides a disposer and, under another owner, is a child disposed with the parent. Keeping it globally does not unlink it. The signature accepts options with `id` and `transparent`, without `detachedOwner`. Independent infrastructure uses `runWithOwner(null, () => createRoot(...))` and takes on its own disposal.

Recipe: create resources under an owner that lives as long as needed. After await, do not assume an ambient owner; reentry does not create tracking. Confirm it is still current before reusing an owner. Shared server: do not put user/session/tokens/private cache in module signals.

Pitfall: a throw in the creation callback before returning the disposer does not dispose the partial root automatically nor run its onCleanup. Do not acquire a resource before a passage that can throw. A reused disposed owner can leak and cause a structural error.

## Cleanup order and hydration

Contract: in the same owner, cleanup is LIFO on the verified base (on the previous base it was FIFO). Child owners, including roots and memos, are disposed before the cleanups of the parent. A component gets its own root in dev, but shares the owner of the parent in the default build: a parent that registers before/after the child results in `child, parent-after, parent-before` in dev, against `parent-after, child, parent-before` in the default build. A cleanup that disposes its own root or throws runs once; the duplicated reentry was not reproduced on either base.

Recipe: cleanups do not depend on that order. If the dependency is mandatory, release the other resource explicitly or use a child root, which is disposed before the parent in both builds. Registering the parent cleanup first does not solve it.

Pitfall: `untrack` does not isolate the hydration context. A write followed by a read in the setup can enter the snapshot and cause a structural replay; do not combine `ownedWrite` and an immediate reread to fabricate a seed from another source.

## Removed APIs

See the [migration map](16-migration-from-solid-1.md#solid-1-apis-missing-from-the-base). Engine imports or aliases do not bring back the old public contract.
