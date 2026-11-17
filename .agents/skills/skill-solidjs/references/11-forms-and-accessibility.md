# Forms and accessibility

Base: [verified revision](../SKILL.md), reverified on 2026-09-29.

## State and inputs

`createSignal(() => props.value)` creates a writable derivation: a local override lasts until the origin changes. For an independent draft, do not use that form as a one-time initializer.

`value`/`checked` are controlled; `defaultValue`/`defaultChecked` are initial. Events are native: capture `event.currentTarget` before `await`.

## Select with late options

Contract: a select with value/onChange follows the code/user on the same node. Without a handler it does not undo the selection of the user, diverging from the state. The runtime applies value right away and in a microtask, without reapplying when the options change.

Recipe:
```tsx
<select onChange={event => setChoice(event.currentTarget.value)}>
  <For each={options()}>{option => <option selected={choice() === option}>{option}</option>}</For>
</select>
```

Pitfall: value alone leaves the first option visible when the options arrive later, even with another value in the state. Multiple/hydration not tested.

## Labels and attributes

Contract: label uses `for` in DOM JSX; the React `htmlFor` does not belong to the types; createUniqueId on the right path keeps the SSR/hydration ID. Link the message through aria-describedby and the state through aria-invalid. Aria-pressed/busy require reactive enumerated text.

Recipe:
```tsx
const id = createUniqueId();
<>
<label for={id}>Name</label>
<input id={id} name="name" autocomplete="name" required />
<button type="button" aria-pressed={active() ? "true" : "false"}>Select</button>
</>
```

Pitfall: in `aria-pressed` and `aria-busy`, a boolean `true` is rejected by the type; a boolean `false` is accepted to remove the attribute. Use the strings `"true"` and `"false"` to convey the state. A cast only hides the type error. In a native boolean attribute, `disabled="false"` disables and `disabled={false}` removes.

## Announcements

Contract: mount an empty region, change the text and moderate repetition in lists. Show/fallback inserts a filled region; use the model status outside Loading/Errored.

Recipe:
```tsx
<>
<p role="alert">{error()}</p>
<p role="status">{status()}</p>
</>
```

Pitfall: Show removes the node when clearing the error; a new filled node may not announce. A region per item requires an empty node; the tasks example uses another contract: the alert only mounts when there is a failure (of validation, of a write or of a load, which arrives through the `Errored` fallback); without a failure, no alert shows. The DOM does not prove an announcement.

## Focus and form cycle

Keyed keeps the identity, but moving the focused node can cause a blur. Use the [focus restoration](06-lists-control-flow-and-local-state.md#focus-when-reordering) after the flush. A form and a draft outside `Loading`/`Errored` stay editable during loading and failure; immediate messages on click follow the [action scheduling](10-actions-optimism-and-confirmation.md#operation-indicator-and-publication-on-click).
