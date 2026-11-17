# SolidJS 2 examples

Examples adaptable to the base recorded in the [frontmatter of the skill](../SKILL.md).

## Small examples

- [Counter](counter.tsx): derivation and a two-phase effect.
- [Context](preferences-context.tsx): a Solid 2 provider with per-instance state.
- [Observed ref](observed-ref.tsx): setup under an owner and a cleanup returned from `onSettled`.

## Tasks with optimism

[Tasks](tasks.tsx) receives the API through a prop. It is captured with `untrack` and must stay stable per instance; changing the backend or the user context requires remounting the model.

The [types](task-types.ts) and the [parser](task-validation.ts) are part of the example. The adapter calls the parser at the input. `api.create` must accept the correlation ID sent, and `api.list` must return it after the confirmation, to keep the identity of the row.

- The form and the draft stay outside `Loading` and `Errored`, remaining editable during loading and failure.
- A plain `Set` reserves `form` and `task:<id>` before the action. The guard is local to the instance; the optimistic flag per key feeds `disabled` and `aria-busy`.
- Plain messages are written after the Promise of the action. Writing them in the same tick as the call would hold them until the settle.
- A confirmed write with a failed refresh says that it saved, clears the saved draft and keeps the error of the list. A write failure keeps the field and undoes the optimistic row.

Each submission creates a new ID. If the server wrote before the response failed, a new attempt must reuse the ID or be deduplicated by the backend. The API of this example does not cancel requests; unmounting the screen does not guarantee stopping the transport.

## Integrations

[List with local state](list-with-local-state.tsx) keeps the selection by ID separate from the optimistic records. The selection lasts while the parent exists; filtering and pagination do not erase it.

[Cancellable operation](cancellable-operation.ts) prevents a late application and notifies the `AbortSignal`; an operation that ignores abort can keep going and return a resource that still needs disposal.

[External sync](external-sync.ts) calls that operation in the apply of an effect. Its accessor must read every reactive input in the compute. `apply` and `fail` are synchronous; the chain observes accidental rejections, but does not undo effects already started.

For regressions of these contracts, see the [scenario selection](regression-matrix.md).
