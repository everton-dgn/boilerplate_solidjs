---
name: skill-solidjs
description: "SolidJS 2 / Solid 2.0 (solid-js, @solidjs/web): create, review and debug TSX, createSignal, stores, effects, Loading, action, SSR, hydration. Tests: skill-solidjs-testing. Out of scope: Solid 1, SolidStart."
metadata:
  compatibility: "SolidJS 2 with @solidjs/web. Check the exports and types of the installed package."
  skill-version: "1.10.0"
  verification-date: "2026-09-29"
  base-commit: "ee49b3eee5f457a637075c4a3bbdcee013808fc3"
---

# SolidJS 2

The evidence base is in the frontmatter ([manifest of the verified revision](https://github.com/solidjs/solid/blob/ee49b3eee5f457a637075c4a3bbdcee013808fc3/packages/solid/package.json)); the references call it the "verified base" and call the previous base of the skill (commit `9a29b1a`) the "previous base". The runtime caveats apply to that base: check the installed exports and types before applying them to another version and, when the package ships the `skills/` folder, also read the official skill in `node_modules/solid-js/skills/solid-2.0/SKILL.md`. Solid 1 documentation and code in `next` can describe APIs missing from the package. The verification inventory is in the [README](README.md#verification-history). On 2026-11-17 the delta from that base to the stable `solid-js` 2.0.0 ([`a8186e6`](https://github.com/solidjs/solid/tree/a8186e6738b3a6a3341c561f66e9325432d6759b)) was checked against the installed packages; the passages it changed name 2.0.0.

## Mistakes the model tends to introduce

- Core and stores come from `solid-js`; DOM, `JSX`, `ComponentProps`, `render` and `hydrate`, from `@solidjs/web`. TSX uses `jsxImportSource: "@solidjs/web"`.
- `createEffect(compute, apply)` and `createRenderEffect(compute, apply)` have two phases. The apply returns a synchronous cleanup or `undefined`: use braces in `value => { setValue(value) }`. An implicit return of the setter can cause `REACTIVITY_HALTED`.
- A store setter receives a synchronous function. `setStore(d => { d.items = items })` mutates; returning the array or object of the assignment can replace the root and erase other keys. Do not keep the draft for later.
- `createSignal(fn)` creates a writable derivation. Writes publish on a microtask; a read right after the setter can still see the previous value. Writing in the body of a component, root or compute is forbidden in dev; `untrack` does not allow it.
- Components and structural callbacks do not rerun like React renders. Read props in the JSX or in a compute, without destructuring in the setup. A value prop uses `value={count()}`; a dynamic handler decides inside the callback, as in `onClick={e => (active() ? a : b)(e)}`.
- The apply of `createEffect` has no owner: return a cleanup instead of using `onCleanup` there. Primitives stay in the setup; a ref callback and `onSettled` do not allow creating them. Nested roots are disposed with the parent.
- Async sources are memos/stores read under `Loading`; capture dependencies before `await`. `refresh` receives the original source. `Loading.on` is a list of dependencies and rearms on every change it reads, without comparing values: `on={id()}`. A `Show` by status does not protect a memo that throws; the reader needs `Errored`.
- Actions are generators. After `await`, do an empty `yield` before writing or creating another wait. An `async` helper yielded with `yield` leaves the transaction at its first `await`: a write or `refresh` after that can publish in the middle of the action or keep it from settling. Return the result and do the writes and `yield refresh(source)` in the generator, or delegate to a generator with `yield*`. Optimistic state reverts on settle, even on success; a plain write in the same tick as the action can be held. `onFlush(() => ...)` (2.0.0) takes a write out of that hold: call it in a handler or an effect callback; in the component body it warns, use `onSettled`. Read the reference before implementing confirmation or overlapping submissions.
- Known Solid 1 APIs changed: `Suspense → Loading`, `ErrorBoundary → Errored`, `onMount → onSettled`, `mergeProps → merge`, `splitProps → omit`. `createResource`, `batch` and a store setter by path are not the API of this base. The context is the provider itself: `<Context value={value}>`, without `.Provider`.

## Read according to the task

| Task | Reference and main pitfall |
| --- | --- |
| Imports, types, plugin and compatibility | [01 environment](references/01-environment-imports-and-types.md): copies of the engine do not share tracking; JSX must use the right renderer |
| Signals, memo, ownership and scheduling | [02 reactivity](references/02-reactivity-and-ownership.md): held write, `latest`, dependencies after `await` |
| Effects and external resources | [03 effects](references/03-effects-and-lifecycle.md): owner per phase, cleanup and compute/apply errors |
| Props, defaults, children and context | [04 components](references/04-components-props-and-context.md): `merge` does not keep a default against an explicit `undefined` |
| Stores, projections and selection | [05 stores](references/05-stores-and-projections.md): proxy, identity, draft and reconciliation |
| Lists, Show, lazy and Portal | [06 lists](references/06-lists-control-flow-and-local-state.md): item/index change with `keyed`; moving a node can lose focus |
| Events, classes, refs and text | [07 DOM](references/07-dom-events-and-refs.md): handler fixed at mount, ref composition and numeric zero |
| Async, Loading, retry and error | [08 async](references/08-async-loading-errors-and-recovery.md): shared readers, provisional values and recovery |
| Cancellation and live sources | [09 cancellation](references/09-cancellation-and-live-sources.md): late work and invocation scope |
| Actions, optimism and confirmation | [10 actions](references/10-actions-optimism-and-confirmation.md): publication on click, reentry and out-of-order confirmation |
| Forms | [11 forms](references/11-forms-and-accessibility.md): select with late options and announcements under boundaries |
| SSR and hydration | [12 SSR](references/12-ssr-and-hydration.md): the effect compute runs on the server; a synchronous failure escapes before the stream; diverging text can go without a warning |
| Server functions | [13 server](references/13-server-functions-and-security.md): an outer wrapper may not protect the registered body; returning an Error does not sanitize it |
| Router and integrations | [14 routing](references/14-routing-and-architecture.md): `createRouter`, queries and the router action have their own contracts |
| Diagnostics | [15 diagnostics](references/15-diagnostics-checklists-and-recipes.md): the default build can silence warnings |
| Migration or old pattern | [16 migration](references/16-migration-from-solid-1.md): removed APIs and documentation divergences |
| Base-specific symptom | [17 risks](references/17-known-risks.md): observed limitations, hypotheses and historical upstream status |

For tests, use [skill-solidjs-testing](../skill-solidjs-testing/SKILL.md). Adaptable examples are in [examples](examples/README.md). The references tell observed behavior, documentation and inference apart; the historical tests do not ship with the package.
