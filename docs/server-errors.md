# Server errors and backend calls

[Back to the README](../README.md)

Every backend call must deliver public data or a new public error before it
reaches Solid. This rule also applies to fixtures and to AI-generated code. The
contract below must be kept through dependency upgrades.

## Current protection

The modules of this protection live in `src/infra/server/`. `publicErrors`
belongs to that layer because it depends on `server-only` and on the
serialization authorization of Solid. `data/errorApi/` stays reserved for the
normalization of domain errors, when there are consumers. New imports of public
errors use `@/infra/server/publicErrors/index.ts`.

The [central registration](../src/infra/server/configureServerErrors/index.ts)
uses `configureServerFunctionsServer({ wrapInvocation })`.
[Vite](../vite.config.ts) loads it through `serverFunctions.serverSetup`,
covering server functions called directly in the SSR and through the HTTP
transport. The same module installs, in every mode, the
`configureServerErrors({ onError })` hook of `@solidjs/web`; the replacement
with the public error happens only in production.

- [requestJson](../src/infra/server/requestJson/index.ts) checks the HTTP
  status, reads the success JSON and applies the output schema inside the
  protection.
- [protectServerOperation](../src/infra/server/protectServerOperation/index.ts)
  catches throws and rejections and checks the structure of the result.
- [publicErrors](../src/infra/server/publicErrors/index.ts) creates a new error
  with the public message of the colocated catalog, in the locale of the
  request, as described in
  [Locale of the public message](#locale-of-the-public-message).
- [logServerFailure](../src/infra/server/logServerFailure/index.ts) is the only
  log point: it writes the fixed message of the source and, for an `Error`, only
  the class and the filtered frames described in
  [Failure log](server-errors/logging.md#failure-log).
- The modules import `server-only`; the plugin keeps them out of the client
  bundle. The test alias exists only in the Node project.

In production the Solid runtime already replaces every thrown error with
`Error("Internal Server Error")`, in SSR, streaming and HTTP, even outside
server functions. It does not stop an `Error` returned as data: that case,
measured in the three channels, is only refused by the structural check of the
wrapper. That is why `wrapInvocation` stays registered. A generic fallback and
escaped HTML do not remove data from a payload that was already sent.

`ResponseEnvelope` is a `Response` too. The wrapper checks the value of the
envelope before accepting a response without a body as a control, the 204, 205
and 304 statuses included. Then it rebuilds the response with the checked data.
`respond(data)` has the type of the data for the caller of the server function;
the boundary uses `isResponseEnvelope()` to recognize its envelope at run time.
Direct calls in the SSR receive the data unwrapped by Solid.

The `onError` hook is additive. In production, it replaces any failure that
reaches the runtime, render failures and rejections outside server functions
included, with a new `createPublicError()`. In both modes, it writes the
`[server-error]` log when the error was not public. Control signals (`Response`
without a body, envelopes and `NotReadyError`) follow the default policy of the
runtime. `Response.error()` has no body either, but status 0 does not go out as
HTTP, so it becomes a public failure. The case of an envelope thrown by a query
in the SSR is in
[Validation and recovery](server-errors/recovery.md#validation-and-recovery).
The return of the hook goes to the client without another sanitization, so it
never returns the object it received, nor a public error, which may have gained
fields after it was created. The hook is synchronous and does not throw, not
even when the log fails: a failure of the hook would make the runtime log the
error of the hook.

Limits of the hook:

- The rejection of an async source is serialized with the default policy before
  any hook. The same body carries "Internal Server Error" for the source and the
  public message for the boundary.
- In development the hook does not replace the error, as described in
  [Failure log](server-errors/logging.md#failure-log): the browser receives the
  error that the runtime received, which in a server function is already the
  public error of the wrapper.
- Thrown primitive values have no per-object verdict; the hook runs and writes
  the log every time the runtime finds them.

The native handler of the plugin contains exceptions that escape the
middlewares, calls the hook with `kind: "request"` and answers 500 without a
body. It also accepts a thrown `Response` or envelope with a body, so that
containment does not replace the public data policy or the error page of the
app. The default export of
[`src/middleware/index.ts`](../src/middleware/index.ts) is `createMiddleware()`,
which adapts the plugin event to the `Request` chain of `filesystem-routing` and
`composeMiddleware`, handing that chain to `containFailures`. The containment,
in
[`src/middleware/containFailures/index.ts`](../src/middleware/containFailures/index.ts),
composes the whole chain inside itself, and an exception in the middlewares, in
the API routes or in the page handler becomes a 500 with the security headers
and the `[middleware]` log. Only a `Response` without a body and with a status
other than 0 passes as a control, and it goes out with the same headers; a
thrown `Response` with a body becomes a 500, because it may carry upstream data.
The middleware, the hook and the wrapper use the same classification,
[`isControlResponse`](../src/infra/server/isControlResponse/index.ts). The
headers of a returned `Response.redirect()` are immutable, so they go on a copy
without a body; the raw return of `fetch()`, with immutable headers and an
upstream body, is not copied and becomes a 500. In development the original
error goes on to Vite. The E2E build assembles the entry with the same factory
and passes the injected failures in `createMiddleware(extra)`, which puts them
before the chain and inside the same containment. Since the E2E tests do not
call the default export, a unit test requires it to contain failures, and the
`test:e2e:production` suite checks the middleware headers on the real entry.

The responses of the containment do not go back through `securityHeaders`, so
the containment itself writes the security headers and the
Content-Security-Policy with the nonce of the request, read by
[`requestNonce`](../src/middleware/securityHeaders/index.ts), which uses the
native `event.nonce` field. A failure before `securityHeaders` can find the
request without a nonce; the containment creates it before rendering the error
page, so that its scripts, the plugin handler and the CSP use the same value.
Without a request event, the text 500 goes out with `script-src 'none'`. The
design of the CSP is in the [security headers](security.md) guide.

In a navigation, the 500 shows the error page of the app. A navigation is a
`GET` or `HEAD` on a page path whose `Accept` allows HTML or Markdown, wildcards
and a missing header included, according to `isPageRequest` in
[`requestClassification`](../src/middleware/requestClassification/index.ts); a
client that asks only for Markdown also gets the error page in HTML. This
criterion is broader than the one of the plugin development server, which only
considers HTML, `*/*` or a missing `accept`. `containFailures` writes a
`createPublicError()` in `locals.serverFailure` and calls the page render. The
`ServerFailureGate` of [`App.tsx`](../src/App.tsx) throws that error before the
Router, the root `Errored` shows `ErrorFallback` and the client hydrates the
fallback from the serialized error. Since the error is already public, the hook
does not write another log. The status is forced to 500 in the response. If the
render returns something that is not HTML, such as the locale redirect of a path
without a prefix, the response is the text 500.

The render that the middleware receives is the plugin dispatcher, which serves
the server function endpoint (`/_server`) before the page. That is why this
endpoint and the API routes recognized by the `createAPIMatcher` of
`filesystem-routing` never receive the error page, even with an HTML `accept`:
calling the render there would run the function without the middlewares that
failed. Those paths and the other methods receive the public message in text.
The plugin accepts a single render per request: if the chain fails after it has
already rendered the page, the response is also the text 500. If the error
render fails, the response is the text 500 and the log gets the `[error-page]`
line, with the class and the frames of the render error described in
[Failure log](server-errors/logging.md#failure-log). The containment reads the
endpoint from the `endpoint` export of `virtual:solid-server-function-handler`,
the same value the plugin dispatcher uses, with `serverFunctions.endpoint` and
the Vite `base` already applied; changing those options does not require editing
the middleware. In the Vitest Node project, an alias replaces that module with a
stub that has the default value.

The cancellation of the request itself is not a failure. When the caught value
is the `signal.reason` of the request, with the signal aborted, the containment
answers the text 500, without a log and without calling the render. That case
covers the client disconnecting and the deadline of the publication, which
arrive through the same signal, because the render in `async` mode rejects with
that reason when it is abandoned. The comparison is by identity: any other value
thrown with the signal aborted is still logged as a failure, including an
`AbortError` of another signal or an error that carries the reason in `cause`.
On the error page, the criterion uses the signal of `event.request`, which is
the one the render reads: the cancellation does not add the `[error-page]` line,
and the original failure was already logged before the render. A different error
from that render keeps the line. In development the value is rethrown, like any
other. A primitive reason has no identity of its own and is mistaken for the
same value thrown. The runtime rejects with the reason itself, `null`, `false`,
zero, an empty string and `NaN` included; the middleware uses `Object.is` to
compare the reason without losing those values.

The containment only reaches the window of the middleware chain. Creating the
event, committing the response and body failures after the `Response` leaves are
outside it. The behavior was measured on the Nitro preview; the Vercel runtime
was not measured locally.

## Locale of the public message

The message of `createPublicError()` and of the text 500 responses comes from
the `publicErrors_message` ID, in `src/infra/server/publicErrors/i18n/`, with
the three locales. `publicErrorMessage()` reads the locale at call time, through
the context that `paraglideMiddleware` opens in `localizeRequest`: pages use the
URL, the cookie, `Accept-Language` and the base locale, and server functions
called over HTTP use the same-origin `Referer` first. The render, the server
functions called in the SSR, the `configureServerErrors` hook and the
containment of the inner chain run inside that context.

Outside it, the message is in the base locale. That applies to the outer
containments, which handle failures of `localizeRequest` itself and of the
Markdown adapter before the render, and to paths that do not go through the
localization, such as `robots.txt`. In a navigation handled by those
containments, the public error is created before the render and carries the base
locale in the serialized payload, while the error page renders in the locale of
the request. The Markdown adapter also runs outside the context and, for that
reason, resolves the locale of its 500 from the original request, in the same
order as `localizeRequest`.

The hook is synchronous and cannot throw: if resolving the locale fails, the
message is in the base locale. The text comes only from the catalog, with
nothing from the original error. The Node and E2E tests check the expected text
in the locale of each case.

## Failure log

See [failure log](server-errors/logging.md#failure-log).

## Adding a call

See [adding a call](server-errors/backend.md#adding-a-call).

## What the lint covers

See [what the lint covers](server-errors/backend.md#what-the-lint-covers).

## Use in pages

See [use in pages](server-errors/backend.md#use-in-pages).

## Validation and recovery

See
[validation and recovery](server-errors/recovery.md#validation-and-recovery).

### Outdated page after a deploy

See
[outdated page after a deploy](server-errors/recovery.md#outdated-page-after-a-deploy).

## Upgrading Solid

See [upgrading Solid](server-errors/solid-upgrades.md#upgrading-solid).

## SSR integrity for Markdown

See
[SSR integrity for Markdown](server-errors/ssr-integrity.md#ssr-integrity-for-markdown).
