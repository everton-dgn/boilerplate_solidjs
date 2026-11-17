# Cancellation and live sources

Base: [verified revision](../SKILL.md), reverified on 2026-09-29.

## Responsibility and cleanup

Use an async source of the graph for rendered data; a split effect for imperative integration. The apply must return a synchronous cleanup. A setter draft kept after the run loses writes; do not capture it in a timer or Promise. The draft of a projection or derived store holds until the next run of the derivation ([R10](17-known-risks.md#r10-a-late-write-through-the-draft-of-a-projection-is-dropped-without-a-warning)). Action reentry after `await` has its [own contract](10-actions-optimism-and-confirmation.md#generators-and-reentry).

## Imperative operation

Contract: the compute captures the inputs that restart the work, replaceable transport included. The apply starts the task and returns a canceler right away; an AbortController per run and a guard block an old response even without cooperative abort. Check validity again between resolving and applying. The utility tells completion/cancellation/unknown failure apart; cancellation is not success. A callback failure goes to the platform through a microtask.

Recipe:
```ts
createEffect(
  () => ({ id: id(), read: transport() }),
  ({ id, read }) => {
    const controller = new AbortController()
    let current = true
    void Promise.resolve().then(() => read({ id, signal: controller.signal })).then(
      result => { if (current) return applyResult(result) },
      error => { if (current) return reportFailure(error) }
    ).catch(error => { queueMicrotask(() => { throw error }) })
    return () => { current = false; controller.abort() }
  }
)
```

Pitfall: callbacks must be synchronous; the void type accepts async. The chain observes an accidental rejection, without canceling an effect already started. A task that ignores abort can keep the Promise pending until it ends. The error arm of the effect handles the compute/dependencies, not a later rejection of the apply. Separate canceled/recoverable/unexpected, without an empty catch; the public message and the observation follow the sensitive data policy. Canceling does not undo a database/service. Ignoring a late ImageBitmap does not close it: dispose of the resource explicitly.

## Races and deferred resources

Contract: test A replaced by B, B finished before A, A rejecting while canceled and disposal before the resolution; only B applies. Cover a failed synchronous start, a failed application and a double cleanup. An own source closes in the finally: test leaving before the next value, a rejection and a normal end. Creating an iterator can come before the body/pulls; server functions bind supported deferred work to the context of the call.

Pitfall: losing the reader does not revert the server. Test concurrent requests with slow sources/distinct locals, without a global request nor a shared Response/Headers/session cache. Ordering/cooperative cancellation tests of the utility do not prove the disposal of a Solid owner.

## Origin and CORS

A call from another origin only passes when `csrf.origin` names the `Origin` of the page; `Sec-Fetch-Site: none` and a cross-site request without `Origin` are refused before the matcher: see [configuration and origin](13-server-functions-and-security.md#configuration-and-origin). Acceptance in an HTTP client outside the browser does not prove the flow with preflight and credentials.

## Hooks and invocation

Contract: provideEvent runs the callback exactly once; zero/two is invalid, without a retry in the provider. A non-callable wrapInvocation is refused, makeshift null/false included. Follow the public signature and test HTTP/direct SSR.

Pitfall: two requests can run twice; idempotency of creation/reservation/payment belongs to the domain/persistence.

## Live state

Contract: live delivers successive states of the same query and reemits the current state on each invocation. It composes with GET without implying it: live(GET(fn)). A lost connection can reinvoke with backoff; the state must be rebuildable from the authoritative source, without persisting the same server graph. On the verified base, the call opens `<endpoint>/live/<id>` and receives `text/event-stream` with a heartbeat; on reinvocation, the client sends `Last-Event-ID` with the digest of the last JSON-safe value received and the server leaves out the first reemitted value when the digest is equal. The previous base had neither that transport nor that deduplication.

Pitfall: the event stream of the transport does not make live a generic SSE/WebSocket channel nor durable persistence; `Last-Event-ID` only avoids resending an identical state and is not an event cursor. Identify the adapter/test the recovery. Single-delivery events, history, audit or increments need their own cursor/sequence/dedupe/reconnection; a snapshot is not an event.

## Collection after a write

Contract: collectFlightData takes part in a POST with a single-flight script/header/registered collector, after transformResult, in a return or a Response/envelope thrown as a control. A plain thrown error does not collect. foldFlightData returns right away on a Response with its own body. A collection failure does not undo a confirmed write. Separate domain/invalidation/additional data, keep Set-Cookie separate and use the adapter, without reassembling a private protocol.

Pitfall: configuring a hook/calling directly does not prove the HTTP collection. The catch of the collection logs the original error through console.error even in production, outside the protection of the invocation. Normalize inside the collection and represent an unavailable slice according to the adapter; do not return a raw error nor replace the global console. That path does not prove a leak in a concrete application. Reconciliation must not resend a confirmed mutation.
