# Environment, imports and types

## Packages and compatibility

Core, renderer, plugin and compiler must resolve to a compatible set. Check the resolved versions and the peers when changing that set; the range in the manifest does not prove the installed resolution.

Recipe: pin exact versions and the lockfile when updating; check the plugin resolution with the `why` of the project package manager (`vp why @solidjs/compiler`, `bun why @solidjs/compiler` or `pnpm why @solidjs/compiler -r`). A monorepo with several Solid packages, in client/SSR/Vitest:

```ts
resolve: { dedupe: ['solid-js', '@solidjs/web', '@solidjs/router', '@solidjs/signals'] }
```

Pitfall: independent engines do not track each other's signals, without an error. Check that `solid-js`, `@solidjs/web` and `@solidjs/signals` each resolve to a single real folder, that no package of the set is declared by dist-tag and that `@solidjs/router` is not from the 0.x or 1.x line. `--force`, overrides and relaxed peers do not prove compatibility. Do not update dependencies on every task. The Vite plugin installed with the stable base already dedupes `solid-js`, `@solidjs/web` and `@solidjs/signals` when they resolve from the root; the recipe still covers `@solidjs/router` and linked packages.

## Tags, plugin and compiler

Contract: on 2026-09-29, `latest` of `solid-js` and router picks Solid 1; `next` picks line 2. `latest` of web, signals, compiler and babel-plugin is behind the core; `next` of vite-plugin is older than `latest`. Update plugin/compiler together: the compiler of the verified base rejects `componentNames` (unknown option) and the vite-plugin installed with it already passes `sourceNames`; an old plugin with a new compiler breaks dev.

Recipe: tags: `npm view <package> dist-tags`; offline, the installed lockfile/manifest, tags not verified. After an update, test dev and production. The default backend is native; the babel compiler isolates JSX, but the other transforms require @solidjs/compiler.

Pitfall: a tag or the first package in the folder of the isolated layout of the package manager (`node_modules/.bun` in Bun, `.pnpm` in pnpm), which can keep several versions side by side, can pick another transitive RC; Babel does not remove the native compiler.

The core of the verified base still imports `ROOT_ERROR_HOOK`, `configureClientErrors` and `isStatic` from `@solidjs/signals`; an old transitive copy without those exports causes `MISSING_EXPORT`. Check with the `why` of the package manager (`vp why solid-js` and `vp why @solidjs/signals`, or the equivalent) before working around the error with aliases. The `^` range of the [core manifest](https://github.com/solidjs/solid/blob/ee49b3eee5f457a637075c4a3bbdcee013808fc3/packages/solid/package.json) does not guarantee alignment in the lockfile.

Delegated events also depend on that alignment: on the verified base, the renderer uses `node._$$click`; an old compiler that emits `node.$$click` produces handlers that never fire, without a build error. When investigating, compare the property emitted in the compiled JSX with the key read by the installed renderer.

## Origin of the APIs and types

Contract: stores/core; renderer and DOM/web types. The core Element is renderable, distinct from the DOM one. Use import type.

```tsx
import { createEffect, createMemo, createSignal, createStore, For, Loading, merge } from 'solid-js'
import type { Accessor, SourceAccessor, Setter, Signal, Store, Component, ParentComponent, VoidComponent, FlowComponent, Element } from 'solid-js'
import { dynamic, hydrate, Portal, render } from '@solidjs/web'
import type { ComponentProps, JSX, ValidComponent } from '@solidjs/web'
```

Recipe: a SolidElement alias tells it apart from the DOM. The `server-only`/`client-only` markers make the build refuse imports in the wrong direction.

Pitfall: `solid-js/store`, `solid-js/web` and `solid-js/types/*` are not entries of this base. Public map on the stable base: `.`, `./refresh`, `./attribution`, `./internal`, `./internal/container-trace` and `./package.json`, but `internal*`, `dist`, `src` and direct imports of `@solidjs/signals` are not application APIs. `mergeProps` from web is internal to the compiler; use `merge`. Environment markers do not authorize access on the server.

The old patch mode (`patchDriver`, `wrapPatchMode`, `registerPatch`, `registerRowOps`, `registerSlotPatch`, `patchableRaw`) was removed from the compiler and the runtime on this base, without an equivalent public replacement.

## Configuration and builds

Compiled web TSX uses `jsx: 'preserve'` and `jsxImportSource: '@solidjs/web'`, with `@solidjs/vite-plugin`:

Recipe:

```ts
import { defineConfig } from 'vite'
import solid from '@solidjs/vite-plugin'
export default defineConfig({ plugins: [solid()] })
```

Contract: export conditions vary by worker, browser, deno and node, with the priority `development`, then `observe`, then default, even outside those environments. `resolve.conditions: ['development']` or `['observe']` selects the tier. Production uses the `default` branch, without `development` or `observe`; there is no condition called `production` ([production build](../../skill-solidjs-testing/references/vitest-config.md#production-build)). Web repeats that even in `server-functions` and `frames`; the 19 entries of the stable base resolve to existing files (the verified base had 15; the frames tiers `./frames/trace`, `./frames/regions`, `./frames/assets` and `./frames/wire` came in after it, and the `node` branch of `./performance-tracks` only has `default`). Node without `browser` uses the server. Configure Vitest as a client; do not force browser in the SSR.

Pitfall: the basic plugin installs no router/server/deploy. Keep the adapters; avoid vite-plugin-solid/babel-preset-solid. `react-jsx` with `@solidjs/h` belongs to another rendering. Vite does not run tsc; check types and production (optimizations, diagnostics and sanitization differ). Libraries: emit/test declarations in a consumer; `skipLibCheck`, stubs or an old TS do not validate the integration.

## Valid templates

Contract: native/Babel use validate true; an HTML restructuring that breaks the positional walk fails in the build.

Recipe: include tbody between table and tr in the source code.

Pitfall: `<tr>` directly in `<table>` produces `HTML provided is malformed`. Turning off validate moves the risk to the runtime.

## Components and native attributes

Contract: `Component<P>` does not add children; `ParentComponent<P>` accepts optional children; `VoidComponent<P>` forbids them; `FlowComponent<P, C>` declares children/render prop. Declare required children explicitly. A readonly domain array, an array of stores and children are distinct.

Recipe:

```tsx
type Props = ComponentProps<'button'> & { variant?: string }
function Button(props: Props) {
  const nativeProps = omit(props, 'variant')
  return <button {...nativeProps} data-variant={props.variant ?? 'primary'} />
}
```

Pitfall: redefining class/disabled/children loses the native contract. For an attribute controlled by the wrapper, declare `Omit<ComponentProps<...>, 'attribute'>` and its precedence in the JSX. Do not leak domain props into the HTML. Generics: prefer a declared function; a TSX arrow can require `<T,>`.

## Narrowing, signals and callbacks

Contract: TS treats each reactive call as new. Use the narrowed callback of `Show` or capture inside the tracked scope; `if (user()) user().name` does not guarantee narrowing.

Recipe: initialize for real when possible; make `createSignal<Item[]>([])` explicit. `createSignal<T>()` admits absence and, when T includes `undefined`, the setter can be called without an argument to clear it. Keep that overload in wrappers. A value receives `Exclude<T, Function>`; propagate that limit in generic primitives. Stored functions require a function layer at creation and in the setter. An async source delivers an `Accessor<T>` resolved by the graph, not a `Promise<T>`.

Pitfall: `Setter<T>` accepts a value or an updater and returns the written value; it is not equivalent to `(value: T) => void`. Implicit return: the apply receives an invalid cleanup; the store can replace the root. Strict tsc refuses both, including `push`/primitive assignment in the store, which the runtime ignores. Use braces. MemoOptions in the type of the verified base: `id`, `name`, `equals`, `unobserved`, `lazy`, `transparent`, `sync` and `loadingValue`, plus `loc` on the stable base, which the compiler writes and code does not (the JSDoc of `createMemo` lists only the first six); the hydration augmentation of `solid-js` adds `ssrSource` (`'server' | 'hybrid' | 'client'`) and `deferStream`, which `HydrationMemoOptions<T>` repeats. `_plumbing` is internal.

Contract: TS accepts async in a position that is only `() => void`, such as `onCleanup`. The effect apply and `onSettled` return `void | (() => void)` and refuse async/implicit return under strict tsc. Acceptance does not prove a synchronous cleanup. Avoid !/casts/copies of props in the setup to silence types.

## Events, errors and trust boundaries

Contract: use `JSX.EventHandler<T, E>` or `InputEventHandler`, `ChangeEventHandler`, `FocusEventHandler`, importing JSX from the renderer. `JSX.InputEventHandler<HTMLInputElement, InputEvent>` catches an incompatible element/event better than a cast of `Event`. The `Errored` fallback receives an `ErrorAccessor`: read `err()`. `JSX.Element` excludes functions; it includes a rendered element, arrays, string, number, boolean, null and undefined; the rendered element refuses objects with `call`, `apply` or `bind`.

Recipe: invoke the function that returns JSX explicitly or use a dynamic component, without inserting a raw reference.

An error caught outside the graph does not reach `Errored` automatically.
