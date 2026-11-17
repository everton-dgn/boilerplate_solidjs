# Server, stream and hydration

Contracts in the main skill: [SSR and hydration](../../skill-solidjs/references/12-ssr-and-hydration.md) and [server functions](../../skill-solidjs/references/13-server-functions-and-security.md).

## In Vitest

- `renderToString` and `renderToStream` only run in the `environment: 'node'` project with the plugin.
- The HTML of the test projects comes out without `_hk` keys, even with `solid({ ssr: true })`. Only `solid({ solid: { hydratable: true } })`, in a separate server project, returns the keys; assertions about hydratable HTML only hold in that project.
- End-to-end hydration stays outside Vitest: test it in the E2E against the build ([pages](pages-and-routes.md#e2e-with-playwright)). The hydration check runs in a `setTimeout`; wait for a macrotask before asserting the absence of a mismatch.
- For a stream, read the `readable` with a reader and a gate controlled by the test: the first chunk carries the fallback, and the content arrives after the release.

The streaming proof must observe the first chunk while the source is still blocked; only then release the Promise and consume the rest. Waiting for the full HTML before the assertion does not tell streaming from a held response.

Without a configured SSR project, use the existing E2E or add the test project relevant to the scope. A passing DOM test does not cover SSR.

## Server functions and request scope

A server function has three separate proofs: the domain function, the direct SSR call and the transformed HTTP call. A fixture that calls the original function without compilation only proves the first; the HTTP call needs the build and a server.

To exercise the handler inside Vitest, compose `createRequestEvent(request)` and `commitEventResponse(response, event)` from `@solidjs/web` with `provideRequestEvent` from `@solidjs/web/storage`:

- Use the [explicit provider and the handler options](../../skill-solidjs/references/13-server-functions-and-security.md#configuration-and-origin); relying on the initialization of another test produces a false positive.
- Pass `createEvent` to `handleServerFunctionRequest`, not to `configureServerFunctionsServer`, and assert a known value in `locals` before comparing identities: with empty `locals`, an authorization test passes with `undefined` on both sides.
- Test a guard shared by the explicit event and by the ambient scope (`getRequestEvent()`); proven on one path only, it can be broken on the other.

| Boundary | Observe |
| --- | --- |
| Sanitization | Whole body, HTML, chunks and serialized payload without the confidential marker. Compare dev and production: dev keeps the original message under `Errored` and under `Loading` without `Errored` |
| Synchronous failure in the render | Throws in the very call of `renderToString` or `renderToStream`, before a stream exists; the HTTP layer must protect that exit |
| Request scope | Two concurrent requests with distinct states |
| `httpStatus` and `httpHeader` | Status and header of each scope before and after disposal ([contract](../../skill-solidjs/references/12-ssr-and-hydration.md#status-headers-cookies-and-cache)) |
| `clientOnly` | Server HTML with only the fallback and the loader not called on the server |

Use a synthetic marker to test leaks.
