# Diagnostics and repair

Base: [verified revision](../SKILL.md), reverified on 2026-09-29. How to test (Vitest, settling, fake timers, mounting, oracles, warning capture) is in the `skill-solidjs-testing` skill.

## Where the diagnostics show up

Contract: the installed `solid-js` package includes `CHEATSHEET.md` and the official skill `skills/reactivity-diagnostics/SKILL.md`, with one section per code. Also check whether it ships `skills/solid-2.0/SKILL.md`, the official API guide for agents, and read it along with these references. `DEV` exists in the development artifact; `OBSERVE`, in the development and observation ones; both are `undefined` in the default build. Channel: `error` means broken behavior and `warn` code that works but is wrong or costly; `info` events stay only in the structured channel, without the console (a `console.warn` spy does not see them); listeners run synchronously on emission; the first report of each code carries a footer with the repair guide, once per code and per module instance.

`solid-js/attribution` resolves the recorder in development and observe and an inert implementation in default. The existence of `attribution.enable` does not prove recording: check `OBSERVE.attribution.installed` and a record produced by a controlled interaction, and disable it at the end ([AttributionSlot](https://docs.solidjs.com/reference/solid-js/advanced/diagnostics-dev-hooks/observe#attributionslot)). Use the public surface of `OBSERVE`, without private nodes. `@solidjs/diagnostics` captures evidence for tests; check the installed exports before importing helpers.

Pitfall: silence in the default build does not prove the absence of a problem. Confirm the export conditions that the runner or bundler resolved before interpreting the console.

## Correctness and repair diagnostics

Look up the code in the installed guide and check the [documentation divergences](16-migration-from-solid-1.md#divergences-found-in-the-documentation-itself). The cases that deserve extra attention:

| Code | Pitfall |
| --- | --- |
| `REACTIVITY_HALTED` | It is the consequence of the first uncontained failure; it affects other roots |
| `REACTIVE_WRITE_IN_OWNED_SCOPE` | `untrack` does not allow a write in construction or compute |
| `RUN_WITH_DISPOSED_OWNER` | The warning does not prevent the run; check `isDisposed(owner)` before reentering |
| `INVALID_REFRESH_TARGET`, `INVALID_AFFECTS_TARGET` | An accessor wrapper and an arbitrary property do not keep the identity of the source |
| `SERVER_WRITE` | In a client reactivity test, it can reveal a server build loaded by mistake |
| `INVARIANT_VIOLATION` | On the verified base, only the dev build emits it, in an internal check of owner disposal (`owner-chain-head`); it points to a bug in the engine, not in the app: report it upstream with a reproduction (on the previous base no artifact emitted it) |

On the server, `SSR_RENDER_ERROR_CONTAINED`, `SSR_STREAM_ABANDONED`, `SSR_SUBTREE_ABANDONED`, `LATE_HEADER_WRITE` and `SERVER_ERROR_SANITIZED` also exist in the observe build. `SSR_BOUNDARY_WATERFALL`, `SSR_CLIENT_CONTENT_MASKED`, `SSR_LIVE_HOLE_LATCHED` and `SSR_UNDECLARED_LIVE_SOURCE` are development only. `FRAME_MARKER_CORRUPTED` happens in the frames client, in the observe and development builds. The installed package carries the availability of each code in `node_modules/solid-js/diagnostics.json`. `SERVER_ERROR_SANITIZED` merges the old `SERVER_FN_ERROR_SANITIZED` and `SSR_ERROR_SANITIZED` of the previous base: `data.source` is `"server-function"` (server function runtime) or `"ssr"`.

Outside the union: `FLUSH_IN_ACTION` is an exception thrown in dev by `flush()` in the body of an action (in default the drain is skipped without an error; observe the result after the action settles). `flush()` also throws inside `onSettled` or `createTrackedEffect` ("Cannot call flush() from inside onSettled or createTrackedEffect") and in the `apply` of `createEffect` it becomes a no-op with `FLUSH_IN_EFFECT_CALLBACK`; in a test that fires a synchronous event in those scopes, drain with `queueMicrotask(() => flush())`. `StatusError` is not an export of `solid-js`: an imperative read of a source with an error throws that wrapper with the original in `cause`; compare `err.cause` by identity ([async errors](08-async-loading-errors-and-recovery.md)).

Pitfall: there is no reliable lint for a reactive read after `await`, because `Accessor<T>` is structurally `() => T`. After the previous base, dev started warning `UNTRACKED_READ_AFTER_AWAIT` on the first read at runtime; the default build does not warn. Cover it with review and a test that changes the signal after the `await` and checks whether the async memo or effect ran again. Do not turn every warning into a failure nor the absence of an exception into correctness; fix the origin and repeat with diagnostics on.

## Cost diagnostics

They come from the attribution recorder and describe cost, not error. `HUGE_FAN_OUT` suggests a wide publication; on the verified base it absorbed the old `WIDE_WRITE`, which left the code union, and the recorder emits it before the core limit (the `fanOut` option, formerly `wideWrites`). `HUGE_FAN_IN` and `WIDE_SCOPE_DEPS` point to a scope that reads too much. `HOT_SCOPE_RERUNS`, `HOT_SCOPE_FANOUT` and `HOT_SCOPE_TIME` tell frequency, multiplication and time apart. `UNSTABLE_MEMO_OUTPUT` points to a memo that returns a new but shallow-equivalent object or array for `unstableMemos` runs in a row (4 by default; `enable({ unstableMemos: n })` adjusts it, `false` turns it off; `Promise`, `Date` and `Map` are ignored). `ASYNC_WATERFALL` shows an observed chain, it does not prove possible parallelism; depth 2 is `info`, outside the console.

Recipe: name the investigated memos and effects; `why(scope)` and `subscriptions(scope)` give causes and dependencies, `costs()` the attributed cost. `graphSize()`, new on the verified base, returns `{ roots, owners, computations, signals, edges }` of the live graph and also counts a computation without an owner kept alive only by its sources, the subscription leak; in the production build the entry is inert and returns zeros. Owner paths show the origin of a run; boundary paths, where the error was handled. Compare absolute time in the profiler of the production artifact; intermediate reactive passes do not prove a painted frame. Reading: [debugging](https://docs.solidjs.com/guides/debugging-reactivity#something-updates-too-often) and [performance](https://docs.solidjs.com/guides/performance#measure-before-changing).

With `solid({ diagnostics: true })` in the plugin, the dev server exposes `POST /__solid/diagnostics` with `{ method: 'begin' | 'end' | 'whyDidRun' | 'costs' }` to capture sessions from a browser test; dev only, a no-op in production. Autodetection of `@solidjs/diagnostics`: the `apply` hook of the diagnostics plugin is suppressed in `mode: 'test'` (the Vitest mode, browser mode included) and outside `command: 'serve'`; without the package declared in the `package.json` of the app, `transformIndexHtml` injects nothing, not even in dev. An explicit `diagnostics: true` skips the `package.json` check, without undoing the suppression in `mode: 'test'`.

## Errors in production

`configureClientErrors({ onError })` observes failures handled on the client; `configureServerErrors({ onError })`, on the server. Apply, compute, event and transport failures have different paths; test what the monitoring receives and record metadata and correlation without payloads.

Pitfall: on the server, the return of the hook can become the value sent to the client without new sanitization; a handler that only logs returns `undefined`. Compiler or runtime failures and renamed properties can show up only in the built artifact. In subprocesses, a termination signal and a spawn error are a failure, not a zero exit.
