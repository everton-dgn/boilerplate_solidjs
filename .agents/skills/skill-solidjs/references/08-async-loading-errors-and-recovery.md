# Async, Loading, errors and recovery

Runtime contracts of the [verified base](../SKILL.md). The limits given are not guarantees for other environments.

## Async sources and dependencies

Contract: `createMemo` can return a Promise and its accessor stands for the resolved data. Read it in JSX, a memo or an effect compute; capture the reactive inputs before the first `await`. Later reads do not subscribe to dependencies and only see changes when another tracked input restarts the computation. Independent memos under an active root start even without a consumer, in the client graph. Suspending a read can prevent the next expressions of the consumer, but does not prevent already created sources from starting. A sequential `await` defers the next call; a real dependency requires that wait. `Promise.all` publishes the set only when all of them resolve; an independent display calls for separate sources and boundaries.

Recipe:
```ts
const user = createMemo(() => api.read(id()))
const combined = createMemo(() => {
  const key = id()
  return Promise.all([api.read(key), api.orders(key)])
})
```

Pitfall: a fetch in each JSX or effect imitating `createResource` multiplies the work. Reading a source still pending after `await` can interrupt the consumer: see the [error channels per build and reader](02-reactivity-and-ownership.md#async-reads). In the default build, it can lock with `isPending` false.

## Loading and a read that throws

Contract: `Loading` holds the initial readiness; an initialized boundary can keep the confirmed content on an update. Keying or an owner change can create a new boundary. `Errored` must wrap the reader of the memo that throws from the start. A memo created above `Show`/`Switch` recomposes on the flush before the branch switch by status: without a boundary, the flush throws, the old screen stays and every root stops with `REACTIVITY_HALTED`. A memo created inside the branch is disposed with it; a plain function that throws in the JSX can be disposed by the conditional before running, but also causes a halt without protection.

Recipe:
```tsx
<Errored fallback={(_error, reset) => (
  <section>
    <p>Unavailable</p>
    <button type="button" onClick={() => { model.retry(); reset() }}>Try again</button>
  </section>
)}>
  <Loading fallback={<p>Loading</p>}>
    <output>{model.read()}</output>
  </Loading>
</Errored>
```

Pitfall: the fallback receives an error accessor, not a ready public message. With the accessor received by the fallback, the contained error is not logged to the console and other roots keep going. Do not reread the broken source to explain the failure. `Errored` does not contain every event/action rejection: handle the Promise explicitly. `ASYNC_OUTSIDE_LOADING_BOUNDARY` is usually a warning on the client, with the root mount empty and deferred until it settles; on the server, an `ssrSource: "client"` source outside `Loading` throws an `Error` with that message, and inside it uses `NotReadyError(CLIENT_HOLE)` to keep the stream. Prefer a boundary over strict enforcement by default.

## Confirmed input, latest and isPending

Contract: a render effect that reads an async source depending on `id` holds its own write until the data arrives. In the handler, `id()` gives the confirmed input, `latest(id)` the in-flight input and `isPending(() => data())` shows the wait. In the sequence 1, 2, 3, with the response of 3 before the one of 2, it publishes 1 and then 3; a late 2 does not publish. With only `createEffect` reading, `id()` already changes and only the reader waits. Both builds match.

Recipe:
```ts
const pending = () => isPending(() => user()) || isPending(() => orders())
```

Pitfall: `isPending(() => id())` does not observe the dependent work; `isPending(() => users() || orders())` leaves out the second branch through short-circuit. Even without short-circuit, a read that throws NotReady can prevent the next one: use separate queries, an aggregated source or their own boundaries. `latest` picks the available view, it neither waits for the network nor makes up initial data: before the first result it throws `NotReadyError`. Do not use it as a pending catch, a universal reload filter or proof of an unconfirmed edit.

## Refresh and imperative bridges

Contract: `refresh(source)` invalidates a Solid accessor or a refreshable derived store even without an input change. The Promise follows the next settled state, replacement work included; an accessor resolves the value, a store resolves the node passed. A node of the same derived family restarts the whole source, without an implicit partial refetch. An equal value also resolves without notifying ordinary readers. An isolated refresh does not turn on pending; `affects(source)` marks the impact, or model the operation state. If it is still waiting when it fails, the Promise rejects; the runtime lets you ignore it in fire-and-forget use, without extending that protection to other Promises.

Recipe:
```ts
const data = await resolve(() => source())
await refresh(source)
```

Pitfall: `refresh(() => source())` and an arbitrary property are not targets. The wait does not identify a specific HTTP call. `resolve` returns a Promise of the settled read and must not be created in a tracked computation. `until(predicate, options?)` waits for truth and accepts timeout/cancellation; handle the rejection and check the authoritative truth inside the action. `untrack` only turns off the subscription: a read without a value still throws `NotReadyError`, works again on settle and there is no `untrack(fn, fallback)` overload.

## Provisional values

Contract: `loadingValue` publishes a provisional value before the first result, without the normal initial suspension. `[]` can hide the loading: use an explicit indicator if empty and loading differ. Stores/projections use `seedLoadingValue: true`; a structural seed alone does not decide the UX. Model `null`/`undefined` in the type and in the UI.

Pitfall: on the first failure with `loadingValue`, the subscribed effect keeps the provisional value without rerunning, and pending stays false even in a new reader. `Errored` receives the original error by identity; a new imperative read throws a `StatusError` with the original in `cause`. Compare identity in the chosen channel, not only the message. A `refresh` before any real data restores the provisional value, takes the boundary out of the fallback and resolves with the provisional value while the request is still waiting. Waiting for that refresh does not confirm real data; the first success replaces the seed. Do not generalize it to a reload after a real value.

## AsyncIterable sources

Contract: a memo accepts an `AsyncIterable`. The first pull keeps the fallback until a value; the following pulls keep the confirmed value without reopening pending. An input change waits for the first yield of the new source and keeps the old content in an initialized boundary. A replacement calls `return()` once on the previous iterator; an old pull resolved with a live owner neither publishes nor asks for another. Disposal calls `return()` once on the active one, without an extra pull after a late response.

Pitfall: that cancels neither external transport/processing, nor is it the yield of an action. A generator that ends without a yield settles `undefined`; after a yield, ending keeps that value. A synchronous thenable and `next()` with an already settled result publish in the same flush; a native Promise, even resolved, requires a microtask. Direct pending probes and probes through a memo matched when created/disposed per phase under an owner, without a general equivalence.

## Keys and shared readers

Contract: in the installed runtime, `Loading.on` is a list of dependencies: every change in a tracked read of `on` rearms the boundary, without comparing values. Pass `on={id()}` or `on={[query(), page()]}`, as in the JSDoc; `on={id}` does not call the accessor and is equivalent to leaving `on` out, although the `any` type accepts it; in 2.0.0 dev warns `LOADING_ON_ACCESSOR`, also for `on={() => id()}`. The fallback arrives with the frame of the change: a sibling that holds the same change prevents the fallback.

| Configuration | During the wait | Environment |
| --- | --- | --- |
| `on={id()}`, alone | fallback | Chromium (previous base), graph (verified base) |
| `on={id()}`, sibling reading the same source | both keep the content; `LOADING_ON_OUTSIDE_HOLD` in dev | Chromium (previous base), graph (verified base) |
| `on={id}` | old content, pending true | Chromium (previous base), graph (verified base) |
| `on={latest(id)}`, sibling reading the same source | fallback right away; the sibling keeps the content | graph |
| key whose value does not change, such as `on={id() > 0}` | fallback | graph |
| `on` with async data and refresh | fallback on each refetch | graph |
| `on` with id and refresh of the same subject | old content | graph |

Pitfall: to show the fallback right away, despite the sibling, read `latest(id)` in `on`; alone, `on={latest(id)}` also shows the fallback. Do not mix the title of B with confirmed data of A without showing the difference. Do not increment a counter nor create a new object when evaluating `on`. `flush()` only drains eligible synchronous work, without resolving the network or forcing an arbitrary transaction.

## Nesting and Reveal

An inner `Loading` holds its initial read and lets the outer shell show. A pending read directly under the outer one shows the outer fallback. For order and collapse between boundaries, see [Reveal](06-lists-control-flow-and-local-state.md#loading-errored-and-reveal); an inner natural group does not release the wait of the outer sequential one.

## SSR and available surface

Contract: `ssrSource: "server"` serializes an authoritative server origin; `"hybrid"` uses that data and allows a client recomputation; `"client"` skips the origin on the server. `deferStream: true` can hold the shell until the needed data; `transparent: true` is a restricted integration option. A client source calls for Loading/a fallback or an explicit provisional value. Do not read `window` in a server origin nor pick hybrid without a need for refetch.

Pitfall: the available APIs are `latest`, `isPending`, `affects`, `flush`, `refresh`, `until`, `untrack`, `createOptimistic`, `createProjection`, `action`, `onSettled`, `resolve`, `enableExternalSource` and `NotReadyError`, plus `createDeferred`, `from` and `onFlush` in 2.0.0. There is no `isSomePending`, `isRefreshing`, `batch`, `pending` or `createAsync`; aggregate `isPending`, control a Refresh operation and use an async memo/projection with `ssrSource`.

## Recovery and cache

Contract: `reset` asks for a reevaluation of the collected sources, without recreating the subtree. The boundary also recovers without reset when the source produces a value again through an input, a refresh or a rerun. An input hidden during the error can come back as the same node with the typed text. Before the first load it does not show; keep the form outside the boundary to stay visible/editable. A source that only goes back to pending keeps the error fallback, with or without reset; an inner Loading only goes back to the content when there is a value. A retry indicator must come from the model outside `Errored`, in an announcement region mounted empty from the start.

Recipe:
```tsx
<p role="status">{model.retrying() ? "Loading" : ""}</p>
<p role="alert">{model.publicMessage()}</p>
```

Pitfall: reset neither erases a rejected Promise of an external cache nor undoes/reauthorizes a mutation. Invalidate at the right layer; do not keep an accessor of a disposed owner. The model responsible for the retry must outlive the reader. On the server, `lazy()` clears its internal Promise after a rejection, allowing a new import on the next mount/preload; that does not clear the cache of the bundler/router. In the inspected router API, `revalidate` matches a prefix, `force` is true by default and `query.delete` removes an entry: choose a narrow key and test a real request, because the HTTP of the core does not certify that cache. Block a duplicated retry; payment/creation/reservation requires idempotency and backend reconciliation. A permission only recovers if the condition changed. `NotReadyError` is not a business failure.

## Observation and sanitization

Contract: `configureClientErrors` observes errors collected by a boundary, deduplicates by object and admits a policy per root in render/hydrate. Uncontained errors follow the platform. `ownerPath` identifies the origin and `boundaryPath` the handling, but they can be missing depending on the artifact/retained names. The client hook returns void and does not change a server error; a server hook can map exposure. `Errored` accepts `fallback`/`children`, without an `onError` prop.

Pitfall: a reactive fallback can rerun and duplicate telemetry; do not rely only on `window.onerror` nor send logs without deduplication. A generic message in the DOM does not protect the HTML, chunks, hydration, RPC or an exporter. Select the public fields before handing them to Solid; a hook return and `markSafeError` authorize exposure. Test a synthetic marker, never a real secret or credential, in the message/cause/own field, contained/uncontained failure, same object/new instance and the effective request after invalidation. Do not remove assertions to get back an old render count.

## Update limit

The semantics of `Loading.on` changed between the previous base and the verified base. See [R03](17-known-risks.md#r03-on-and-a-boundary-created-during-a-hold) before applying examples from another version.
