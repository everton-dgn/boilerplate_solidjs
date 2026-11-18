# SSR and hydration

Runtime contracts of the [verified base](../SKILL.md). Tell compiler, runtime, adapter and phase apart; the skill does not certify every combination of a project.

## Render and consumption

Contract: `render` creates client UI; `hydrate` binds a client tree to the HTML and compatible server records. Do not hydrate on every navigation nor use render over SSR as an equivalent. `renderToString` is synchronous and can return a pending fallback. An awaited `renderToStream` delivers the full HTML and replaces `renderToStringAsync`; its interface also allows a progressive delivery. The discovery pass runs synchronously in the call, exposing a failure and the HTTP state right away.

Recipe: choose one channel in the adapter: `pipe` for a Node writable, `pipeTo` for a WritableStream or `readable` for Web Streams/Response. Do a separate render for an inspection that consumes the body.

Pitfall: the guard compares method names and blocks crossed combinations, without guaranteeing a single consumption. Two pipe calls delivered to two targets; a repeated readable gave the same instance; readable followed by await resolved. Avoiding a duplicated delivery is up to the adapter.

## Effects on the server

Contract: createEffect runs the compute, never the apply; createRenderEffect runs both, or only the compute with defer true. `ssrSource: "client"` skips the whole effect; createTrackedEffect does not run. An effect created in a ref factory follows the same rule, compute included.

Recipe:
```ts
createEffect(() => value(), value => { document.title = value })
```

Pitfall: document/window in the compute of createEffect or in the apply of createRenderEffect throws a ReferenceError in SSR. Move the browser access to the apply of createEffect or use ssrSource client. The client phases have their own contract.

## Builds and hydration mismatches

Contract: versions, transforms, owner creation, IDs and the relevant tree must match on both sides. HydrationScript/generateHydrationScript comes before code that depends on the bootstrap and keeps the nonce/CSP/events. Avoid random values, local time, storage and a global counter between requests producing different trees; viewport/browser calls for the client or clientOnly.

Pitfall: hydration does not compare text: it keeps text that diverges from the server without a warning, even in dev. Rewriting the same value on the client does not fix it; only a different value updates. A structural divergence warns `Hydration` only in dev; production is silent. style/setStyleProperty do not change the node during the claim, just like ordinary classes/attributes: the inline SSR stays as the baseline until a later reactive write. Node identity is not enough; an inert button can be exactly the server node. Require a real interaction in production and a captured console in dev, including inputs/buttons after Loading, For and Portal.

## Authored document and slots

Contract: if the server renders the whole document and the client hydrates only a container, NoHydration wraps the shell and Hydration reopens the namespace of the app. In the generated start, the client hydrates the whole document with the same Document; the pair is for an authored subtree entry. NoHydration defines content without client behavior, it does not disguise an incompatible tree.

Recipe:
```tsx
type DocumentProps = { children: JSX.Element }
const Document = (props: DocumentProps) => (
  <NoHydration>
    <html lang="en">
      <head><meta charset="utf-8" /><HydrationScript /></head>
      <body>
        <div id="app"><Hydration>{props.children}</Hydration></div>
        <script type="module" src="/entry-client.js" />
      </body>
    </html>
  </NoHydration>
)
// In the client entry, after finding the container:
hydrate(() => <App />, container)
```

Contract: on the previous base, JSX in a non-children prop, followed by another hole that allocates an ID, could hydrate without events. The compiler of the verified base also scopes the hole that reads that prop (`_$scope`), and dev warns `UNSCOPED_HOLE_ALLOCATED_IDS` when an unscoped hole allocates IDs; the hydration of that arrangement was not probed in a browser. With the previous compiler, pass it through children or render the slot through a component:

```tsx
type SlotProps = { children?: JSX.Element }
type LayoutProps = { header: JSX.Element; children?: JSX.Element }
const Slot = (props: SlotProps) => props.children
const Layout = (props: LayoutProps) => (
  <div><header><Slot>{props.header}</Slot></header><main>{props.children}</main></div>
)
```

Pitfall: a document without the pair or a broken slot leaves an inert server node; dev warns `Hydration key miss`/`unclaimed server-rendered`, production does not. A slot through a component hydrated without a diagnostic in both builds, without proof on a later runtime. An unreproduced report of a write in onSettled/createEffect during hydration also involves a key miss; an unpublished later fix does not certify a local workaround. Reconsider writes in that phase; onMount is not an export of the base.

## Islands and adapter setup

Contract: `clientOnly(() => import("./Chart"))` renders only the fallback or nothing on the server, without calling the loader. The client starts the import when it loads the island module, before hydrate; it claims the SSR fallback and swaps it for the real component after hydrating, without a diagnostic. Lazy and a named export were not exercised.

Pitfall: the body of a component builds structure, but recovery/rebuild/hydration do not guarantee an external effect only once forever. Keep the body pure and the resource with a lifecycle. `untrack` does not exclude snapshot/ownership/readiness: writing a local source and reading it during the setup can mark a replay. Separate the instance, a non-reactive structural initial query and a versioned read; compute the seed before the source when possible. Do not expose internals, use ownedWrite/untrack as an automatically safe initializer or switch everything to ssrSource client. `transparent` is a restricted integration, not a global mismatch fix. Keep identity, per-request isolation and the adoption of the server value.

## Request scope

Contract: session, tenant, permissions and private data need a per-request scope. A shared cache requires an explicit key, isolation and expiration. getRequestEvent can be undefined outside it; provideRequestEvent from `@solidjs/web/storage` establishes a server context and does not enter the client. RequestEventLocals admits module augmentation in a real module, but the type does not fill locals: the handler provides the data. Avoid a .d.ts declaration that conflicts with a .ts of the same name.

Pitfall: a global signal/store leaks between requests. Direct calls of server functions in the SSR receive a shallow copy of locals per call; nested objects stay shared. The response is deliberately shared in the HTTP flow. Do not spread non-null assertions in a utility used on both sides.

## Handler and commit timing

Contract: a synchronous failure without a boundary throws the original error in the call of renderToString/renderToStream before a stream/thenable/readable/Promise exists. In the installed runtime, before rethrowing, the local onError or, without it, the global one receives the failure with handling failed; the return is ignored, so the hook observes without replacing the error (dist and JSDoc of `@solidjs/web`, without a probe; the record of the verified base said no hook was called). A catch chained on the result does not reach it; a try wraps the render and the await of the response. A failure contained in Errored stays 200 with a fallback, while a synchronous one contained by the handler becomes a public 500.

Recipe:
```tsx
type Root = () => Element
function createPageHandler(App: Root) {
  return async (request: Request): Promise<Response> => {
    const event = createRequestEvent(request)
    try {
      return await provideRequestEvent(event, () =>
        createSSRResponse(renderToStream(() => <App />), event)
      )
    } catch {
      return new Response("Internal error", { status: 500 })
    }
  }
}
```

Pitfall: createSSRResponse(stream,event) returns a Promise<Response> resolved on the first write; in 2.0.0 an empty render resolves with an empty 200, and a render that fails or is aborted before the shell resolves with a bodyless 500 (or with the redirect already set). It never rejects, and cancelling the response body disposes the render. With a string it returns a Response. That recipe does not include assets, bootstrap, manifest, RPC, routes or a production adapter. The try covers the render and the wait for the shell, not the later consumption. For an API Response/early exit without that path, use commitEventResponse. A sent shell freezes headers/status; a late redirect uses the client path with the right CSP/nonce.

## Plugin and entries

Contract: use `solid({ start: true, ssr: true })`. `start: { ssr: true }` gives TS2353 and `ssr: {}` TS2322. The typecheck must include vite.config.ts. Start without a top-level ssr boolean is documented as client mode, without running that negative.

Contract: an authored entry-server exports `render(request?, context?)`, returning renderToStream, a string or a Response; context.clientEntry carries the client bundle. Authored entries come as an entry-server/entry-client pair. Server only fails the build with `found entry-server but no entry-client`. `handleRequest` and the default `{ fetch }` belong to the built dist/server/server.js. Exporting handleRequest in entry-server passes the build and fails on the first request with a generic TypeError that does not mention render.

Pitfall: if you do not need the handler/entries/endpoint of the plugin, render/hydrate with your own server or plain HTTP are enough. A green build does not prove the entry contract.

## Status, headers, cookies and cache

Contract: httpStatus(code,text?) and httpHeader(name,value,{append}) declare state for the life of the reactive scope. In the request they write event.response; an awaited renderToString/renderToStream commits on completion and createSSRResponse(html,event) carries status/headers. After the commit, declarations are ignored. A retraction in any order removes only the disposed scope: live cookies stay separate, the status goes back to the last live declaration or the base 200. A disposed Loading pass retracts declarations without removing an outer 404.

Pitfall: an Errored fallback that declared 500/a header and suspended left both after recovering the content, contrary to the promised retraction. Do not rely on it in that arrangement. Outside a request, without storage it is silent; with storage without a request each call warns `RequestEvent is missing`; on the client it is a no-op. Pipe freezing on the first write is documented, not tested. An imperative mutation after the commit throws in dev and reports without applying in production. Authentication that sets a cookie must happen before the shell, not as a late policy.

Contract: parseCookieHeader/serializeCookie are codecs; the vehicle is event.response.headers. Append each Set-Cookie, without a comma, also when copying a response. Set-Cookie does not change the Cookie of the current request. Configure HttpOnly, Secure, SameSite, scope/expiration; the codec does not implement session, signature, encryption, revocation or authorization. A signature does not encrypt and a client Max-Age does not replace server validation/expiration.

Contract: the page renderer does not set Cache-Control; check the adapter. A per-user page needs `private, no-store` on every branch, 401/404/redirect included, before the commit or in a middleware. A public page independent of the session can use `public, max-age=0, s-maxage=60`. Server functions have their own no-store default.

## Escaping and head

Contract: SSR text escapes & and <; an attribute escapes &, double quotes and <, between double quotes, spread included. > and single quotes stay literal. innerHTML does not escape. Test the bytes of the relevant escapes and a DOM parse with a real tag, such as `<b>x</b>&amp;`, checking textContent/getAttribute and zero injected elements; `a < c` does not detect injected markup.

Recipe:
```tsx
type ProductHeadProps = { name: string; summary: string }
function ProductHead(props: ProductHeadProps) {
  const title = createMemo(() => `${props.name} | Store`)
  useHead([
    { tag: "title", props: { children: () => title() } },
    { tag: "meta", props: { name: "description", content: () => props.summary } }
  ])
  return null
}
```

Contract: useHead from @solidjs/web registers per owner; disposal restores the previous winning tags. Props accept getters; children is text, title is a singleton and key changes the dedupe of the other tags. A getter only reads: creating a memo/children in it consumes an ID on one side and misaligns hydration; create it in the body. If the document has no head closing tag, the onHead of renderToString/renderToStream hands the markup to the host. Solid Meta is a documented recommendation for common metadata, a separate package not installed on the base.

Pitfall: the recipe was typed, without comparing the client/server render of both getters. Two reports of the previous base have a fix on the verified base: static text with spread without escaping ([R11](17-known-risks.md#r11-static-text-child-of-an-element-with-spread-goes-out-unescaped-in-ssr), probed) and a useHead stylesheet still loading that caused a TypeError/REACTIVITY_HALTED on hydration (only through the changelog of the tag, without a probe). Test those arrangements before adopting them with an earlier version.

## Errors, sanitization and observation

Contract: an error contained by Errored reaches onError with handling fallback, the stream resolves the fallback; a late rejection inside an element under Loading arrives with handling client and the stream resolves. A local hook wins over the global one; only the global receives it if there is no local one. In dev, contained errors also log SSR_RENDER_ERROR_CONTAINED even with a hook. A synchronous one without a boundary reaches the hook with handling failed and is rethrown before the Promise ([handler](#handler-and-commit-timing)).

Contract: a rejection serialized under Loading also goes through sanitization, even without Errored. Serialization can apply the default before the boundary; do not promise that the return of the hook will replace an already serialized rejection. Errored sanitizes by default only in production, except for markSafeError; dev keeps the original and emits an informative log. Compare builds, without inferring production from a dev payload. configureServerErrors observes globally; to observe without mapping, return no value. The return of the hook is a deliberate exposure without new sanitization; markSafeError only for a public error.

Pitfall: a generic fallback and a sanitized transport do not contain every server exception. Protect infrastructure, validation and output before Solid, creating new public data/errors; an Error returned as server function data does not get the sanitization of a throw. After the shell, handle consumption/rejection/cancellation without trying to replace the whole status/body. Select the public fields of kind, handling, IDs and paths; do not log the original error, token, cookie, PII or payload. getTraceContext correlates the request; arbitrary baggage does not authorize anything nor should go to the log without a policy.

## Late failures and the real artifact

On the previous base, late rejections in certain arrangements ended the Node process even after sending a response; the verified base fixes the reproduced arrangements: [R08](17-known-risks.md#r08-a-late-async-rejection-during-ssr-takes-down-the-node-process). Keep the tree, mode and timing when reproducing it in a disposable process.

Pitfall: the fix covers the measured arrangements, not every late rejection. Run the regression in a child process, recording output, code, signal and timeout; do not swallow unhandledRejection globally. Test shell/region 1, hydrate with region 2 pending, change the cache, finish the stream and observe identity, listeners and the creation/destruction of resources. A fully awaited HTML does not test that window. Include a late failure, an abort and navigation to another owner.

Contract: production must be served by the real test adapter. Source/dev do not cover fields between packages renamed in the optimization. An inert button requires checking the resolved core/web/plugin/compiler/native binary before the event logic; do not fix private attributes. Use server fixtures must enter the effective filter, whose default is src/**; a green build can keep the server body in the client if it is outside it. Check the generated reference, the HTTP registration, the synthetic marker absent from public bundles/chunks/sourcemaps and a real call. One absent marker does not prove the absence of every secret. Skip, a termination signal or a spawn error are not approval.
