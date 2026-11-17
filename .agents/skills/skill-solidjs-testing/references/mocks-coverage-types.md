# Mocks, helper libraries and types

## Mock at the I/O boundary

Mock the HTTP, SDK or database adapter, keeping the real `solid-js` and `@solidjs/web`. An alias of a virtual module, `server-only` or a generated route serves the isolated test, but does not prove the replaced integration.

## `vi.resetModules` and engine instances

With the default configuration of the installed plugin in test mode, `solid-js` and `@solidjs/web` are inlined both in the server project and in the client projects run on Node. In the server branch, the plugin only adds its list when `server.deps.inline` has no truthy value. In the client branch, `inline: true` already includes every dependency; an entry of `server.deps.external` matching `solid-js` prevents the plugin list from being injected. `vi.resetModules()` followed by a new import can create another engine for the inlined modules: the owners of one instance become invisible to the other, without a warning. When reimporting a module that captures the environment, reimport the engine and every consumer together.

## Helper libraries

- Check the peers of `@solidjs/testing-library` for the installed Solid. In the [examined preview](https://www.npmjs.com/package/@solidjs/testing-library/v/1.0.0-beta.3), `fireEvent.click` still waits for `flush()`, automatic cleanup requires `globals: true` and `render(..., { hydrate: true })` throws in the test posture; the current compatibility was not checked. The [mount helper](mount-dispose-diagnostics.md#mount-with-guaranteed-disposal) covers the common case.
- `@solidjs/diagnostics` requires the dev build and a compatible engine version; check the installed exports before importing matchers.

## Type tests

`vitest run` can pass with a wrong `expectTypeOf` assertion. Run the typecheck that includes the file to check that contract. When setting up that harness, a wrong assertion with `@ts-expect-error` lets you check that the file takes part in the check.
