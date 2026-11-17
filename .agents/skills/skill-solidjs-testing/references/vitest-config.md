# Vitest configuration for Solid 2

The verified base is in the [manifests linked by the skill](../SKILL.md). After updating dependencies, run the canaries before trusting this page.

## Posture decided per project

`@solidjs/vite-plugin` decides the posture in the `config` hook, from the `test.environment` declared in the project itself. Projects that transform TSX or exercise the Solid runtime need their own `solid()` instance. A Node project of modules without TSX or a graph can skip it.

| Project | Posture | Use for |
| --- | --- | --- |
| No `environment`, with `extends: true` | client on Node, without DOM | signals, memos, effects, stores, actions |
| `environment: 'happy-dom'` (or `'jsdom'`) | client; jest-dom injected if installed | components, pages with an in-memory router |
| `browser.enabled` with Chromium | client | real events, focus, layout, numbers in the DOM |
| `environment: 'node'` | server (`server.dev.js`) | `renderToString`, `renderToStream`, server modules |
| No `environment` and no `extends` | inherits the root configuration; with `solid()` and no inherited explicit environment, client on Node, without DOM | client graph, after checking the inherited options; the plugin does not set `test.environment` |

Pitfalls of the wrong posture:

- A primitive in a `node` project: the memo does not recompute (2 instead of 4), the effect never applies and the setter warns `SERVER_WRITE`.
- A `node` project without the plugin does not transform TSX. It is still right for server modules without TSX or a reactive graph.
- `renderToString` in a DOM project returns `undefined` and logs `renderToString is not supported in the browser`.
- An inline project with `extends: false` does not inherit `resolve`, `alias`, `define` or `plugins` from the root: aliases such as `@/` fail until the config is repeated. Without `extends`, Vitest inherits the root and merges the arrays; do not register the same plugin or setup in the root and in the project.

## Reference configuration

Merge it with the configuration of the project; do not replace `vite.config.ts`.

```ts
// vitest.config.ts
import solid from '@solidjs/vite-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// In mode 'test' the plugin compiles with hydratable: false, even with ssr: true.
export default defineConfig({
  test: {
    projects: [
      {
        // No `environment`: 'node' would switch the plugin to the server posture.
        extends: true,
        plugins: [solid()],
        test: { name: 'client-graph', include: ['tests/**/*.graph.test.ts'] }
      },
      {
        extends: true,
        plugins: [solid()],
        test: { name: 'dom', environment: 'happy-dom', include: ['tests/**/*.dom.test.{ts,tsx}'] }
      },
      {
        extends: true,
        plugins: [solid()],
        test: {
          name: 'browser',
          include: ['tests/**/*.browser.test.{ts,tsx}'],
          browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] }
        }
      },
      {
        extends: true,
        plugins: [solid()],
        test: { name: 'server', environment: 'node', include: ['tests/**/*.server.test.{ts,tsx}'] }
      }
    ]
  }
})
```

In a symlinked package or a monorepo, check that `solid-js`, `@solidjs/web` and `@solidjs/signals` resolve to a single copy; use `resolve.dedupe` when the canary shows `sameOwnerApi: false`.

## Count per project

`passWithNoTests: false` only fails when no project collects a file; a project with a wrong `include` collects zero and the run passes silently. Check the count with `vitest list --json` grouped by `projectName`, or run `vitest run --project <name>` in CI, which exits with 1 when the project is empty.

## Posture canary

When creating or changing the configuration, or investigating a test that uses the wrong build, check posture, build and single instance. Reuse the canary of the project, if there is one; without it, this recipe provides the identification:

```ts
// support/runtime-identity.ts
import * as solid from 'solid-js'
import { getOwner } from 'solid-js'
import { getOwner as webGetOwner, isServer } from '@solidjs/web'

export type RuntimeIdentity = { isServer: boolean; dev: boolean; sameOwnerApi: boolean; hasDocument: boolean }

export const readRuntimeIdentity = (): RuntimeIdentity => ({
  isServer,
  dev: solid.DEV !== undefined,
  sameOwnerApi: webGetOwner === getOwner,
  hasDocument: typeof document !== 'undefined'
})
```

| Project | `isServer` | `dev` | `sameOwnerApi` | `hasDocument` |
| --- | --- | --- | --- | --- |
| client-graph | `false` | `true` | `true` | `false` |
| dom and browser | `false` | `true` | `true` | `true` |
| server | `true` | `true` | `true` | `false` |

`sameOwnerApi: false` means two engine instances: the signals of one are not seen by the other.

## Production build

A run with `NODE_ENV=test` only exercises the dev build, even with `solid({ dev: false })`. For the production build, do a second run with `NODE_ENV=production` and `solid({ dev: false })`. Do not use `NODE_ENV=production` with the default plugin: the builds get mixed and `DEV` stays `undefined` even when running dev code.

```ts
// vitest.production.config.ts
// Run as: NODE_ENV=production vitest run --config vitest.production.config.ts
import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [{ extends: true, plugins: [solid({ dev: false })], test: { name: 'production', include: ['tests/**/*.production.test.ts'] } }]
  }
})
```

In production the development warnings go away, so their absence in that run proves nothing. A halt still calls `console.error('[REACTIVITY_HALTED]', cause)`.

## Imports in a Vite+ project

Vite+ reexports Vitest; the configuration stays in the `test` block of `vite.config.ts`.

| Vitest | Vite+ |
| --- | --- |
| `vitest` | `vite-plus/test` |
| `defineConfig` from `vitest/config` | `defineConfig` from `vite-plus` |
| `@vitest/browser-playwright` | `vite-plus/test/browser-playwright` |
| `vitest/browser` | `vite-plus/test/browser/context` |

Type extensions with `declare module 'vitest'` keep pointing to `vitest`.
