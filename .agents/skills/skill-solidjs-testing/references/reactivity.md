# Primitives, stores and actions

Contracts in [reactivity](../../skill-solidjs/references/02-reactivity-and-ownership.md), [effects](../../skill-solidjs/references/03-effects-and-lifecycle.md), [stores](../../skill-solidjs/references/05-stores-and-projections.md) and [actions](../../skill-solidjs/references/10-actions-optimism-and-confirmation.md).

## Recipe: primitive under createRoot

Create the model under an owner, register the disposer and do the writes after `createRoot` returns. A write in the body of the root throws `REACTIVE_WRITE_IN_OWNED_SCOPE`; `ownedWrite` must not mask that in the fixture. The initial apply of an effect waits for the next flush, automatic through a microtask or explicit with `flush()`.

A primitive that reads context needs a probe component under the provider. To prove disposal, first observe a successful update; only then dispose and try to update again.

## Store and action

For store granularity, count the runs of the consumers of the affected and unaffected leaves. Observing only the final value misses that difference.

Invoke the action after the setup, outside the root body and the memo/effect computes; the apply of `createEffect` is an imperative phase and allows the call. In a fixture that still has an ambient owner, use `runWithOwner(null, fn)` to stand for the handler. The optimistic overlay also reverts on success: confirm that the authoritative source returns the data after the write and the refresh. Testing only the failure would approve an action that never writes.

## Sequences that discriminate errors

Choose the rows relevant to the changed contract.

| Area | Sequence and observable |
| --- | --- |
| Setters | Two functional updates before the flush; composition kept |
| Conditional memo | Write in the inactive branch, switch and switch back; runs and updated value |
| Effect | Change a read of the apply and then of the compute; dependencies and cleanup per run |
| Props | Change a prop on the mounted instance; new value without remounting |
| For | Reorder IDs and update the payload; local state and focus of the entity |
| Async | Start A and B, resolve B before A; A does not overwrite B |
| Optimism | Overlap changes and fail one; keep the confirmation of the other |
| Owner | Dispose the parent and fire a late callback; no reconnection under a dead owner |

## Pitfalls

- `NotReadyError` must be the class from `solid-js`. A local class with the same name becomes a real failure for `Loading` and `Errored`.
- `isPending` can absorb an error of its own callback and return `false`; also observe the failure so you do not conclude it succeeded.
- An async reader created under an already disposed owner does not publish. Keep a consumer alive during the wait.
- Microtasks, actions and timers have [different waits](settle-and-wait.md).
