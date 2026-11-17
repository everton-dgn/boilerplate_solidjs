# Lists, control flow and local state

## For and identity

Contract:

| Mode | Item in the callback | Index | Identity |
| --- | --- | --- | --- |
| default/true | value | accessor | item |
| false | accessor | number | position |
| key function | accessor | accessor | key |

Recipe:

```tsx
<For each={tasks}>{(task, index) => <p>{index() + 1}: {task.title}</p>}</For>
<For each={tasks} keyed={false}>{(task, index) => <p>{index + 1}: {task().title}</p>}</For>
<For each={tasks} keyed={task => task.id}>{(task, index) => <p>{index() + 1}: {task().title}</p>}</For>
```

Contract: a store array directly; a signal/memo uses `each={tasks()}`. Keying is fixed per instance. The default keeps identity by reference/reconciliation; a custom key, an entity with new objects; positional, a slot. In keyed by reference, a property mutation on the raw object without changing the reference does not update the node; use a granular store or a new reference.

Pitfall: do not call the default item nor the positional index as a function; do not switch overloads with a dynamic boolean. A stable/unique key comes from the domain, never random/a reorderable position; the React `key` does not control arbitrary components. The For fallback means a confirmed empty list. The first pending read goes to Loading, without the empty fallback.

## Focus when reordering

Contract: keyed keeps the node and the local state, but moving the focused node loses focus in happy-dom and Chromium; if another node moves, focus can stay. Restore the active element in the handler after flush.

Recipe:

```tsx
function reorder(nextRows: Row[]) {
  const active = document.activeElement
  setRows(nextRows)
  flush()
  if (active instanceof HTMLElement && active.isConnected && document.activeElement !== active) active.focus()
}
```

Pitfall: queueMicrotask leaves an interval without focus when other code/a test drains synchronously first; without that flush, the auto-flush happens before the microtask and the deferred restoration works. The synchronous recipe works with a pending action on another row and an optimistic each: an ordinary reorder applies on flush and does not move again on settle. Cursor/selection were not measured; keep selectionStart/selectionEnd if needed. Test moving, inserting at the start, deleting in the middle and updating the same key with an input/local state.

## Structural callback, Show and Repeat

Contract: the bodies of For and non-keyed Show run once per item/branch, under an owner without tracking. Reads of the index or `current().name` at the top freeze the value and dev emits `STRICT_READ_UNTRACKED` per callback, labeled For/Show; production stays silent. JSX/memo/effect keep the read alive. Match uses the same path, without its own test.

Recipe:

```tsx
<For each={rows()}>{(row, index) => <li data-index={index()}>{row.id}</li>}</For>
<Show when={user()}>{current => <p>{current().name}</p>}</Show>
```

Contract: a non-keyed Show delivers a narrowed accessor and keeps the node when the object changes; keyed delivers a value and recreates the branch when the identity changes, affecting cleanup/state/cost. Switch picks the first truthy Match; define priorities and a fallback. Match also tells key/accessor apart. Simple ternaries are still useful, without turning every attribute condition into a Show.

Contract: Repeat renders a count without a collection diff, with a stable numeric index. `from` defines the window `[from, from + count)`, with documented reuse of the kept entries, but the window was not tested at runtime. Handle a missing `items[index]` and do not capture a reactive leaf in the body.

Pitfall: a truthy empty list does not stand for loading. Repeat serves slots/quantity, it does not replace For for reorderable entities.

## Loading, Errored and Reveal

Contract: Loading bounds readiness, Errored failures; the error fallback receives an accessor, reset is an interaction action, never render. Reveal coordinates siblings: sequential is the default, together waits for the group, natural follows individual readiness. Collapsed only acts in sequential; the other modes ignore it. Do not use the old SuspenseList props nor a boolean together.

Recipe: with three Loadings a/b/c resolving c, a, b, expect:

| Mode | Start | After c | After a | After b |
| --- | --- | --- | --- | --- |
| no Reveal | three fallbacks | only c ready | not measured | not measured |
| together | three fallbacks | same | same | all |
| sequential | three fallbacks | same | a ready | all |
| sequential collapsed | fallback a, b/c empty | same | a ready, fallback b, c empty | all |

Pitfall: a collapsed tail hides even content that is already ready; together releases when each direct slot has its first content. An inner natural Reveal can wait for an outer sequential group. Progressive SSR requires streaming: generating the whole string before sending removes the progression. Test the shell, the fragments and hydration, not only the final HTML.

## Dynamic components and lazy

Contract: `dynamic(() => source)` from web builds a component from a tag/component/compatible source, async included. Create it in the owning body, in a structural row callback or in a truly constant/global module; not on every read. Dynamic/DynamicProps stay deprecated. `{ static: true }` reads once without tracking and refuses a Promise; `isStatic` is advanced, for libraries.

Recipe:

```tsx
const Tag = dynamic(() => props.level)
const Panel = lazy(() => import('./Panel'), { export: 'Panel' })
return <Tag>{props.title}</Tag>
```

Pitfall: the default lazy selects default; a named one uses the export option. `.then(module => ({ default: module.Panel }))` loses the module identity for hydration. Use preload to load ahead; do not make up an identity parameter reserved for the compiler. A module namespace is not equivalent to the export. Loader/compiler must be consistent on the client/SSR.

Contract: `lazy()` shares the import Promise between every instance that points to the same factory. Unmounting the first instance before the import resolves neither cancels nor corrupts that Promise: the second instance still renders when it resolves, and the factory runs only once.

## ClientOnly and Portal

Contract: clientOnly/web prevents the import on the server; it shows an SSR fallback, swapped after hydration settles. The import is shared; lazy true defers to render, the default browser can start at creation. Portal: a client island, without SSR content; hydration mounts it after settling. Data started in it begins on the client and can require its own Loading; SSR data must be born above the island.

Recipe: use clientOnly for a module that touches the browser already on import. Leave the default Portal mount when document.body cannot be evaluated in the SSR.

Portal keeps the context and the delegated propagation of the logical tree. Disposal removes only its nodes, keeping the previous content of the target; observed in the Chromium client.

Pitfall: an if after the import does not avoid a module side effect. Portal does not necessarily throw on the server. Reading props.children in the when of a Show builds an extra tree and a duplicated Portal; use `<Show when={condition()}>{props.children}</Show>`. In the measured construction, disposal cleaned up both instances without a leak. Portal in happy-dom, hydration, ShadowRoot and focus were not tested; client context/cleanup do not prove those cases.

## Visual state by identity

Contract: selection, focus, measurements and drag have their own owner/cycle. Read business fields from the received source and keep visual state in a plain store by ID, joining them on read. The optimistic overlay ends with the transaction. There is no need to detect the internal family of the store.

Recipe: receive read props and specific callbacks with input/failure, without a whole setter. A reactive function requires an Accessor; a For by ID keeps the row with new objects. Prefix the dictionary key to prevent `__proto__` from being read as the prototype; validate IDs and uniqueness anyway.

Pitfall: readonly restricts TS, without freezing/sandbox/validation. Do not cast a store to a draft nor introspect `$REFRESH`/`_firewall`. Copying the whole collection into another store can disconnect the overlay; keeping the selection in the optimistic store makes its life depend on the transaction. Separate state does not solve conflicts between clients nor the order of distributed confirmation.

## Deletion, session and optimistic integration

Filtering or paginating does not prove the deletion of an entity. The lifetime of the selection by ID is independent from the presence of the row and from the optimistic transaction.

Recipe: test an optimistic title/rollback keeping the selection, new objects with the same ID and reordering by record. For immediate visual state, write and flush before calling the action, in the same handler. Deferring the action delays the optimistic preview.

Pitfall: a plain signal/store written in the same tick as the call waits for the settle; overlapping actions that revalidate the same source can settle together. An independent write in a later tick published during the wait. Drag: compare data/DOM instances by ID; the previous base had a report of visual duplication under the overlay, fixed on the verified base ([R02](17-known-risks.md#r02-item-visually-duplicated-between-filtered-lists)). Do not drop valid data, use a random key or rewrite the backend to hide a visual defect.
