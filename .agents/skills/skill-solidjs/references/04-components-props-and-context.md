# Components, props and context

## Props and the call site

Contract: a component runs once per instance. A remount/new identity creates another one; investigate repeated construction. The parent passes a value; the child reads props in the JSX/accessor/memo. The compiler generates a getter for the attribute. A copy/destructuring in the parameter/setup/structural callback freezes the value, except for a static contract.

Recipe:

```tsx
type CounterProps = { value: number }
function Counter(props: CounterProps) {
  return <output data-double={props.value * 2}>{props.value}</output>
}
// In the component that owns count:
<Counter value={count()} />
```

Pitfall: `value={count}` is a type error. Escaping through a cast/any/JS, the text still updates because the renderer inserts a function as dynamic content, but the multiplication gives NaN. A getter only by contract. `{ ...props }` outside the JSX copies values; it does not keep reactivity.

Contract: the last JSX attribute wins, spread included. Put the spread before the controlled attributes and exclude internal props with `omit`. A direct handler of a native element is chosen at mount; an outer ternary stays stuck to the initial handler. Decide inside a stable callback. A spread on an element or on a component forwarded to the button reapplies the new handler.

## Defaults, merge and omit

Contract: `merge` and `omit` create views, without copying values. `merge` lets an explicit undefined from a later source override the default, even after an update; a source with a getter follows the signal, an object with an already read value stays frozen. `omit(props, 'variant', 'size')` returns a view, not a splitProps tuple; it also accepts a predicate.

Recipe:

```tsx
const title = () => props.title ?? 'Panel'
const nativeProps = omit(props, 'title')
return <section {...nativeProps} aria-label={title()}>{props.children}</section>
```

Pitfall: use `??` when the default must survive undefined. Use merge when undefined must win. Prefer explicit names in omit for small sets; a dynamic filter makes the forwarding hard to follow.

## Children and construction

Contract: `props.children` directly covers ordinary rendering. To normalize/reuse, create `children(() => props.children)` once under an owner: it resolves lazily and memoizes; `toArray()` reads the same result. Reading the children getter several times can build the children several times. Reusing the accessor avoids repetition in those reads, without promising an eternal identity after a change or remount.

Recipe: keep the result in reactive reads and use JSX with `<Component ... />`. Tell content apart from a render prop, typing the arguments to distinguish an accessor from a value. `createComponent` is for integration. A shared memo still belongs to the root that created it.

Pitfall: keeping the children result in a non-reactive constant freezes it. Calling a component manually can change creation/ownership. Do not run indiscriminately every function received as a child. Reading children in the when of a Show can build an extra tree, Portal included.

## Context

`useContext` without an owner throws `NoOwnerError` in dev, even if the context has a default; on the stable base, the default build returns the default, or throws `ContextNotFoundError` without one. Do not rely on either: call it under an owner. The class is not exported.

Contract: the context is the provider, without `.Provider`; `Context<T>` extends `ContextProviderComponent<T>`. Without a default, `useContext` returns T and throws when the provider is missing; on the stable base, a provider with `value={undefined}` counts as missing. The error has `constructor.name === 'ContextNotFoundError'`, but the class is not exported. A legitimate absence uses `createContext<T | null>(null)` and a null guard.

Recipe:

```tsx
type Preferences = { theme: Accessor<'light' | 'dark'>; toggle: () => void }
const PreferencesContext = createContext<Preferences>()
const PreferencesProvider: ParentComponent = props => {
  const [theme, setTheme] = createSignal<'light' | 'dark'>('light')
  const value: Preferences = {
    theme,
    toggle: () => { setTheme(current => current === 'light' ? 'dark' : 'light') }
  }
  return <PreferencesContext value={value}>{props.children}</PreferencesContext>
}
```

Pitfall: do not import the class for instanceof; if you need to tell the absence of a provider apart, handle only `ContextNotFoundError` by `constructor.name` and propagate the other errors. An optional context uses a `null` default; `NoOwnerError` is still a lifecycle error. There are no public `createContextProvider`/`createOptionalContextProvider`; they are helpers of other libraries. A fake default must not hide a mandatory provider. State belongs to the provider instance or to the SSR request. An object with accessors/stores/actions stays stable.

## Own state

The visual state of a list must not depend on how long the optimistic overlay lasts. Keep selection and measurements by ID according to the [visual state contract](06-lists-control-flow-and-local-state.md#visual-state-by-identity).
