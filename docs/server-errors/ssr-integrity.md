# SSR integrity in the Markdown publication

[Back to the main guide](../server-errors.md)

## SSR integrity for Markdown

The entry creates the state with `createRenderIntegrity()`, from
[renderIntegrity](../../src/infra/server/renderIntegrity/index.ts), and stores
it in `event.locals.ssrRenderState` before calling `renderToStream`. The state
is read-only: the `configureServerErrors` hook sets `hasErrors` through
`markRenderFailure` when it receives a failure with `kind: "render"`, and
`onCompleteAll` sets `hasCompleted` through the `complete` function of the same
factory. A state created outside it is not marked. Control signals mark it too:
a `redirect()` or `respond()` thrown in the render and caught by a nested
`<Errored>` becomes a fallback with a 200 HTML response. Since
[solidjs/solid#4130](https://github.com/solidjs/solid/pull/4130), the hook
receives each error once per kind in each request. A server function failure
contained by a boundary arrives first as `server-function` and then as `render`,
and only the second notice marks the state. The callback alone does not prove
integrity: it can also happen after a fragment failure. The adapter requires
completion and a strict absence of errors seen by the render after waiting for
the SSR, before publishing converted HTML. A missing or invalid state results in
a public 500 error without cache. Redirects and responses that are not eligible
pages keep their previous flow. The static pages go through this same adapter in
the build prerender, and a refusal there stops the build.

Because the hook is the source of this signal, it is also installed in
development, where it marks the state without replacing the error, as described
in [Failure log](logging.md#failure-log). The entry still has no local
`onError`: it would take precedence over the global hook, bypass the
sanitization and the log, and leave the state unmarked, and the Markdown would
publish with `hasErrors: false`. The hook registration calls
`observeRenderFailures()`; until then the factory creates the state with an
undefined `hasErrors`, and the Markdown refuses the page. Without the Vite
`serverFunctions.serverSetup`, which loads the registration, every `.md` answers
500 and the prerender stops the build.

The hook finds the state through the event that the runtime associates with the
failure. Serializer failures, an `onCleanup` that throws and the `<Errored>`
fallback arrive without the event, and the runtime reads it from
`AsyncLocalStorage`. A failure reported outside that context would not mark the
state, and the Markdown would publish the HTML. The serialization tests cover
these three cases with the context present.

The default serializer reports parse and emit failures to the hook, even without
a local hook. Before the first send, the first failure sets `hasErrors`, goes
through the `configureServerErrors` policy and ends the render without calling
`onCompleteAll`. Synchronous failures follow this path too, without rethrowing
the exception to the caller. The disposal releases the owner and the pending
async sources.

There is one exception before the first send. When the serialization of the
error of an `<Errored>` fails, or of the reason of a rejection that an
`<Errored>` caught, the runtime writes in its place an `Error` with only the
message, and the render goes on. The failure still reaches the hook and sets
`hasErrors`, so the Markdown refuses the page. That error already went through
the hook, and in production the message is the public one. A rejection without
an `<Errored>` to catch it still ends the render.

In streamed HTML, a failure while the shell is being built prevents it from
being sent, and the response is a 500. After the shell, the bytes already sent
cannot be taken back: the failure reaches the hook, the render goes on and the
client receives the rejected key with an error that only names the key and the
serialization failure. During hydration, reading that key falls into the nearest
`<Errored>`; the original message stays on the server. Markdown waits for the
render, so every failure happens before the send, and the publication is refused
with a public 500 error and `cache-control: private, no-store`. A serialization
failure does not depend on the adapter timeout to end the response.

Custom serializers keep the runtime behavior: the failures they report reach the
hook, but do not end the render. Errors suppressed internally are not
observable. Any adoption requires validating the relation between content,
completion and failures.

The published runtime also ends the render when the default serializer fails
synchronously, while writing a value, before the first send, in the default and
development runtimes
([solidjs/solid#4709](https://github.com/solidjs/solid/issues/4709)). A failure
that comes after the write, such as in the rejection of an async value, already
ended the render
([solidjs/solid#4647](https://github.com/solidjs/solid/issues/4647)). Before
#4709, on a synchronous failure the runtime only reported the hook and completed
the render through the normal flow, `onCompleteAll` included: the Markdown would
refuse that result because of the recorded failure, but a failure while building
the shell would send the HTML with status 200. A Bun patch of `@solidjs/web`
covered that case until the published package passed without it in the
regression tests of `markdownContent.serialization.node.test.ts`, which fail on
the earlier runtime without the patch. Failures in the serialization phase reach
the log as `SerovalSerializationError`; the message and the cause are still
dropped.

A render abandoned inside its first write does not bring the process down
either. `pipe` writes the shell and calls `buffer.flush()` on the next line.
With a shell of 16,384 characters or more, that first write already reaches the
destination, which may abandon the render right there: `createSSRResponse` does
this when the page declared `Location`, and the same happens when the write
throws or when the render signal is aborted inside it. `abandon` replaces the
buffer with an object that has an empty `flush`
([solidjs/solid#4745](https://github.com/solidjs/solid/issues/4745)), and the
abandoned render ends the same way as with a smaller shell. Without that
`flush`, the next call would throw a `TypeError` in a microtask that nobody
awaits, and the unhandled rejection would end the Node process; the Bun patch
covered that case too. The regression test is in
`renderIntegrity.redirect.node.test.ts`.

[solidjs/solid#4193](https://github.com/solidjs/solid/issues/4193) reported
three gaps. [solidjs/solid#4206](https://github.com/solidjs/solid/pull/4206)
took the serializer failures to the global hook, started containing an
`onCleanup` that throws in the disposal of the normal completion and made the
core run every cleanup even after one that throws.
[solidjs/solid#4229](https://github.com/solidjs/solid/pull/4229) made the render
complete on a synchronous failure, and
[solidjs/solid#4246](https://github.com/solidjs/solid/pull/4246) ends each write
at the first value that fails. #4647 ends the render on an async failure before
the send and rejects on the client the key that fails after it, and #4709 closes
the synchronous case. When upgrading Solid, run again the regression tests for
an error reused across requests, a server function failure that escapes Loading,
local recovery, serialization, a cleanup that throws and cancellation. A closed
issue or PR does not replace checking the installed artifacts. The combined
timeout and disconnection signal reaches `renderToStream`; the Node test of the
adapter checks the disposal of a pending SSR root on cancellation.

On abandonment by cancellation, the `renderToStream` thenable rejects with
`signal.reason`, including for consumers registered after the abort, without
calling `onCompleteAll`
([solidjs/solid#4646](https://github.com/solidjs/solid/issues/4646)). Before
that fix, the runtime disposed the root and kept the wait pending, and the patch
covered the rejection. The publication protection does not mistake that
rejection for the end of the backend: `protectServerOperation` registers the
Promises in the async context of the publication, and the slot stays taken until
they settle. Common operations, outside that context, keep the previous
behavior. `containFailures` recognizes that rejection by identity with
`signal.reason`, so the reason has to arrive unwrapped; otherwise, the
cancellation goes back to the `[middleware]` log. The regression tests are in
`markdownContent.abort.node.test.ts`, `containFailures.abort.node.test.ts`,
`publicationScope.node.test.ts` and the HTTP disconnection scenario of
`PublicationLoad`. When upgrading Solid, check this contract too.
