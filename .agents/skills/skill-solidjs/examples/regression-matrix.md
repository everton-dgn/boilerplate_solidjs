# Specific regressions

Scheduling, props, granularity and disposal are in the [matrix of the testing skill](../../skill-solidjs-testing/references/reactivity.md#sequences-that-discriminate-errors). For the advanced contracts of the examples, add only the relevant scenario.

| Contract | What sets a useful test apart |
| --- | --- |
| Confirmation through `until` | Deliver the confirmation before and after the wait; a row that is only optimistic or the confirmation of another ID does not release the operation |
| `refresh` in an async helper | Limit the time of the Promise of the action and observe the source during the wait, with an independent source and another one that reads state written by the action: the action must settle and the new value cannot show up earlier, according to [actions](../references/10-actions-optimism-and-confirmation.md#generators-and-reentry) |
| `refresh` with an equal value | The Promise ends even without a new publication because of equality; counting renders alone misses that result |
| Separate visual state | The rollback of the title does not erase the selection by ID; a temporary filter is not equivalent to a deletion |
| Shared boundaries | Compare a single reader with two boundaries reading the same source, according to [R03](../references/17-known-risks.md#r03-on-and-a-boundary-created-during-a-hold) |
| Retention during an action | Compare resources without an open action, during the wait and after the settle/disposal, according to [R01](../references/17-known-risks.md#r01-subscription-retention-during-a-pending-action) |
| Progressive hydration | Interact after the shell and before the last region of the stream; check listeners and identity after the end |
| Server error | Look for a synthetic marker in HTML, chunks, RPC and logs; `throw Error` and `return Error` have different exposures |

This list selects proofs; it does not state that every scenario was run.
