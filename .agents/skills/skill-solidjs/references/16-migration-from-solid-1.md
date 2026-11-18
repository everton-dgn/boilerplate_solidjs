# Migration from Solid 1 and divergences

Base: [verified revision](../SKILL.md), reverified on 2026-09-29. It only comes in for a migration task or when an old pattern shows up in the code; the legacy column is not part of the Solid 2 API and the recipes of the skill only use the v2 contract.

Contract: a deprecated API can stay exported for compatibility without being recommended. An API present only in the internal engine, in types or in comments does not get a public export because of that. If the request is to fix a bug in Solid 1, state the limit and use the documentation of the installed version; a major migration is another task.

## Solid 1 APIs missing from the base

The 1.x → 2.0 correction table of the official skill (`node_modules/solid-js/skills/solid-2.0/SKILL.md`, or the `CHEATSHEET.md` of the package when the `skills/` folder does not exist) covers the direct replacements, such as `Index`, `onMount`, `createSelector`, `createResource`, `createComputed`, `startTransition`, the `solid-js/web` and `solid-js/store` subpaths, `produce`, `classList` and `attr:`/`bool:`. The tables below keep the names it does not cover and the rows whose note adds a precaution missing from the official table. The precautions of the direct replacements are in the references of each subject, and the official table leaves out these two caveats:

- The `mutate` of `createResource` has neither an export nor a row in the official table, which only swaps `loading`, `error` and `refetch`. Choose the replacement by the durability the code expected: a write through `createOptimistic` or `createOptimisticStore` inside an `action` reverts on settle, and the durable value comes from the `refresh` of the source ([overlay and durable state](10-actions-optimism-and-confirmation.md#overlay-and-durable-state)); the setter of a writable derivation, `createSignal(fn)` or `createStore(fn, seed)`, holds until the source reruns ([writable derivation](02-reactivity-and-ownership.md#writable-derivation-and-stored-function)).
- `classList` replaced by `class` with an object or array joins in a single prop what used to be two. When going from `class="base" classList={{ active: x() }}` to `class={['base', { active: x() }]}`, check the composition and the precedence in the DOM when the same token shows up in more than one entry, without assuming which one wins; if the object comes from a signal mutated without changing the reference, that signal needs `equals: false` to rerun the binding ([classes and styles](07-dom-events-and-refs.md#classes-and-styles)).

None of these names is exported by `solid-js` on the verified base, in the dev and default builds, and the replacements of the Solid 2 column exist. The stable base exports `createDeferred` again, with another contract (see its row).

| Solid 1 | Solid 2 | Note |
| --- | --- | --- |
| `Suspense`, `SuspenseList` | `Loading`, `Reveal` | Their own contracts of readiness and of order/collapse, not aliases |
| `ErrorBoundary` | `Errored` | The fallback error is an accessor |
| `mergeProps` | `merge` | `@solidjs/web` exports `mergeProps` only as an internal helper of the compiler |
| `splitProps` | `omit` | Filters keys; it does not return the same tuple |
| `on` | Compute of `createEffect` | Explicit dependencies in the compute; the `defer` of `on` becomes the `defer` option of the effect |
| `batch` | Automatic batching per microtask; `flush` only to read settled state | Do not swap every `batch` for `flush` |
| `createDeferred` | On the stable base, `createDeferred(fn, options?)` is an async memo that keeps the previous answer during a refetch (`isPending` reports it) | It does not defer propagation to idle time like 1.x, and microtask batching does not replace that: events in separate tasks still run the work, so debounce or throttle the input explicitly |
| `isRefreshing` | `refresh(target)` returns a Promise; `yield refresh(target)` in an action reruns the source and waits for the settle | It does not expose the phase to a pure computation; combine it with `affects(target)` or an optimistic flag |
| `setStore("a", 0, "b", v)`, `setStore(path, reconcile(...))` | `setStore(d => { d.a[0].b = v })` | A setter by path and with an object throw `TypeError`: `StoreSetter` only accepts a function |
| `createEffect(fn)` | `createEffect(compute, apply)` | On the client, `createEffect(fn)` throws before the compute (`MISSING_EFFECT_FN` in dev; a `TypeError` without a code in default); `createRenderEffect(fn)` runs the compute and then fails with a `TypeError`, escalating to `REACTIVITY_HALTED` (the test must isolate/reset the engine). In the server build both run the compute once without an error: SSR and tests with `environment: 'node'` do not flag the pattern |

In a migration, look in the project for imports of those names, subpaths such as `solid-js/web` and `solid-js/store`, a store setter by path, a one-argument effect and old router exports. Router: [its own map](14-routing-and-architecture.md#router-migration-map).

## Migration map

Pitfall: do not do a global replacement. An import can be mechanical, but lifecycle, stores, effects and transitions change contracts. Align dependencies, renderer and compiler; then migrate per feature with regression tests. `merge` lets an explicit `undefined` override the default.

| Previous pattern | Direction in Solid 2 | Precaution |
| --- | --- | --- |
| `solid-js/h`, `/html`, `/universal` | `@solidjs/h`, `@solidjs/html`, `@solidjs/universal` | `solid-js` only exports `.`, `./refresh`, `./attribution`, `./internal` (plus `./internal/container-trace` in the installed package) and `./package.json`; install only the real renderer |
| `jsxImportSource: "solid-js"` | `"@solidjs/web"` in compiled DOM | Do not mix it with hyperscript |
| `indexArray` | `mapArray` with positional keying | The item and index contract changes |
| `unwrap` | `snapshot` | Plain view and untracked read |
| `createMutable` / `modifyMutable` | A store with writes through a draft; `@solid-primitives/mutable` for legacy | Do not mutate the proxy freely |
| `createDynamic` / `<Dynamic>` | The `dynamic` factory | `Dynamic` exists, deprecated |
| `use:` | A ref factory + an owning lifecycle | A ref callback alone does not get a cleanup |
| `on:` / `oncapture:` | Removed; a delegated camelCase event (`onClick`) or a manual `addEventListener` | For `capture`, `passive` or `once`, register it in the lifecycle (or through a ref factory) and remove it in `onCleanup` |
| `getListener` | `getObserver` | An owner is not an observer |
| `equalFn` | `isEqual` | Check the signature |
| `renderToStringAsync` | `await` of the result of `renderToStream` | Do not consume the stream twice |
| `Context.Provider` | The Context itself as the provider | Reexamine defaults and the absence of a provider |
| `<Title>` from `@solidjs/meta` | `useHead` from `@solidjs/web` | `<head>` tags |
| `sharedConfig.count` | No public equivalent | Hydration modules come preloaded and IDs live in owners; do not touch it |
| JSX `tabIndex` | `tabindex` (lowercase) | In `<dialog>` the type is `tabindex?: never` |

`enableScheduling`, `writeSignal` and `resetErrorBoundaries` must not be recreated through an alias. For `from`/observable, the stable base exports `from`: use `createMemo(() => from(source))`, which accepts a callback subscription `(next, error, complete) => unsubscribe`, an Observable or an AsyncIterable and handles hydration; push values out with `createEffect`.

## Divergences found in the documentation itself

- D01 `storePath`: on the verified base (`ee49b3e`), MIGRATION, CHEATSHEET and the stores RFC still showed it; the `CHEATSHEET.md` of later packages no longer shows it. The core still does not export it. Write setters with a draft; do not import it from `@solidjs/signals` nor from an internal path.
- D02 `createTrackedEffect`: presented as an advanced single-phase effect; the JSDoc marks it deprecated for new code. Use a split `createEffect` and `onSettled`; existing use is compatibility to be replaced, not a recipe.
- D03 Portal on the server: the cheatsheet describes an old error; the renderer defines Portal as a client-only island mounted after settling. Do not touch `document` in props evaluated on the server nor assume Portal content in the HTML.
- D04 `For` callback: an RFC example uses the item as an accessor in the default mode. Default: a direct item and an accessor index; positional: an accessor item and a number index; custom key: both accessors.
- D05 initializers: old comments cite `initialValue`; the second argument of `createMemo` is `MemoOptions` (`name`, `equals`), not an initial value. The seed of a derived store is another concept. The types and overloads of the resolved version win over the prose and the memory of the agent.
- D06 compiler versions: a version in the `package.json` of a branch does not prove a release. Confirm the registry, peers and lockfile before installing.
- D07 `ComponentProps` and `ValidComponent`: the core has forms restricted to components that do not resolve `ComponentProps<"button">`. In DOM UI, import them from `@solidjs/web`.

## Changes between previews and a safe process

Do not treat two RCs as equal: each preview can change diagnostics, exports, stores, streaming, errors and integrations. When migrating from an earlier beta or RC, review lazy with a named export, the options of `dynamic`, the server `onError` and async setters. A named lazy: `lazy(() => import(...), { export: "Name" })`; a wrapper that produces `{ default: module.Name }` at runtime can break the synchronous identification of hydration. The third argument (`moduleUrl`) is integration context.

Process: freeze a base with tests, list the removed imports, migrate a representative feature with async and a form, check client DOM and SSR, then widen. Do not disable every diagnostic during the transition; each temporary exception has a reason, a scope and a test.

Pitfall: a closed issue does not prove a fix in the installed package; the semantics of `Loading.on` changed on the verified base ([R03](17-known-risks.md#r03-on-and-a-boundary-created-during-a-hold)); an old answer can describe a planned hook that the verified base already has; a gate ended by a signal can look like success. None of that authorizes importing a private field or applying a comment patch.

## APIs that mislead

`storePath` and `markRaw` are not public exports of this base. For a raw value, check `snapshot` and its limits; `deep` does a tracked read, not the opposite. Do not import `$PROXY`, `$TRACK` or hydration fields to replace removed APIs. On the stable base, `sharedConfig`, `createOwner` and the boundary primitives (`createErrorBoundary`, `createLoadingBoundary`, `createRevealOrder`) are typed only in `solid-js/internal`, without a semver guarantee; libraries use `isHydrating()`, `isHydratable()` and `onHydrationEnd()`, and code that used `createOwner` hosts a scope with `createRoot()` and re-enters it with `runWithOwner()`.

`resetErrorHalt` serves the [test harness](../../skill-solidjs-testing/references/mount-dispose-diagnostics.md#reactive-halt); it is not error recovery for the application.
