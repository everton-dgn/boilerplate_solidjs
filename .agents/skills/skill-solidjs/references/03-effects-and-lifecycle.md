# Effects and lifecycle

## Compute and apply

Contract: `createEffect(compute, apply, options?)` tracks in the compute; the apply receives the result, reads without tracking, writes and syncs external systems. Return a synchronous cleanup to release before the next apply and on disposal. The apply runs on every rerun even with an equal result: `EffectOptions` has no `equals`. With 50 rows comparing the selection, there were 50 applies; a memo per row brought it down to 2.

Recipe:

```ts
createEffect(
  () => ({ channel: props.channel, active: props.active, transport: props.transport }),
  ({ channel, active, transport }) => {
    if (!active) return
    const subscription = transport.subscribe(channel)
    return () => subscription.cancel()
  }
)
```

Pitfall: a dependency read only in the apply does not resubscribe. Returning the parent proxy and reading leaves in the apply loses the subscription of the leaves; extract the fields in the compute or use `deep(store)` deliberately, paying for the broad subscription. An effect that only copies a signal into another should become a derivation. An effect serves title, storage, metrics, sockets and integrations. Without an apply, dev throws `MISSING_EFFECT_FN`; one-time work without a read can be a direct call. An async apply returns a Promise and makes the cleanup available too late; keep a synchronous canceler and handle the rejection.

## Owner per phase

Contract: the apply of `createEffect` has a null owner. The compute and the apply of `createRenderEffect` have an owner. `onSettled` exposes an owner, but forbids creating primitives. On the stable base, a memo, effect or root created directly in the apply, in its cleanup or in a ref callback throws `PRIMITIVE_IN_EFFECT_CALLBACK` in dev, and the default build creates it without an owner; re-enter a captured owner with `runWithOwner`, as in the recipe below.

Recipe: capture `const owner = getOwner()` in the setup. If subscribe requires an owner and returns a canceler, return it through runWithOwner. If it returns an object, wrap `unsubscribe` in a function. If the library uses `onCleanup` internally, give each run its own root:

```ts
const owner = getOwner()
createEffect(source, current => runWithOwner(owner, () =>
  createRoot(dispose => {
    current.subscribe(receive)
    return dispose
  })
))
```

Pitfall: `onCleanup` in the apply does not run and dev warns `NO_OWNER_CLEANUP`. Reentering only in the owner of the component keeps A and B subscribed until unmount; a root per run removes A on the switch and B on disposal. Primitives stay in the setup.

## Return of the apply

Contract: only a cleanup function or undefined are valid returns. A setter returns the written value; `push`, `Map.set` and similar calls also return values.

Recipe:

```ts
createEffect(source, value => {
  updateExternal(value)
})
```

Pitfall: an arrow without braces can turn the return into a cleanup. Dev throws on the first apply `effect callback returned an invalid cleanup value. Return a cleanup function or undefined.`. The default build keeps the value and fails on the next run with "is not a function". Without a rerun, dispose throws a synchronous TypeError without a halt. During a run without a boundary, both builds stop every root with `REACTIVITY_HALTED`; the following writes are ignored and logged. Under `Errored`, the fallback receives the failure without stopping the graph. Strict tsc refuses the return, but JS, any and casts lose the protection.

## Errors per phase

Contract: `{ effect, error }` in place of the apply receives in error the failures of the compute/upstream, including async rejections. A compute failure without a handler in a non-rendering effect is logged, skips the apply and keeps the system running. A failure in the apply goes to the boundary or causes a halt. The error arm does not catch apply errors indiscriminately.

Recipe: handle an expected apply failure with a local try/catch. The handler receives the original error, writes state and observes the settled value: a recovery before the imperative phase can run the success path, and a held transaction defers the handler. Rethrowing escalates to the boundary/halt. Expected domain results must not expose internal details. See the [EffectBundle contract](https://docs.solidjs.com/reference/solid-js/reactivity/create-effect#effectbundle) with that phase separation.

Contract: a compute failure does not clean up the last valid subscription automatically. `error(error, cleanup)` lets you release it explicitly; without calling cleanup, it waits for the next apply or disposal. A previous cleanup that throws before the new apply takes part in the same handling as that apply.

Pitfall: decide whether the integration keeps the subscription during a failure. `REACTIVITY_HALTED` is the consequence of the first uncontained failure; there is no public recovery. `resetErrorHalt` is internal to tests, despite the export: a write during the halt can be lost and delay the next publication.

## onSettled

Contract: each registration fires once after settling, without a continuous subscription. Schedule it in the owning body for a widget, measurement or observer. Return a cleanup; do not create primitives nor register onCleanup in the callback. `createMemo` there throws `PRIMITIVE_IN_FORBIDDEN_SCOPE` in dev.

Recipe:

```ts
function createObservedRef(onWidth: (value: number) => void) {
  let element: HTMLElement | undefined
  onSettled(() => {
    if (!element) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) onWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  })
  return (value: HTMLElement) => { element = value }
}
```

Contract: use the factory under an owner, the callback in the ref and browser APIs only on the client. The recipe assumes a stable element; swapping the element requires releasing the previous resource. Imperative scheduling without an owner notifies the settle, but does not promise the cleanup of the component. A setup inside another onSettled loses the needed lifecycle: dev reports `SETTLED_CLEANUP_UNOWNED`, production ignores the return.

Pitfall: async returns a Promise, dev throws an invalid cleanup and, without a boundary, halts. `onMount` is not exported; for a one-time post-settle setup with cleanup, use `onSettled`. Writes in the callback stay in the same flush, but reads still see the previous settled value; updaters compose. `flush()` there throws in dev; inside an apply it is a warning/no-op.

## Disposal and advanced primitives

Contract: `onCleanup` stays in the owning scopes; imperative APIs can require returning a cleanup. A memo after dispose returns the last commit without recomputing, even if the source changes; finish the reads before disposal. The order between the cleanups of parent/child components differs between builds.

Recipe: reserve `createRenderEffect`, split as well, for bindings and renderer integrations. It takes part in the render and a pending async read holds the transition like JSX bindings do. `createReaction` must be armed again; check its contract before building a primitive.

Pitfall: `createTrackedEffect` is deprecated, with transition limitations and reads/writes in the same flush; do not use it in new code. `untrack(fn, label)` with a string emits `STRICT_READ_UNTRACKED` in dev when fn reads a reactive value directly. The warning does not exist automatically for every untracked read; the label serves custom primitives.

## Late async and SSR

Contract: imperative async work requires a synchronous canceler and a validity guard before applying the result. A type that accepts async in `onCleanup` does not make the return synchronous; the apply and onSettled are refused by strict tsc. To create primitives after a wait, capture the owner in the setup and check `owner && !isDisposed(owner)` right before reentering. The runtime warns about a disposed owner but still runs the callback. `isDisposed` includes an owner marked for disposal; it neither cancels an external operation nor propagates context across await.

Recipe: cancel the operation and ignore the stale result; if the data will be rendered, prefer an async source of the graph. On the server, `createEffect` runs the compute, never the apply. `createRenderEffect` runs both by default; `defer: true` skips the apply. `ssrSource: 'client'` skips the whole effect ([SSR](12-ssr-and-hydration.md#effects-on-the-server)).

Pitfall: a marked owner can still have retained DOM and a cleanup deferred by an action. In Chromium, switching a Show branch marked the owner before removing the DOM; on commit, the new branch came in and the cleanup ran once. That did not measure the recomputations of the retained branch. An owner guard does not prove removal or a completed cleanup. Global DOM in a normal compute breaks SSR.
