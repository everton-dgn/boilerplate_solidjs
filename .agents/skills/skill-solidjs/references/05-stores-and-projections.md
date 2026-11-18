# Stores and projections

## Public forms

Contract: `createStore(value, options?)` returns a writable store and a setter. `createStore(fn, seed, options?)` derives a writable structure; fn accepts a Promise/AsyncIterable and returns `[Refreshable<Store<T>>, StoreSetter<T>]`. `createProjection(fn, seed, options?)` returns only `Refreshable<Store<T>>`. Reactive objects/arrays are not accessors. The seed provides the initial structure of the draft, without guaranteeing fields before the first response. In the installed package, its type is `NoFn<T> | Store<NoFn<T>>`. The form without a draft accepts `() => T | Promise<T> | AsyncIterable<T>`, restricts `T` through `NoArray<T>` and allows leaving out the seed (`seed?: null`). A pending Promise throws `NotReadyError`; the resolution publishes granularly and drops a stale response.

Recipe:

```ts
const [state, setState] = createStore<State>({ filter: '', tasks: [] })
const openTasks = createProjection<Task[]>(() => state.tasks.filter(task => !task.done), [])
```

Pitfall: a payload in the displayed shape calls for a derived store/projection; a fetch memo with a mirrored store duplicates the sync. The seed is not the old initialValue of a memo. Use a derived store when you need to override manually and a projection for reading.

## Synchronous setter and return

Contract: the setter only receives a `(draft) => void | T` callback. The transaction closes on return; an async callback/helper and a retained draft break the window. Dev reports `ASYNC_STORE_SETTER`, the default build has no guard. Writes before the first await may already have happened; later ones vanish in the closed draft. The diagnostic does not guarantee a rollback; the async case has no fixture of its own.

Recipe:

```ts
setState(draft => {
  const task = draft.tasks.find(item => item.id === id)
  if (task) task.done = true
})
```

Contract: a wrappable return replaces the root: assigning an array in an arrow without braces turns the whole store into the array; assigning an object produces a shallow diff and erases missing keys. Another observed leaf becomes undefined, silently in both builds. `push` and primitive assignment return non-wrappable values and are ignored by the runtime, although strict tsc refuses those returns too. A deliberate return, `setTasks(draft => draft.filter(item => !item.done))`, replaces an array root.

Pitfall: `setState('filter', 'x')`, an array path or a direct object throws `TypeError: fn is not a function`; `storePath` does not bring back the old contract. Mutations use braces; JS/any/cast lose the protection. An async deriver is allowed, a manual async setter is not.

## Reconciliation and identity

Contract: a plain object return reconciles the root shallowly; a plain array follows position/length, without business matching. `reconcile(value, 'id')` uses a key; a function extracts another key; null is positional. Keys must be stable and unique. A derived store reconciles by key, the default id when applicable; align the identity with For.

Recipe:

```ts
function receiveTasks(tasks: Task[]) {
  setState(draft => { reconcile(tasks, 'id')(draft.tasks) })
}
```

Contract: shrinking three items to one removes the extra indexes: length 1, index 2 undefined and `2 in store` false. Switching a slot from an object to an array replaces the child/proxy; it does not keep its previous identity.

Pitfall: do not use the v1 options object. `null` pairs slots even with different IDs; it serves a physical position (monitor/dashboard), not an input, selection or focus per entity. Diverging keys between the store and For swap local state between rows.

## Proxy identity

Contract: a store delivers a proxy distinct from the original, stable when reading/reordering, reflecting writes without changing the original. `indexOf(raw)` returns -1 and `includes(raw)` false; proxy against proxy works. A direct write on the view outside the setter is ignored, keeping the store and the original; in 2.0.0 dev warns `STORE_WRITE_OUTSIDE_SETTER` once per store and key, and the default build stays silent.

Recipe: compare by ID or proxy: `state.items.findIndex(item => item.id === rawItem.id)`. In the draft, `delete draft.key` removes the property; `draft.key = undefined` keeps the key in Object.keys and in the in operator.

Pitfall: `unwrap` is not exported. The internal backing has a non-enumerable `STORE_OWNER` symbol, invisible to snapshot, normal traps and JSON.stringify; restricted to one-off debugging. A snapshot does not promise a new copy, especially before any write.

## Raw values

Contract: plain objects, arrays and user classes become proxies. Built-ins such as Map/Date, DOM nodes and frozen objects stay raw. An in-place mutation through the draft changes the raw value without notifying; reassignment notifies. A frozen object keeps the original reference.

Recipe:

```ts
setState(draft => {
  draft.filters = new Map(draft.filters).set('status', 'open')
})
```

Pitfall: replace a Date instead of calling setTime; a very mutable value can have its own signal. A Set at the root receives a proxy incompatible with its native slots and `add` throws `Method Set.prototype.add called on incompatible receiver #<Object>`; a nested Set accepts add but does not notify, so replace the property. The traps refuse traversal/writes of `__proto__`, `constructor` and `prototype`; an attempt through the draft does not change Object.prototype, but that does not replace input validation.

## Projections and granularity

Contract: reading a leaf subscribes to the leaf; returning only the parent proxy and reading later outside tracking is not equivalent. A projection serves a real derivation, without mirroring by reflex. Control the tracked inputs and avoid an external write in the derived draft. With `ssrSource: 'client'`, `seedLoadingValue: true` makes the seed the initial confirmed commit while pending, avoiding suspending the whole subtree.

Recipe: read `state.user.name` inside the derivation. Keep `NotReadyError` for readiness/retry/Loading, above all in SSR. Keep the new value locally or read the draft to decide during a write.

Pitfall: a plain store read before the flush delivers the previous value. A derived one delivers the freshly written value; on the previous base, after a `latest` on the same property, it started delivering the previous value on the following writes ([R09](17-known-risks.md#r09-a-read-right-after-a-write-in-a-derived-store-changes-after-a-latest)). The settled value/subscribers stay correct; avoid deciding based on that read. A generic catch that turns pending into empty breaks the graph. A complex projection to filter three items can cost more than it helps.

## Selection by key

Contract: a projection by ID only notifies the changed keys. With 50 rows, a selection from 1 to 7 produced:

| Strategy | Derivations | Effect computes/applies |
| --- | --- | --- |
| comparison in each effect | 0 | 50/50 |
| memo per row | 50 | 2/2 |
| projection by ID | 1 | 2/2 |

Recipe:

```ts
const [selectedId, setSelectedId] = createSignal(1)
const selected = createProjection<Record<number, true>>(() => ({ [selectedId()]: true }), {})
const isSelected = (rowId: number) => selected[rowId] === true
```

Pitfall: create it under an owner and read only the key of the row. The draft form, deleting the previous one and marking the new one, had the same result. In a small list, a direct comparison is simpler. `createSelector` is not exported.

## Optimistic store

Contract: `createOptimisticStore(value, options?)` and the derived form `(fn, seed, options?)` are their own primitives, not a wrapper of createStore. The deriver receives a draft and accepts a Promise/AsyncIterable. The default key is id; declare another one when the domain requires it. A write in an action shows up immediately as an attempt and reverts or reconciles with the result when it settles.

Recipe: read through the draft received in the deriver, not through the external store closed over in the scope. Keep selection/drag in a separate plain store, joining it with the received data on read.

Pitfall: reading the external store can reintroduce a dependency that the derivation already provides. Unneeded mirroring can lose the dependency of the optimistic overlay; the visual cycle is not the one of the remote mutation.

## Snapshot and deep

Contract: `snapshot(store)` reads a plain view without tracking; deep tracks deeply and delivers plain values. A snapshot can return the original before a write, repeat the reference and only later return a disconnected copy. It can represent the optimistic view not yet confirmed.

Recipe: treat a snapshot as read-only; use deep only to react to the whole set.

Pitfall: mutating a snapshot before the divergence can change the store underneath. Do not count on a stable identity, a universal copy, safe JSON or removal of secrets; preserved Map/Date require care. A snapshot in the compute does not subscribe to deep leaves.

## Shallow

Contract: `shallow: true` keeps the lower levels plain; replace the record to publish. An ingested object stays raw persistently, without being deep in another store at the same time. Existing proxies are skipped when marking and keep their reactivity in the origin store.

Recipe: use it in a large collection/immutable ingestion after measuring; polling with new objects can call for a For keyed by ID.

Pitfall: mutating an untracked leaf is silent. Do not reuse an object between shallow and deep expecting both behaviors nor assume a cheap conversion of proxies. Mixing a store proxy with a raw object already registered as deep in the same ingestion was not measured and has no guarantee.

## Public API and domain commands

`storePath` is not a public export of the core; a leftover declaration on the server does not make it accessible. Use the setter through the draft. `merge` and `omit` create props views and do not bring back the setter by path.
