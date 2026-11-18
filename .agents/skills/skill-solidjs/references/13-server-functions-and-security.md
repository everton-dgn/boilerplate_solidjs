# Server functions and security

Base: [verified revision](../SKILL.md), reverified on 2026-09-29.

## Compilation and registered body

Contract: use server requires a client/server transform, a manifest, a bootstrap and an HTTP handler, without creating a backend in a static site. Use the adapter and @solidjs/web/server-functions; the client/server entries are for integrations, without reassembling the protocol. The default filter of the plugin is `src/**/*.{jsx,tsx,tsrx,ts,js,mjs,cjs}`; include fixtures. A green build outside the filter can keep the server body in the client.

Pitfall: `validated(schema, async (...) => { "use server" })` can register the inner function and wrap only the client reference. An equivalent HTTP call ignored the wrapper, with zero validations; without a full build. Validate/authorize in the registered body. In a use server module, an exported wrapper can be the registration: check the output. Export only functions; constants/schemas/sentinels were not tested and stay in another module.

Recipe: check the client reference, the absence of a synthetic marker of the body in public bundles/chunks/sourcemaps, the server registration and real HTTP. Use a synthetic marker, never a real secret or credential. An absent marker does not prove the removal of an imported module, even with a static import used only inside the function; inspect your own bundle.

## Validation and authorization

Validation and authorization belong to the effectively registered body, also for a forged HTTP call. The decoder recursively removes `__proto__`, `constructor` and `prototype` from objects and Map/Set entries, but does not validate domain or permission. A wrapper that protects only the client reference does not protect the endpoint.

## Methods, limits and metadata

Contract: POST by default, GET(fn) declares a read. The handler always accepts POST; GET/HEAD only on declared GETs, HEAD without a body with equivalent status/headers; other methods 405. GET on an ordinary function: Allow: POST. Declared GET/HEAD skip the origin gate by default and can be invoked from another origin with the cookies of the environment; csrf.protectDeclaredReads true turns the protection back on when the deploy does not rely on a cache shared by origin. Authentication/authorization/cache stay mandatory.

Contract: bodySizeLimit, 1 MiB by default, refuses the excess with 413 before decoding; maxArguments, 1000 by default, refuses with 400. withMeta attaches metadata; getServerFunctionMetadata/isServerFunction serve inspection, not authorization. The old .GET/.withOptions properties are not the current API.

Pitfall: GET does not mutate; a query string does not carry a secret/token/sensitive data that gets logged/cached. Limits do not validate the domain; an authenticated read requires isolation.

## Configuration and origin

Contract: configureServerFunctionsServer accepts the default endpoint /_server aligned with the client/base path; csrf on by default; a secret used in the no-JS flash; wrapInvocation wrapping HTTP and the direct SSR call; provideEvent linked to provideRequestEvent from @solidjs/web/storage or an equivalent; handleNoJS, whose null turns off the convention; bodySizeLimit/maxArguments. Csrf false only if another trusted layer protects the endpoint. handleServerFunctionRequest accepts per request createEvent, provideEvent, wrapInvocation, onError, transformResult, handleNoJS, csrf, codec and limits. A per-request wrapper only covers the addressed invocation; nested calls require a global policy.

Pitfall: in the @solidjs/web of the verified base, with Sec-Fetch-Site, same-origin passes and none always refuses; same-site/cross-site refuse without an Origin or without a configured csrf.origin and, otherwise, follow the string/array/function matcher (only a literal true admits). An admitted Origin from another origin gets CORS: Access-Control-Allow-Origin echoing the Origin, Vary: Origin, exposed protocol headers and an OPTIONS 204 preflight; Access-Control-Allow-Credentials only with csrf.allowCredentials true, and a cross-site cookie still requires SameSite=None; Secure. Without Sec-Fetch-Site, Origin/Referer and the same matcher come in; without any metadata, only allowRequestsWithoutOriginCheck lets it through. Acceptance in an HTTP client outside the browser does not prove preflight and credentials; do not remove the protection to get around a 403. The provider runs once per invocation, without guaranteeing idempotency between requests. Transport details are in 09-cancellation-and-live-sources.md.

Pitfall: configure an explicit event provider: `configureServerFunctionsServer({ provideEvent: (event, fn) => provideRequestEvent(event, fn) })`. Without `provideEvent`, the runtime falls back to the global `AsyncLocalStorage` that `provideRequestEvent` installs on its first call; the call only throws `No request event provider` if neither of them exists yet, and the result depends on the order of the requests in the process. `createEvent` is a per-request option of `handleServerFunctionRequest`; passed to `configureServerFunctionsServer`, it is accepted without an error and ignored, and `locals` stays empty.

## Cache and safe redirect

Contract: the handler answers Cache-Control no-store unless there is an own policy in respond with headers or a Response. Public caching only for a read independent of the session; user data calls for private, no-store on every branch, 401/redirect included. Redirect copies the target to Location without validating it.

Recipe:
```ts
type NextTarget = { next: string | null; origin: string }
function safeNextPath({ next, origin }: NextTarget): string {
  if (!next) return "/"
  try {
    const url = new URL(next, origin)
    if (url.origin !== origin || !url.pathname.startsWith("/") || url.pathname.startsWith("//")) return "/"
    return url.pathname + url.search + url.hash
  } catch { return "/" }
}
function redirectAfterLogin(request: Request): Response {
  const url = new URL(request.url)
  const response = redirect<Response>(safeNextPath({ next: url.searchParams.get("next"), origin: url.origin }), 303)
  response.headers.set("cache-control", "private, no-store")
  return response
}
```

Pitfall: a / prefix accepts //evil.example and /\evil.example. Same origin accepts /a/..//evil.example, but the normalized pathname //evil.example becomes an external host in Location. Reject external https/javascript/data. Typing does not isolate the cache.

## Client policy and cancellation

Contract: configureServerFunctionsClient.prepareRequest is a single hook; compose policies. A missing/changed method is refused before the fetch; only method is checked. Keep init/signal; replacing the body is allowed. Invoke only accepts signal/keepalive/priority.

In the production build with the default runtime, `@solidjs/vite-plugin` wraps `configureServerFunctionsClient`, imported from the root or from `/client`, and puts the `X-Server-Function-Build` header in the `init.headers` of non-GET calls before the hook of the app. The hook must keep that header; the server answers 409 to another build and the client rejects with `unknownFunction: true`. Source: the `dist` of the installed plugin, without a probe of its own.

Recipe:
```ts
configureServerFunctionsClient({
  prepareRequest: init => {
    const headers = new Headers(init.headers)
    new Headers(sessionHeaders()).forEach((value, name) => headers.set(name, value))
    return { ...init, headers }
  }
})
// Call with cancellation:
invoke(save, { signal: controller.signal, keepalive: true, priority: "high" }, input)
```

Pitfall: `headers` accepts an object, pairs or `Headers`; an object spread does not keep all of those forms. An init without a signal passes the guard if the method is right, losing cancellation. Invoke with method/headers/body/timeout throws pointing to GET/prepareRequest/arguments. A timeout uses a composed AbortSignal when supported; retry/dedupe belong to the data layer. Abort rejects/cancels the transport without undoing the backend; a non-idempotent repetition requires a contract.

## Codecs and framing

Contract: the transport uses natural HTTP when applicable and JSON for the rest. Date, Map, Set, typed arrays and cycles require the matching opt-in. enableRichArguments from @solidjs/web/server-functions/rich-args enables writing the arguments codec; results have their own contract independent from that opt-in. Plugins use createPlugin/OpaqueReference of the serialization instance of the runtime.

Pitfall: a separate seroval can make the protocol incompatible without a type error. Serialization/frames are an advanced integration; an opt-in does not validate the payload. The runtime removes Content-Length, Content-Encoding and Transfer-Encoding declared by the function, both in HTTP and in the stream envelope, because framing belongs to the transport.

## Responses and natural address

Contract: the programmatic address differs from the natural one of a form action, separating serialized/HTTP in the cache. Respond combines a value/metadata; redirect/reload signal navigation/revalidation to the adapter, without redoing every memo by textual key. In 2.0.0 `redirect` and `reload` return `T = never` and `respond(value)` returns the type of the value, so they do not change the inferred result of a server function; annotate, as in `redirect<Response>(...)`, to use the `Response`.

Contract: on the measured path with a script, a returned redirect gives 200 without Location, with X-Server-Function-Redirect in the format `<status> <absolute-url>`; the natural address gives 302. Reload gives 200 with X-Revalidate. Return/throw of respond with status 400 keep status/body, but only throw marks X-Server-Function-Error true and an RPC rejection. decodeRedirectHeaderValue accepts an absolute http(s) URL and a recognized status; javascript/data/invalid or a missing header return undefined, treated as no redirect. Do not assemble internal endpoints/headers in the UI.

Pitfall: the expected domain result is public/typed. Return/throw change the rejection; without a programmatic Location there can still be a redirect.

## Form without JavaScript

Contract: documented. fn.url is the natural address used in a form action. A browser form POST gets createNoJSHandler by default; a global/per-request handleNoJS replaces it, and createNoJSHandler({base}) extends the convention to every call without a script. The result stays in a single-use flash cookie for 60 seconds, AES-GCM encrypted, with a 4 KB limit. Above that it drops the echo of the fields and truncated signals a summary. decodeFlashCookie returns Promise<FlashSubmission | undefined>, which requires await.

Pitfall: without await, the flash looks empty. The secret must be equal between post/render instances; when missing it uses the per-build secret of the plugin, and without both it redirects without a result. High entropy, outside Git. The form/router repopulates fields/errors; an RPC onSubmit does not implement progressive enhancement. Test a browser without JS and instances with an equal/different secret.

Contract: the body parser tells four cases apart: an empty body without a format tag (zero arguments), a valid tag, an unknown tag (refused with a `TypeError` citing a version mismatch) and a form POST without a tag, which follows the no-JavaScript navigation branch when `Sec-Fetch-Mode` is `navigate` or missing and is refused with 400 for any other value, such as `cors`.

## Errors and logs

Contract: a plain error thrown over HTTP is sanitized with DEV off, except for an explicit hook or markSafeError. The development condition turns DEV on and the default entry turns it off; NODE_ENV alone does not prove the artifact. setServerFunctionsDev(true) turns the mode on and allows the original message/stack; never enable it in production and test it in isolation, because it changes shared state. A direct SSR failure reports/rethrows the original to the caller; control Responses/envelopes have another contract.

Pitfall: sanitizeServerError only acts on a throw. A throw of a plain Error arrives as Internal Server Error; return Error goes through with message/cause/properties, non-enumerable ones whose descriptor has a value included. An instance of a non-Error class comes back by the same reference, without filtering content. The traversal only uses string keys, not Symbol; getters are only read when enumerable or when the descriptor has a value. That does not sanitize an SDK/domain. MarkSafeError uses Symbol.for("solid.SafeError") and must only mark a public error, never make a raw return safe.

Contract: the server onError can map a value meant for the client without additional sanitization. Do not return/log the original; protect the operation and the output validation before the transport, selecting public fields and creating new errors. Do not reveal the existence of a private resource. Do not enable logs with tokens/cookies/payload for convenience.

## Experimental server components

Contract: a preview outside the 2.0 stability. Explicit adoption: a UI task does not authorize an experimental architecture/transport/deploy. A server function can return a component mounted with `dynamicComponent` (or `dynamic`). Arguments go to the server; the props of the returned component are client slots, client components placed through a `Slot`, and do not redo the query by themselves; binding slots were removed before 2.0.0. $key is the identity of the slot protocol, not a universal list key nor a replacement index. asyncArg accepts a Promise/AsyncIterable in a slot prop keeping the resolved type T, and stays experimental.

Recipe: `serverFunctions: { components: true }`, or components "external" with a documented binding by the host. It reuses the RPC endpoint/compilation/security. The generated SSR start calls installServerComponents from @solidjs/web/frames before hydrate; an authored entry calls it once and the server receives the frames render plugin.

Pitfall: sideEffects false in @solidjs/web allows removing an import without a call. No use client/made-up Next.js conventions. Align client/server/codec; test production/HMR and the full manifest. Markup/props can leak data. The router installed with the verified base exports `serverRouteComponent` from the root (the router of the previous base did not have it); its contract was not validated in this skill. Ordinary UI/forms can use client/async/SSR/RPC components.
