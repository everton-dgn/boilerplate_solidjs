# Backend calls and their use in pages

[Back to the main guide](../server-errors.md)

## Adding a call

Use `requestJson` inside a server function, with a schema that selects the
public fields. The block below is the simplified form of the
[readBackend fixture](../../src/tests/fixtures/e2e/backend-error/readBackend/index.ts),
the reference call; the fixture adds the failure scenarios that the E2E tests
trigger and, like the other fixtures that use the transport, only goes into the
E2E build:

```ts
import * as v from 'valibot'

import { requestJson } from '@/infra/server/requestJson/index.ts'

type BackendData = { message: string }

export async function readBackend(id: string): Promise<BackendData> {
  'use server'
  return requestJson({
    url: `http://127.0.0.1:4318/data?id=${encodeURIComponent(id)}`,
    schema: v.object({ message: v.string() })
  })
}
```

The address is the one of the test backend. In a real integration, resolve the
address on the server and define the public output. `v.object` removes extra
fields; permissive schemas do not replace that selection. An HTTP 500 status
does not reject `fetch`: `requestJson` checks `response.ok` and cancels the
failure body without reading it. Network failures, invalid JSON and schema
failures are protected too. The transport applies a 10 s timeout (combined with
`init.signal`, when given) and refuses bodies over 1 MB, cancelling the stream
before reading it whole.

For an SDK or a database, create an adapter in `infra/server` with `server-only`
and wrap the whole operation in `protectServerOperation({ run })`, including the
read, the validation and the building of the output. Add the package to the
import restrictions of the lint, with an exception only for the adapter and the
test of the protection.

The sitemap sources (`route.info.sitemap`) follow the same rule: the function
declared in the route calls a server function, which does the protected read and
returns only `path` and `lastmod`. The source receives an `AbortSignal` that
aborts at the 10 s deadline, when the client disconnects and at the end of the
read of the sources; pass it to the read (for example, in `init.signal` of
`requestJson`) to cancel it. The sitemap route answers 503 without a body to any
failure and logs, under the `sitemap` source, the fixed line
`[sitemap] Unexpected failure; private details omitted`, with the class and the
frames described in [Failure log](logging.md#failure-log), without the error
message.

Partitioned sources live in the `src/infra/server/sitemapSources/` registry,
outside `route.info` and the client bundle. Their callbacks also use the
protected adapters for databases and SDKs and pass the signal to the query. The
index lists public IDs, and the read of a part returns only its batch of `path`
and `lastmod`. Failures still use the empty 503 response and the same fixed log.
A removed or empty part answers 404 with `no-store`; the difference between the
previous index and that read is part of the eventual consistency described in
the [SEO guide](../seo/sitemap.md#partitioned-sources).

Never copy `error.message`, `cause`, properties, the upstream body or the
validator issues to the output. For a public failure, use `createPublicError()`.
Only `publicErrors` may use `markSafeError`, which allows the whole error to be
serialized. The wrapper always creates another error, even if the previous one
was public, to drop fields added later. New domain messages require an explicit
extension of this contract and tests.

The result accepts simple values, plain arrays and resolved plain objects.
Arrays must have `Array.prototype` as their direct prototype; subclasses are
refused before the inherited serialization can change the checked output.
`Error`, classes, cycles, getters, setters and nested promises are refused too,
including under `Symbol` keys and in non-enumerable properties. Shared
references (an acyclic graph) are accepted and checked once. A top-level promise
is awaited, and synchronous functions stay synchronous. This structural check
does not find confidential data in strings: the schema and the mapping are still
responsible for the business fields.

`allowControl: true` belongs only to the global registration. It keeps
suspension, responses without a body (except the one of `Response.error()`, with
status 0) and envelopes with checked data; the envelope body is rebuilt from
that data. Headers and destinations must be defined by the application. Adapters
do not turn this option on or forward upstream responses. The logs, written by
`logServerFailure`, have the fixed message of the source and, for an `Error`,
only the class and the frames described in
[Failure log](logging.md#failure-log), without the message, `cause`, properties
or request context. Detailed diagnostics and telemetry require their own
integration.

## What the lint covers

[backendPolicy](../../tooling/backendPolicy/index.ts) configures the native
Oxlint rules `no-restricted-globals`, `no-restricted-properties`,
`no-restricted-imports` and `no-console` in `src`, fixtures included, for the
`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` and `.cjs` extensions:

- Restricts `fetch` to the transport and bars direct access to `XMLHttpRequest`,
  `WebSocket` and `EventSource`, static global properties included.
- Restricts the known Node transports and `undici`.
- Reserves `markSafeError` and `SAFE_ERROR` for `publicErrors`, and the whole
  server function configuration and dispatch module
  (`@solidjs/web/server-functions` and `@solidjs/web/server-functions/server`)
  for `configureServerErrors`. Importing `configureServerErrors` from the
  `@solidjs/web` root is also restricted to that module, `publicErrors`
  included: each call replaces the global server error hook.
- Reserves `observeRenderFailures`, from
  [renderIntegrity](../../src/infra/server/renderIntegrity/index.ts), for
  `configureServerErrors`, through an alias, namespace or re-export too: after
  that call the render state starts without errors, and only the registration
  installs the hook that marks it.
- Reserves the global `console` object for `logServerFailure`, aliases and
  direct destructuring included. In that file, use only `console.error`
  directly; access through `globalThis.console`, `window.console`,
  `self.console` and `global.console` stays forbidden. The tests require a
  single argument, a string that starts with the fixed message of the source and
  carries no message, `cause` or properties of the error. Aliases of `console`
  and other loggers require review.

The regression tests require `no-restricted-imports` to also refuse
`import("package")` when the whole package is restricted. The policy does not
rely on `importNames` restrictions for that loading. That is why
[backend/static-solid-imports](../../tooling/backendPolicy/plugin.ts) requires
static imports of `@solidjs/web` and its subpaths, in `publicErrors` and
`configureServerErrors` too; `backend/static-render-integrity-imports` does the
same with `renderIntegrity`, because a restriction by name does not reach
`import()`. The rule checks strings and templates without interpolation; the
public APIs of that package stay available through a static import.

Named imports with an alias, re-exports and direct access through a namespace
are checked too. Visual libraries, local methods called `fetch` and local
parameters with that name are allowed. Tests and type declarations are outside
these backend restrictions. The exceptions of the adapters use exact paths;
copying a privileged module to another extension does not grant the same
permission.

The lint does not do a full flow analysis: aliases of the global object, such as
`const g = globalThis`, computed import sources, templates of packages outside
`@solidjs/web`, unknown SDKs and manual marking through `Symbol.for` require
review. It also does not restrict `allowControl` by name or check the content of
the log arguments in `logServerFailure`. Do not use these gaps or a disable
comment to get around the contract. The pattern of relative imports is shared
with `tooling/lint/rules/javascript.ts` through the
`RELATIVE_IMPORT_RESTRICTION` constant, in `tooling/backendPolicy/constants.ts`.

## Use in pages

After protecting the server function, use `query` for the data cache and read
its result in the component. With the `readBackend` function of the example
above:

```tsx
const getBackend = query(readBackend, 'backend')

export default function Page() {
  const data = createMemo(() => getBackend('example'))
  return <h1>{data().message}</h1>
}
```

Import `query` from `@solidjs/router` and `createMemo` from `solid-js`. The
global `Errored` of `App` replaces the application and the header with the
fallback when that read fails. The recovery by reload is described in
[validation and recovery](recovery.md#validation-and-recovery).
