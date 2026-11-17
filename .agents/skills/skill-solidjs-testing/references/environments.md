# Environments: happy-dom, jsdom and browser mode

Choose by the [proof you need](../SKILL.md#choose-by-the-proof-you-need); configuration in [Vitest](vitest-config.md). The limitations below were observed in the verification environment of the skill. Updating the emulator, the plugin or the browser requires checking the relevant behavior again.

## happy-dom

- `<p>{count()}</p>` starting at 0 renders empty; the next update throws `TypeError: Cannot set properties of null (setting 'data')` and causes `REACTIVITY_HALTED`. Chromium keeps the zero. Test that numeric path in browser mode, without turning it into a string just to pass.
- There is no `reportError`; check the [halt channel](mount-dispose-diagnostics.md#reactive-halt) in the browser.
- The plugin injects `@testing-library/jest-dom/vitest` into `setupFiles` when it is installed, unless a setup path already contains `jest-dom`. Do not register the matchers twice.
- In the jest-dom of happy-dom and jsdom, `toHaveTextContent('n=1')` accepts `n=10`. For an exact value, use `textContent` with `toBe` or an anchored regex. In browser mode, `expect.element(...).toHaveTextContent('n=1')` compares the whole text; the partial search and the regex stay in `toMatchTextContent`.
- A synthetic `PointerEvent` only crosses a shadow root with `composed: true`. Focus restoration after reordering a `For` was observed in happy-dom and Chromium; that does not cover every focus behavior.

## jsdom

The results specific to happy-dom do not establish the behavior of jsdom. For focus, layout and native API contracts, use the browser that shows the required behavior.

## Browser mode

The plugin does not inject jest-dom when `browser.enabled`; the assertions come from `expect.element`. In Chromium, `await userEvent.click()` returns with the DOM settled.

## jest-dom types

The plugin injection happens at runtime. The tsconfig of the tests must include `@testing-library/jest-dom/vitest` in `types` to recognize the matchers. An import of `@vitest/browser-playwright` in any file of the program, the config included, also declares them and can hide the gap.

## Forms

`checked` can change through the native action even with a broken reactive handler. Besides the visual state, check that the field is included in and removed from `FormData` when checking, unchecking and disabling. Contracts in [forms](../../skill-solidjs/references/11-forms-and-accessibility.md).

## Portal

The content stays outside the mount host. Check the real target and its disposal; context and delegated events follow the logical branch. These contracts were observed in Chromium, without an equivalent Portal proof in happy-dom.
