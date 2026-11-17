# Error validation and recovery

[Back to the main guide](../server-errors.md)

## Validation and recovery

The [backend E2E](../../src/tests/pages/BackendError/BackendError.e2e.test.ts)
runs on the production build: five scenarios (HTTP 500, an exception after the
read, an `Error` inside the result, a public error and success) in the initial
SSR, streaming and an HTTP call; one reload per navigation scenario, SSR without
JavaScript included; a test of the bundle isolation; three control signals in
server functions called in the SSR (a thrown `redirect()`, a returned envelope
and a thrown envelope); and the `content-type` regression described below, with
an envelope returned and another thrown by `query()`. The thrown envelope
reaches the hook as a control, but the router throws its value in the render and
the document becomes a 500, with or without the hook. In streaming, the
confidentiality cases use an id ending in `:gated`: the synthetic backend holds
`/data` until the test sees the fallback and releases the gate, without relying
on the fixed delay of the backend.

When a `query()` read in the SSR returns or throws an envelope of `respond()`,
the `handleResponse` of the router copies to the page response only the headers
that do not describe the body; `content-type`, `content-disposition`, `etag` and
similar stay out, and the document is still HTML
([solidjs/solid-router#633](https://github.com/solidjs/solid-router/issues/633)).
The E2E tests cover both cases as a regression. The other headers of the
envelope, such as `set-cookie` or a custom header, are still copied; read after
the start of the response was sent, they are dropped with the
`[LATE_HEADER_WRITE]` warning. Page headers belong to the render, not to a data
envelope.

The
[E2E of errors outside server functions](../../src/tests/pages/OutsideError/OutsideError.e2e.test.ts)
covers a throw in the render with and without a local boundary, a throw in the
render after the shell and async rejections in the SSR, as a direct child of
`<Loading>` and inside an element, plus middleware exceptions before and after
`next()`. Each case reads the raw document outside the browser and checks the
fallback in the browser. In the streaming cases, the failure only happens after
the test sees the shell and releases a gate in the synthetic backend, without a
timer. Positive controls check that the fixture received the marker (the
`x-fixture-marker` header and the count of the backend), that the thrown error
carried that marker (the `x-fixture-thrown` header without streaming, and a
record in the synthetic backend in the gated and middleware cases) and that the
gate was used. The middleware cases run in series and require, per request, a
new line with the fixed `[middleware]` message.

The Playwright `webServer` writes the preview output to
`test-results/server-<mode>.log`. The
[global teardown](../../tooling/testing/server-log-teardown.ts) checks that the
file recorded the preview address and refuses any private marker.

The synthetic markers are created in the backend after the build. The tests
check the whole body, the headers, the DOM and the browser errors. The asset
test looks for code and an address that only the server has. The Node tests
cover the HTML 500, invalid JSON, an invalid schema, a network failure and the
cancellation of the body, plus the contracts of the wrapper.

The HTTP capture uses `route.fetch()` and hands the response to the browser with
`route.fulfill()`, because the decoder cancels the stream when it receives the
exception. That capture waits for the whole body and does not measure
cancellation or latency. The streaming of the SSR document is not intercepted.

The tests tolerate in `pageerror` only the public message in the locale of the
page and, in the cases that go through an async source or through streaming, the
generic message of the runtime; each case declares the accepted messages, which
depend on the order between the hydration and the arrival of the rejected
fragment. The streaming status can stay 200 after the initial send; the tests
check confidentiality regardless of it. Nested deferred sources and async work
outside the awaited return require their own integration and tests.

The global "Reload page" link keeps the URL and does a document navigation,
regardless of the hydration. Actions started after the load have to be repeated.
For a local retry with a query, invalidate the key before `reset()`:
`revalidate(getData.key); reset()`. Confirm a new call to the backend.

After changing that boundary, run:

```bash
vp run test:tooling
vp run test:unit
vp run test:e2e src/tests/pages/BackendError src/tests/pages/OutsideError src/tests/pages/OutdatedPage
vp run check:ci
```

The [CI](../../.github/workflows/ci.yml) runs `test:tooling` and the whole E2E
suite; `vp run validate` and `pre-push` run `test:tooling` locally, which
includes both policies. The policy tests check the rules in the real parser and
their registration in the whole lint, with refused and allowed cases for each
exception. See the results of each run in the logs of the local validation and
of the CI.

### Outdated page after a deploy

A tab opened before a deploy keeps the JS of the previous build until it loads a
document. It can call a server function that the new build does not have. The
server answers 404 with the `X-Server-Function-Unknown` header, without running
the function, and the client rejects with `unknownFunction: true`. The recovery
is described at the end of this section. That refusal happens before
`wrapInvocation` and the `configureServerErrors` hook, without a body in
production and without a `[server-error]` line.

The Solid plugin also stamps the production calls that do not use GET with the
`X-Server-Function-Build` header, and the `configureServerFunctionsServer` that
it generates receives the same id in `buildId`. A call stamped by another build,
whose function kept its id in the deploy, gets a 409 without running the
function, with `X-Server-Function-Unknown`, the server id in
`X-Server-Function-Build` and `Cache-Control: no-store`. The client rejects with
`unknownFunction: true`, as with the 404, and the recovery is the same; the
refusal also happens before `wrapInvocation` and the hook, without a body in
production. The stamp is combined with the `prepareRequest` that the app passes
to `configureServerFunctionsClient`, imported from
`@solidjs/web/server-functions/client`. A call without the header is still
accepted: the id is public in the bundle, and the check only detects a client of
another build. `query()` calls use GET and go out without the stamp. The
exception is when the arguments go over the URL limit of the runtime: the client
sends the read by POST, with the stamp, and it goes through the check. In
development there is no id and no check.

With Nitro, the client and the server come from the same build, and the server
receives the id that the plugin keeps in memory. The plugin also writes the id
and the server functions that the client reaches to
`.vite/solid-server-functions.json`, but in the SSR output, and deletes the Vite
`manifest.json` that it turns on itself, so neither stays in the published
static folder. `BuildOutput` compares the id of the client with the one of the
server.

The tab can also request a chunk or a CSS stylesheet with the hash of the
previous build, which the new deploy does not publish. The recovery follows a
rule: the page only reloads by itself when the user has already asked to leave
it or when the fallback of the root `Errored` has already taken it off the
screen. In the other cases, the page stays as it is and `OutdatedPageNotice`
offers the reload. The runtime does not report whether a page has something
unsaved, so the automatic reload happens only where it loses nothing that the
navigation or the error page would not already lose.

| Situation                                                                                                   | Behavior                                                                            |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Hover or focus on a link, with a missing chunk or a read refused in the preload                             | Marks the page, without a reload and without a notice.                              |
| Navigation that changes the path without the locale, with the page marked                                   | Document navigation to the target, keeping `replace`.                               |
| The same navigation, with changes registered in `registerUnsavedChanges`                                    | Stays on the client; the guard of the page itself decides.                          |
| Query, hash, back, forward or navigation without a connection                                               | Stays on the client.                                                                |
| Click without a preload, with the JS or the CSS of the target missing                                       | The root `Errored` reloads once, already on the target.                             |
| Render read or `lazy()` refused without a local `Errored`                                                   | The root `Errored` reloads once.                                                    |
| Render read or `lazy()` refused inside a local `Errored`                                                    | The local fallback stays, and the notice offers the reload.                         |
| Submission refused with a labeled 404 or 409                                                                | The rejection goes back to the caller, and the submission notice offers the reload. |
| Read outside the render (polling, direct `GET`, `live()` reconnection)                                      | Marks the page, without a notice.                                                   |
| In the root `Errored`: repeated refusal within 30 seconds, without `sessionStorage` or without a connection | The error page appears, with the manual reload.                                     |

The recovery uses three pieces:

- Detection: `installOutdatedPageDetection`, installed by `entry-client`, marks
  the page as outdated when the Vite preload helper fires `vite:preloadError`
  and when a server function answers 404 or 409 with
  `X-Server-Function-Unknown`. A refusal outside tracked computation and without
  `GET` counts as a submission and fires the submission notice. The module also
  registers the `configureClientErrors` hook: when a boundary shows a fallback
  for a recorded chunk failure or for an error with `unknownFunction: true`, the
  hook fires the fallback notice. The preload event also fires in the intent
  preload of `intentPreload()`, before the click, and only exists in the build.
  The listener does not call `preventDefault()`: the import would resolve
  `undefined`, and the `lazy` of the route would keep that empty module until
  the reload.
- Next navigation: with the page marked, `createOutdatedPageGuard`, called next
  to the locale guard, turns the next navigation that changes the path without
  the locale into a document navigation, keeping `replace`. Query and hash stay
  on the client, and without a connection the navigation stays on the client.
  Back and forward between entries of the same document also stay on the client:
  the chunks of those pages already loaded, and a refused read there follows the
  rules of the table. The router calls the `useBeforeLeave` listeners in
  subscription order, and the version guard is subscribed in the `Router`
  layout, before any route. Since it calls `preventDefault()` and switches
  documents right away, a page guard that checks `!e.defaultPrevented`, like the
  router example, would never get to ask. That is why a page with unsaved
  changes registers, besides its own `useBeforeLeave`, a check with
  `registerUnsavedChanges`, imported from
  `@/primitives/createOutdatedPageGuard/index.ts`, inside `onSettled`, returning
  the removal as the cleanup. While any check returns `true`, the version guard
  leaves the navigation on the client. If the user confirms leaving with
  `e.retry(true)`, the navigation also stays on the client, and the page stays
  marked for the next one.
- Root `Errored`: a chunk failure recorded by the listener or an error with
  `unknownFunction: true` reloads the page once instead of showing
  `ErrorFallback`, with an empty screen until the new document arrives. When the
  error reaches the root, the tree has already left the screen, so the reload
  loses nothing that the error page would not already lose. It is also the path
  of a click that comes before the 404 response of the preload. The reload runs
  in `onSettled`, in a `setTimeout`, after the router writes the target URL. If
  the document is not replaced within 10 seconds, for example because a
  `beforeunload` of the page cancelled the reload, `ErrorFallback` appears in
  place of the empty screen. The deadline covers a server still cold right after
  the deploy. The fallback reads the error without tracking, so that a second
  error does not rebuild it and swap the pending reload for the error page. The
  `outdated-page-reload` lock in `sessionStorage` lasts 30 seconds: if the
  failure comes back within it, the served build also failed and the error page
  appears. Without `sessionStorage` or without a connection, the error page
  appears right away.

A read or a `lazy()` refused inside a local `Errored` does not reload the page.
The local boundary exists to keep the rest of the screen working, and a reload
would erase what is typed next to it. Trying again does not solve it either,
because the id does not exist in the new build. `OutdatedPageNotice` shows "Part
of this page did not load" with the "Reload page" button, and the next
navigation already goes through a document. A local fallback can replace its own
"Try again" with a reload action by checking `isVersionError(error())`.

A refused submission is not repeated by itself: `ctx.retry` would repeat the
same call and get the same refusal, 409 for the stamp or 404 for the missing id.
The rejection with `unknownFunction: true` goes back to the caller, and
`OutdatedPageNotice` asks to reload and submit again, warning that what was not
saved can be lost. Since the 404 and the 409 happen before reading the arguments
and running the function, submitting again after the reload does not duplicate
the effect of that attempt. A network failure, a timeout or a 5xx without the
label do not mark the page: the result is unknown, and the project checks the
state in the backend or uses an idempotency key before repeating. Keeping the
form for after the reload is up to the project, for example with an
automatically saved draft.

Known limits:

- The client keeps a single `responseHandler`. With
  `serverFunctions.components`, `installServerComponents` takes the same slot,
  and the last one to configure wins; the two have to be composed by hand.
- The `configureClientErrors` hook is also single and is the natural slot of an
  error monitor. A monitor installed later replaces the hook silently, and the
  fallback notice stops showing for version errors. An `onError` passed to
  `render` or `hydrate` has the same effect, because the runtime prefers the
  root hook to the environment. In both cases, the monitor has to be composed
  inside `installOutdatedPageDetection`.
- The handler tells a submission from a read by the call site: outside tracked
  computation and without `GET`. A direct read made after an `await`, inside
  `untrack` or in a route preload counts as a submission and shows the
  submission notice. Reads use `query()` or `GET()`.
- `registerUnsavedChanges` only protects the page that registers. A page that
  has only `useBeforeLeave` loses the draft in the switch to a document when the
  tab is marked, unless it also has a `beforeunload`.
- A document navigation also drops the global state in memory, such as stores
  and connections. State that needs to survive has to be persisted.
- A network failure in the import also marks the tab, and the next navigation
  goes through a document.
- The failure of a `lazy()` inside the page, without a local `Errored`, also
  reaches the root `Errored` and reloads the current page, with what was not
  saved yet.
- A `GET` read whose id survived the deploy runs on the new server without a
  stamp and without detection. When the arguments or the output of a read
  change, the function has to accept the format of the previous deploy too, or
  change its name, so that the old tab gets the 404.
- The reload delivers the build that the host serves, which can be a rollback or
  an instance of another build. The notice says that the page may be outdated,
  without promising that the reload solves it.
- A missing asset in `/assets/`, such as the chunk of another build, answers 404
  with `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and
  `Cross-Origin-Resource-Policy: same-origin`, without the SSR page. Nitro
  registers in `publicAssets` the `/assets` path, which is the Vite `assetsDir`,
  with `fallthrough: false`. In the preview and in the `node-server` preset,
  Nitro answers a GET or HEAD miss with the `no-store` 404 of an exclusive
  public folder, and h3 keeps that header when the route rule of `/assets/**`
  applies the immutable cache to the error. On Vercel, the preset writes the
  `no-store` 404 route right after `filesystem`, and the miss does not reach the
  function. The route rule carries nosniff and CORP, with the values of
  `SECURITY_HEADERS`, to the miss and to the hits served by Vercel or by
  `node-server`; in `vp run start`, the hit comes from the srvx static server
  without those headers and without `Cache-Control`, as before. The
  `BuildOutput.assets.production` test checks the routes of
  `.vercel/output/config.json` and the 404 in the preview, and fails if a Nitro
  upgrade changes this behavior. It covers the generated configuration, not the
  CDN: the precedence of `no-store` over the cache of the `/assets` route
  follows the order of the routes. The author of
  [nitrojs/nitro#4474](https://github.com/nitrojs/nitro/pull/4474) checked that
  order in their own deploy on Vercel; the deploy of this repository has not
  been checked yet. In `vp run start`, the miss only applies to GET and HEAD on
  `/assets/<file>`, and `/assets`, `/assets/`, paths with an empty segment and
  other methods stay in the SSR, with the cache of the route rule. On Vercel,
  only `/assets` without a slash reaches the function: the `no-store` 404 route
  after `filesystem` covers the rest, with any method. No URL generated by Vite
  has those forms. The 404 of the miss does not carry the CSP, the HSTS or the
  frame policies, which only apply to the responses of the middleware.
