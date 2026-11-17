# DOM, events and refs

## HTML and attributes

Contract: HTML attributes (class/for/tabindex), camelCase events. TS only accepts `tabindex`; `tabIndex` gives `TS2322`, although Chromium accepts the update of the lowercase attribute. A true boolean writes an empty attribute; false/undefined removes it. The string 'false' keeps disabled and is rejected by the type. Muted is a property: with a dynamic value, the compiler assigns element.muted, without an attribute even with true; a literal `muted` or `muted={true}` goes to the template as an attribute.

Recipe: tell controlled from initial state apart in value/defaultValue, checked/defaultChecked, selected/defaultSelected and muted/defaultMuted. Keep the textual semantics of ARIA: aria-pressed='false' is not universally equivalent to its absence.

Pitfall: indiscriminate lowercase breaks native properties. Custom elements and special properties require checking the integration and the types. Avoid the old prefixes `on:`, `oncapture:`, `use:`, `attr:`, `bool:`, `class:` or style specializations. Migrate by intent: attribute/property/listener/integration, without a blind textual swap.

## Classes and styles

Contract: class accepts a string, a conditional object and an array. A mutated object compares a snapshot per element and adds/removes only the changed tokens; a signal with the same reference needs `equals: false` to rerun the binding. Style uses kebab-case/custom properties, passed to setProperty; undefined removes. CamelCase gives TS2561 and does not apply in Chromium, static or dynamic.

Recipe:

```tsx
<div class={['card', { selected: props.selected }]} style={{ 'background-color': color(), '--space': space() }} />
```

Pitfall: classList is not a current JSX API. A snapshot of classes does not make a raw value reactive. With a CSP without `'unsafe-inline'` in `style-src`, the browser blocks the `style` attribute that the SSR writes in the HTML (a CSP rule, not a Solid one); in that case, use classes. A dynamic update on the client through setProperty (CSSOM) is not blocked.

## Events and propagation

Contract: events are native, without a SyntheticEvent. currentTarget is the element of the handler; target can be a descendant. Capture before await. onInput follows the editing; do not assume the React onChange. Respect the contracts of forms/composition/numbers.

Recipe:

```tsx
<input value={text()} onInput={event => { setText(event.currentTarget.value) }} />
<button onClick={event => (mode() === 'open' ? open : close)(event)} />
```

Contract: a direct handler is read at mount, delegated (onClick) or native (onMouseEnter). A ternary outside the callback fixes the choice. A spread of props/element reads the getter and reapplies the handler. A prop receives a value (`value={count()}`); an accessor can work as text, but a multiplication gives NaN; TS rejects it.

Contract: render/hydrate roots own/clean up the delegation; the application does not clean up the document singleton. Portal propagates a delegated event through the logical tree: the button, then the logical ancestor. A native listener on the logical ancestor does not receive it; on the physical target it does.

Pitfall: test nested roots, ShadowRoot and Portal with real events. stopPropagation keeps the native semantics. Capture/passive/once/options outside the JSX: addEventListener with a cleanup; avoid privates/global v1 cleanup. Lint does not prove these contracts: in the sample, the lint plugin caught a camelCase style/an index captured in For, but not a handler ternary, an accessor in a numeric prop or a capture in Show.

## Fragments

Contract: native rejects a fragment as a direct child of an element; it accepts it at the top, in a component or in an expression. Babel was not tested in this case.

Recipe: remove the redundant fragment or use `<section>{<><p /><p /></>}</section>`.

Pitfall: `<section><><p /><p /></></section>` fails with `Fragments and spread children are not implemented yet`; in Vitest it shows up as an import error.

## Ref and lifecycle

Contract: a ref runs without an owner; it keeps the element/applies DOM with the disposal already registered. The setup of effects/onCleanup/resources stays in the component/factory under an owner. Clean up widgets/observers/listeners/timers, also when the element changes.

Recipe:

```tsx
function SearchField() {
  let element: HTMLInputElement | undefined
  onSettled(() => { element?.focus() })
  return <input ref={value => { element = value }} aria-label="Search" />
}
```

Pitfall: initial focus requires suitable UX, without stealing navigation/assistive technology. A bare variable in a refs array does not get the special assignment of an isolated ref. Effect/cleanup stay in the setup.

## Ref composition and SSR

Contract: an array applies the callbacks in order, flattens arrays and ignores undefined. Restrict the prop to `JSX.RefCallback<T> | undefined`: a broad JSX.Ref accepts an element, but an element in the array is not callable and throws a TypeError. False/null are dropped by the runtime, but refused by the types. A condition is resolved at creation; a later change does not install/remove behavior.

Recipe:

```tsx
type LinkProps = {
  ref?: JSX.RefCallback<HTMLAnchorElement> | undefined
  href: string
  children: JSX.Element
}
function Link(props: LinkProps) {
  const mark: JSX.RefCallback<HTMLAnchorElement> = element => { element.dataset.origin = 'design-system' }
  return <a href={props.href} ref={[props.ref, mark]}>{props.children}</a>
}
```

Contract: replace a directive with a `ref={behavior(value)}` factory or an array; effect/cleanup stay in the factory, the callback keeps the element. Read reactive values in the compute, because a read in the callback does not subscribe and can warn STRICT_READ_UNTRACKED. The factory returns a function/array on every path; the compiler ignores the other returns, undefined included, without a diagnostic. An initial condition uses `condition ? callback : undefined`; reactive changes use the lifecycle.

Pitfall: the factory runs in the SSR, the callback does not receive the element. The effect compute also runs on the server; only the apply is skipped. `ssrSource: 'client'` skips the compute. Window/document in the factory or in a normal compute causes a ReferenceError. On the verified base, composition/optional/update/removal were observed in Chromium; the SSR phases cover default and dev. That does not prove composed hydration/performance.

## Text and hydration

Explicit children suppress `textContent` at compile time; do not combine both forms. In hydratable SSR, a numeric `textContent` can lose the zero and hydration keep the space until the first update. Details and limits in [R07](17-known-risks.md#r07-textcontent-loses-the-numeric-zero-in-the-ssr-html). That path does not support a general performance recommendation.

## Number as the only child

`<output>{total()}</output>` starting at zero works in Chromium, but breaks in happy-dom on the verified base. `{String(total())}` kept 0/5/0 in both environments; converting changes the exercised path, so do not do it in the numeric behavior test. See [test environments](../../skill-solidjs-testing/references/environments.md#happy-dom).

Switching a falsy number and an element as the only child: see [R13](17-known-risks.md#r13-zero-or-nan-as-the-only-child-piles-up-text-nodes-when-switching).

## Namespace

Tags that are ambiguous between HTML and SVG (`a`, `script`, `style`, `title`) need the right namespace in dynamic creation. Changing the logical tag later does not fix the namespace.
