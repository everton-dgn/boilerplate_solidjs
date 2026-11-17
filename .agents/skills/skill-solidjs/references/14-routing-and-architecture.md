# Routing, integrations and architecture

Base: [verified revision](../SKILL.md), with the `@solidjs/router` installed with it, reverified on 2026-09-29. A different version requires a new proof.

## Compatibility per package

Contract: core, renderer, compiler and router have their own contracts and versions; the valid set is the one resolved in the lockfile. The Solid 2 core took in server functions and parts of the HTTP flow, but that does not decide routing, per-route cache, deploy or authentication.

Pitfall: a package that accepts Solid 1 in `peerDependencies` does not become compatible just because its name contains Solid. The `latest` tag can stay on the Solid 1 line while a preview channel serves Solid 2; an exact peer of one RC does not accept another RC; an accepted semver range does not prove it works (Solid Query and Kobalte require checking per release). Check `npm view <lib> peerDependencies` (or `bun info <lib> peerDependencies`) before adopting. A library can compile JSX and fail at runtime because it depends on `onMount`, a single-phase effect, a setter by path or an old owner. Look for duplicated copies of `solid-js` and `@solidjs/signals`, above all in workspaces and linked packages. Do not force away peer warnings nor create aliases to internal paths: the ways out are a compatible version, a small documented adaptation, a replacement or keeping the current version.

## Router 2: installed surface

Contract: the installed router exports

- mounting: `createRouter`, `defineRoute`, `defineRoutes`, `browserHistory`, `hashHistory`, `memoryHistory`;
- navigation and reading: `useNavigate`, `useLocation`, `useParams`, `useSearchParams`, `useMatch`, `useRouteMatches`, `useHref`, `useResolvedPath`, `useIsRouting`, `useLinkState`, `usePreloadRoute`, `useBeforeLeave` and `createBeforeLeave(): BeforeLeaveLifecycle` (`subscribe(listener)` returns the cancellation and `confirm(to, options?)` returns a boolean; it is the guard that `useBeforeLeave` installs on demand in the router, so prefer the hook);
- data: `query`, `revalidate`, `formAction` (the installed router keeps `action` as a deprecated alias), `useAction` (deprecated: call the server function or the `action` of the core), `useSubmissions` and `liveQuery` (experimental).

There is no `Router`, `Route`, `A`, `Navigate`, `createAsync`, `createAsyncStore`, `useSubmission`, `cache`, `json`, `createMemoryHistory` or `MemoryRouter`. The `Router` of the recipe is the instance returned by `createRouter`, used as a component in a real host, with explicit children: `render(() => <Router>{props => props.children}</Router>, host)`; `render()` receives a `MountableElement`, not an options object. `redirect`, `reload` and `respond` come from `@solidjs/web`. `viewTransition` and a hook such as `useViewTransitionState` do not exist; compose a wrapper over `document.startViewTransition`. The router installed with the verified base also exports `serverRouteComponent`, experimental and missing from the router of the previous base; its contract was not validated in this skill. `createResource`, `createAsync` and `createAsyncStore` do not exist in `solid-js` either: an async read goes through `query(fn, name)` read by `createMemo`, `createProjection` or `createOptimistic`, under `Loading`/`Errored`.

Recipe:

```tsx
import { For, Loading, createMemo } from "solid-js"
import { createRouter, query } from "@solidjs/router"

type Todo = { id: string; title: string }

declare function fetchTodos(): Promise<Todo[]>

const getTodos = query(fetchTodos, "todos")

function Todos() {
  const todos = createMemo(() => getTodos())
  return (
    <Loading fallback={<p>Loading</p>}>
      <ul><For each={todos()}>{todo => <li>{todo.title}</li>}</For></ul>
    </Loading>
  )
}

export const Router = createRouter({ routes: [{ path: "/", component: Todos }] })
// render(() => <Router>{props => props.children}</Router>, container)
```

Rules backed by the installed code:

- `query(fn, name)` returns a function with `key` and `keyFor(...args)`; `revalidate(getTodos.key)` invalidates every entry, `revalidate(getTodos.keyFor(id))` only one.
- The `formAction` of the router has `url`, `with(...args)`, `onSubmit(hook)` and `onSettled(hook)`. `.onSubmit` runs inside the optimistic transaction; write the overlay in that hook. The generator action of `solid-js` has another contract, without `.with`.
- A programmatic call of the action can reject even after recording the error in `useSubmissions`; handle the Promise in the handler. Observing the history does not contain the rejection.
- An action that ends without an error and without metadata revalidates every query; with `X-Revalidate`, only the declared keys; if it throws, none (reading of the code, without a runtime test). `X-Revalidate: *` is equivalent to `REVALIDATE_ALL` of `@solidjs/web`; named keys use prefix-match; an empty list matches nothing. Test the cache after the invalidation: checking only the header gives a false green.
- A server function read by `query` that travels as GET needs `GET(fn)` in the server module; without it, GET answers 405 with `Allow: POST`.

Pitfall: in a `<form action>` with a bound action, the arguments go serialized in the `args` parameter of the URL. Use only values suitable for that exposure and validate and authorize on the server; binding an id on the client does not prove permission.

### Router migration map

| Before (Solid 1) | Installed Router 2 |
| --- | --- |
| `<Router root={App}>` with `<Route>` | `createRouter({ routes: [...] })` and `<Router>{props => ...}</Router>`; routes as objects, children in `children` |
| `<HashRouter>`, `<MemoryRouter>` | `createRouter({ routes, history: hashHistory() })` or `memoryHistory("/initial")` |
| `<A href>` with `activeClass` | a plain `<a href>`; style through `[data-active]` and `[aria-current="page"]`; `noscroll` in the JSX (the only spelling typed on the verified base, like `link`, `state` and `replace`; the previous base typed `noScroll`), which the router reads |
| `<Navigate>` | `useNavigate()` in the setup or a redirect in the preload |
| `useCurrentMatches` | `useRouteMatches` |
| `createAsync`, `createAsyncStore` | `createMemo`, `createProjection`, `createOptimistic` or `createOptimisticStore` reading the `query` |
| `cache` | `query` |
| `useSubmission` | optimism through `.onSubmit(...)` and history through `useSubmissions(...).at(-1)` |
| `json(data, init)` | `respond(data, init)` from `@solidjs/web` |
| `redirect`, `reload` of the router | the same ones from `@solidjs/web` |

## Pitfalls of the installed router

- `useLocation`, `useParams` and `useNavigate` resolve the `<Router>` context on the call and throw without it. Call them in the body of the component, under the provider, and keep the value; a handler or a late getter can run outside the context.
- A trailing slash is ignored in the active route comparison: `<a href="/admin/">` gets `[aria-current="page"]` and `[data-active]` on `/admin`, `/admin/` and descendants such as `/admin/users`.
- `useBeforeLeave` exposes a single event per navigation: the listeners share `defaultPrevented` and each one reads the state left by the previous ones. Every listener whose route has unsaved changes calls `e.preventDefault()`, whatever its depth. Before it opens a confirmation, a dirty listener reads `e.defaultPrevented` and skips its prompt when an earlier listener already prevented the navigation. A `retry(true)` skips every remaining guard, so one confirmation must cover the unsaved changes of all dirty routes. Relying only on the innermost listener lets the navigation discard the edits of an outer route when the inner one is clean.
- If the router already manages the loading, cache and cancellation of a query, do not add another cache layer per component; purely local state does not go to the router. Do not import `query` or a route loader from another package because a tutorial uses it.

## Granular reading, identity and ingestion

Contract: read the leaves the component needs. On the verified base of `@solidjs/web`, `style={state.style}` and `class={row.classes}` with a non-inline expression go through `readShallow`: changing one key of the object already rerenders the binding. Changing the identity stays the cheapest path for large changes.

Pitfall: `deep` on the whole store, a selector that walks thousands of records per keystroke or a snapshot to spread everything remove the granularity; destructuring in the body to "optimize" removes updates; wrapping everything in `createMemo` costs nodes. Comparing each row of a large list against a selection signal creates a wide fan-out; a map derived by key or a projection reduces invalidations, but only with a measured problem, and test the fidelity of the selection afterwards.

Use stable IDs to reconcile; choose `reconcile`/keyed to keep identity without hiding field changes. `shallow` serves immutable ingestion and large collections, it is not the default. Do not convert entities into proxies and back to JSON repeatedly; validate at the input, map to the domain and return from the server only what is needed.

Pitfall: in a monorepo, independent copies of `solid-js` break cross reactivity without a visible error (an `effect` of one copy does not track a `signal` of the other). Declare `solid-js`, `solid-js/*` and `@solidjs/web` as `external` in the build of an internal package; inside Vite, prefer `resolve.dedupe` ([environment](01-environment-imports-and-types.md)).

## Cost diagnostics

`SSR_BOUNDARY_WATERFALL` on the server points to serial waits inside a `Loading` (up to the previous base, `ASYNC_WATERFALL` covered both sides; now it is client only); `HOT_SCOPE_FANOUT` on the client aggregates hot scopes by root cause. `markFlight(promise, startedAt)`, from `solid-js/attribution`, records the start of a fetch. Use and limits in [diagnostics](15-diagnostics-checklists-and-recipes.md#cost-diagnostics).
