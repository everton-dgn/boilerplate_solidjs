---
name: skill-solidjs-testing
description: "SolidJS 2 tests in Vitest (happy-dom, jsdom, browser mode, SSR): create, review and debug tests of TSX, signals, stores, actions, async and hydration. API contracts: skill-solidjs. Out of scope: Solid 1, SolidStart."
metadata:
  compatibility: "The Vitest and @solidjs/vite-plugin of the project; browser mode requires a provider and a browser already installed. Use with skill-solidjs. Does not install tools."
  skill-version: "2.3.0"
  verification-date: "2026-09-25"
---

# SolidJS 2 tests with Vitest

The API contracts are in [skill-solidjs](../skill-solidjs/SKILL.md); this skill covers the pitfalls of observing them in tests. The historical base is in the [manifest](https://github.com/everton-dgn/boilerplate_solidjs/blob/eeaed3ff596fa201a7a3fb7aa10afcee63a77489/package.json) and the [verification lockfile](https://github.com/everton-dgn/boilerplate_solidjs/blob/eeaed3ff596fa201a7a3fb7aa10afcee63a77489/pnpm-lock.yaml); current versions come from the project manifests. When changing the plugin or the runner, check the [posture of each project](references/vitest-config.md#posture-canary).

## Pitfalls that fake the result

- `environment: 'node'` makes the plugin load the server build: a memo does not recompute and an effect does not apply. For a client graph without DOM, leave `environment` out and use `extends: true`; projects that test Solid/TSX need `solid()`. Node modules without TSX or a graph can skip the plugin.
- `NODE_ENV=test` keeps the dev build even with `solid({ dev: false })`. Production requires a [separate run](references/vitest-config.md#production-build).
- In test mode, the plugin compiles `hydratable: false` even with `ssr: true`. SSR in Vitest and hydration of a served build are different proofs.
- The scheduler uses `queueMicrotask`. Do not include it in `toFake`; `flush()` drains synchronous work without resolving Promises. Use the [wait table](references/settle-and-wait.md#settling-table).
- An uncontained error can stop the engine for the following tests. `createRoot` does not recover the halt; `render` only does it in dev. Tests that cause a halt need [isolation and reset](references/mount-dispose-diagnostics.md#reactive-halt).
- Do not mock `solid-js` or `@solidjs/web`. In the default plugin configuration in test mode, the engine is inlined in the server and client projects run on Node; `vi.resetModules()` followed by a new import can duplicate it. Check the exceptions and the precautions in [mocks and types](references/mocks-coverage-types.md).

## Choose by the proof you need

| Contract | Environment and reference |
| --- | --- |
| Signals, memos, stores and actions without DOM | Client without `environment`, with `extends: true`, or a DOM project; [reactivity](references/reactivity.md) |
| Components and props | happy-dom or jsdom; [mount and dispose](references/mount-dispose-diagnostics.md) |
| Isolated page and in-memory router | DOM project; [routes and cache between tests](references/pages-and-routes.md) |
| Focus, layout, real events and numbers as the only child | Browser mode; [environment limits](references/environments.md) |
| `renderToString`, `renderToStream`, request scope | `node` project with the plugin; [server](references/server-hydration.md) |
| Hydration and server functions over HTTP | E2E against a served build; [server and hydration](references/server-hydration.md) |
| Absence of warnings and errors | Dev build, capture covering dispose and microtasks; [diagnostics](references/mount-dispose-diagnostics.md#capture-diagnostics) |
| Configuration, production and Vite+ | [Vitest configuration](references/vitest-config.md), including an empty project that passes in the combined run |
| Fake timers and order between Promises | [Settling and waiting](references/settle-and-wait.md) |
| Types and helper libraries | [Mocks and types](references/mocks-coverage-types.md); `vitest run` alone does not check `expectTypeOf` |

Canaries and negative controls serve to check a new harness or investigate a false positive. Reuse the ones of the project when they exist; an ordinary change does not require creating a canary, mutant or standardized report.
