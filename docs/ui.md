# Components, theme and styles

[Back to the README](../README.md)

## Buttons

`Button`, in `components/atoms/`, accepts the native props of `button`, with
`type="button"` as the default, plus `variant`, `size` and `class`. For a button
with text only, use `label`: `<Button label={m.save()} />` reads better than
opening the tag around the text. Use `children` when the content has an icon or
other markup. With both, `label` wins. The prop becomes the visible text and the
accessible name of the button; for a button with an icon only, use `aria-label`.

The `label` prop is a decision of the project and is part of the kit offered to
the derived applications. Do not remove it for duplicating `children` or for
having no production consumer in the demo.

## Fields, dialogs and notifications

`Input` and `Textarea`, in `components/atoms/`, accept the native props,
including `ref`, `name`, `required`, events, `value` and `defaultValue`. The
initial value also shows up in the server HTML. Use `value` with a signal to
control the field, or `defaultValue` to leave it under the control of the
browser and allow the native form reset. If both come together, the controlled
value wins, in the server HTML too. `Textarea` allows vertical resizing. Both
accept `variant="destructive"`, which also sets `aria-invalid` when the consumer
does not provide that attribute. Associate a `label` with the `id` and use
`aria-describedby` to link the help or error message to the field. The texts of
the form belong to the catalog of the page.

`Dialog`, in `components/molecules/`, uses the native `dialog` element with
`showModal()`. It receives `open`, `onOpenChange`, `title`, an optional
`description` and `children`. The consumer keeps the state, for example
`open={open()}` and `onOpenChange={setOpen}`. The title and the description are
associated with the modal through ARIA attributes; the close button is already
translated. Escape and that button request the closing; clicking the backdrop
keeps the modal open. The browser confines the focus to the modal and returns it
to the source control on close. A modal that starts open becomes modal after the
hydration.

`Provider` already installs a `ToastProvider` for the application. Call
`useToast()` from `@/components/atoms/ToastProvider/useToast/index.ts` while
creating the component and use the API in the events:

```ts
const toast = useToast()
const id = toast.show({ message: m.save_pending(), variant: 'loading' })
toast.update({ id, message: m.save_done(), variant: 'success' })
toast.dismiss(id)
```

The messages of the example must exist in the catalog of the consumer in the
three locales. The API accepts plain text and the `info`, `success`, `warning`,
`error` and `loading` variants. The default duration is five seconds; `loading`
without a duration and `duration: 0` stay until they are closed. Updating the
variant or the duration restarts the timer; updating only the text keeps the
remaining time. Hover, focus and a hidden tab pause the timer. The queue keeps
up to five notifications and, when that limit is exceeded, removes the oldest
one that is not hovered or focused. The screen reader announcements are grouped
by priority; errors use the assertive region. A notification does not move the
focus when it appears. If the removed notification holds the focus, it moves to
the close button of the neighbor or, without a neighbor, back to the element
focused before entering the region. Each provider has its own state and releases
the timers when it unmounts.

## Dropdown menus

`DropdownMenu`, in `components/atoms/`, follows the APG menu pattern: arrows,
`Home` and `End` move between the items, `Escape` closes, and `Tab` closes
without trapping the focus. Selecting an item, by keyboard or by pointer,
returns the focus to the trigger; with the pointer, the browser does not show
the `:focus-visible` ring. In keyboard navigation, the focused item gets the
global focus ring, plus the highlight background. Clicking outside closes the
menu and keeps the target of the focus.

The theme and locale triggers include the current state in the accessible name:
the locale one starts with the code shown on the button, such as "EN, select
language", and the theme one reports the current preference after the hydration.
Both depend on JavaScript.

## Theme and persistence

The theme starts at `system`. The `app-theme` cookie keeps the preference for
one year, with `Path=/`, `SameSite=Lax` and `Secure` on HTTPS, restricted to the
current host. `Document` reads that cookie in the request and delivers the
explicit theme in the HTML. The script directly in the `head` resolves the
system preference before the hydration, and `Provider` keeps one state instance
per tree. The switcher applies the choice right away, before trying to persist
the cookie. `BroadcastChannel` syncs tabs of the same origin; when the tab gets
the focus back, becomes visible or receives `pageshow`, it reads the cookie
again. Without the channel, the sync happens on those events. If the cookie
cannot be written, the choice stays in memory and can still be propagated
through the channel. It is kept when returning to the tab while the cookie does
not change and is lost on reload. The theme does not use `localStorage`.
`infra/adapters/themeStorage/` reads and writes the cookie,
`infra/adapters/applyTheme/` applies the theme to the DOM,
`infra/adapters/makeBroadcastChannel/` wraps the channel between tabs for any
domain, `infra/adapters/makeThemeChannel/` holds the theme rule over that
channel, `infra/adapters/makeSystemTheme/` watches the system preference and
`@types/theme.ts` defines the shared types, keeping `theme/` for CSS only. The
colors use `light-dark()` with `color-scheme` to define each pair once and
follow the theme of the document.

## Fonts

Inter comes from the `@fontsource-variable/inter` package, stored in
`src/assets/fonts/` and declared in `src/theme/tokens/fonts.css`. They are
variable files: each one has every weight from 100 to 900, so a derived project
can use any `font-weight` without downloading another file.

The `latin` subset covers the text in pt, en and es: letters, numbers,
punctuation, accents, quotes, dashes and `€`. It is the only file with a
preload, in `Document.tsx`. `latin-ext` has the extra Latin letters, such as
`Ł`, `ő` and `ş`, and does not replace `latin`. It is in a separate file, linked
through `unicode-range`, without a preload: the browser only downloads it when
the page has some character of that range. The two `unicode-range` values are
the ones in the CSS of the package.

The files of the package go out without the glyph names of the `post` table,
which the browser does not use: that is 1.5 KB less in `latin` and 3.2 KB in
`latin-ext`, with identical rendering. All the OpenType features stay,
fractions, tabular numbers and the positioning of combining accents included,
because a derived project can use them. The package is not a dependency of the
project: to update Inter, download it and run this on each file of its `files/`
folder, writing it with the same name in `src/assets/fonts/`:

```sh
uvx --from fonttools --with brotli pyftsubset <package-file>.woff2 \
  --unicodes='*' --layout-features='*' --name-IDs='*' --notdef-outline \
  --flavor=woff2 --output-file=src/assets/fonts/<package-file>.woff2
```

To support another alphabet, such as Cyrillic or Greek, process the file of that
subset the same way, copy the matching `unicode-range` from the CSS of the
package and add a `@font-face` with the same family. Do not replace `latin` with
another subset or join subsets into a single file: the visitor would download
characters the page does not use, or the common text would fall back to the
system font. Check the coverage of a file with
`fc-query --format='%{charset}\n' <file>`.

## CSS rules

Run `vp run lint:css` to check every CSS file of `src/`. The command is part of
`vp run lint` and `vp run check:ci`. The pre-push hook and the CI run that
check. The pre-commit hook uses `vp run check:fix`, which generates the i18n and
calls `vp check --fix` on the staged files, without running the CSS lint.
`vp lint` and `vp check` called directly are still the built-in commands of
Vite+.

- Classes across the project use snake_case, such as `.home_link` and
  `.sr_only`. One-word names, such as `.btn` and `.page`, are still valid.
- Components with variants and sizes use classes independent from the base
  class, with the `variant_` and `size_` prefixes, such as `.variant_default`
  and `.size_sm`. Concatenate the prefix with the value of the prop when
  accessing the CSS Module, without constant maps. Use nesting for the states
  and media queries of each class.
- Tokens use kebab-case names, such as `--color-primary-hover`. The
  `custom-property-no-missing-var-function` rule detects a missing `var()` for
  tokens declared in the same file. In the properties that require tokens,
  values without `var()` are refused too.
- The tokens of `src/theme/tokens/` make up the palette offered to the derived
  applications. A token without a consumer in the demo stays in the theme: no
  use here does not mean dead code or a reason to remove it.
- Invalid selectors and media queries are errors, as are deprecated selectors,
  such as `:focus-ring`, and selectors that never match an element, such as
  `:is(::before)`. Duplicated selectors in the same context, duplicated steps in
  `@keyframes` and `@charset` outside the start of the file are errors too.
- Unknown names and values in media features, operators without the required
  spaces in `calc()` and an `@import` in an invalid position are errors.
- Outside `src/theme/`, literal colors are forbidden in any property, custom
  properties included: hexadecimals, color names and the `rgb()`, `rgba()`,
  `hsl()`, `hsla()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, `color()`
  and `device-cmyk()` functions, plus `color-mix()`, `light-dark()` and
  `contrast-color()`. The `value-type-custom-property-required-list` rule
  requires a token in every value of the `<color>` type, inside shorthands such
  as `border` and `outline` too, and so it also refuses system colors such as
  `Canvas`. Stylelint still treats that rule as experimental, and it skips the
  values with a `var()` it cannot resolve, such as an unknown variable with a
  fallback.
- That is why `declaration-property-value-disallowed-list` also looks for the
  system colors by name in the text of the value: the current ones, such as
  `Canvas` and `Highlight`, the deprecated ones, such as `Window`, and the
  WebKit ones, such as `-webkit-focus-ring-color`. The search reaches fallbacks
  and custom properties, such as `outline: var(--width, 2px) solid Canvas` and
  `--x: Canvas`. The properties without color that take free names or text
  (`animation`, `transition`, `will-change`, `grid-*`, `container`, `counter-*`,
  `view-transition-*`, `font-family`, `content`, `quotes`, `list-style` and
  `page`) and the paths of `url()` stay out. So `grid-area: menu` is still
  valid, and a custom property that keeps a free name equal to a system color,
  such as `--area: menu`, needs another name or an exception with a reason. The
  rules catch mistakes, not deliberate workarounds: an escaped name, such as
  `C\61 nvas`, in a value with an unknown variable, the `-moz-*` colors and a
  typed `attr()` pass.
- `declaration-property-value-allowed-list` requires the value to be made only
  of tokens with `var()` in the color properties, `background`,
  `background-image`, `fill`, `stroke`, shadows, `font`, `font-size`,
  `font-weight`, `z-index` and the border radii, physical and logical. The
  property names are compared without case and also with a vendor prefix, so
  `FONT-SIZE: 14px` and `-webkit-box-shadow: 0 0 4px 2px` are errors. Tokens can
  be combined by a space, a comma or a slash, such as
  `var(--ring-focus), var(--shadow-sm)`. In `font`, the line height after the
  slash can be raw, such as `var(--font-size-14)/1.5`, because `line-height` has
  no token. Raw values between tokens and `var()` with a fallback are refused.
  Local functions are not allowed; shared gradients live in the tokens. Values
  such as `transparent`, `currentColor`, `inherit`, `none` and `auto` are
  allowed. The theme can define the values and keep the system colors used in
  the high contrast reset. The rules do not apply automatic fixes.
- A value that does not fit the tokens comes in as an explicit exception, with
  the reason after `--`:
  `/* stylelint-disable-next-line declaration-property-value-allowed-list -- the external icon needs 13px */`.
  The `reportDescriptionlessDisables` option makes a comment without a reason an
  error.
- Outside `src/theme/`, `declaration-property-custom-property-allowed-list`
  requires the token family of each property: `--color-*` in colors, `fill` and
  `stroke`, `--radius-*` in radii, `--color-*` or `--gradient-*` in
  `background`, `--gradient-*` in `background-image`, `--shadow-*` or `--ring-*`
  in `box-shadow` and `--font-*` in `font`. `font-size`, `font-weight` and
  `z-index` accept only `--font-size-*`, `--font-weight-*` and `--z-index-*`. So
  `font-size: var(--radius-8)` is an error, even though `8px` is a valid font
  size. Since the tokens have no text shadow, `text-shadow` accepts no token:
  besides keywords such as `none`, the value needs an exception with a reason.
  `border` and `outline` stay without that restriction, because the shorthands
  can combine tokens of different families. The rule checks the family, not
  which token of it was chosen.
- A custom property declared outside the theme follows its own name. With the
  prefix of a token family (`--color-`, `--gradient-`, `--radius-`, `--shadow-`,
  `--ring-`, `--font-`, `--font-size-`, `--font-weight-` or `--z-index-`), it
  only accepts tokens of that family, combined as in the matching property:
  `--radius-button: var(--radius-8)` is valid, and `--radius-button: 0` or
  `--font-size-14: 13px` are errors. With another name, such as
  `--button-radius: 0`, the declaration is free, but it does not go into a
  property that requires a token, because the family does not match.
- Unknown properties, values, units, hex colors, pseudo-classes,
  pseudo-elements, type selectors and at-rules are errors, as are values that
  cannot be parsed, such as `calc(1px + 2)`. `:global` and `:local` are not
  allowed; the global styles live in `src/theme/`.
- Duplicated declarations and shorthands that override earlier properties are
  errors. Consecutive fallbacks with different syntaxes are allowed.
- Animation names must have a `@keyframes` in the same file or in the shared
  references, including `src/theme/class/animation.css`.
- `no-unknown-custom-properties` refuses a `var(--token)` without a definition
  in the same file or in `src/theme/tokens/**/*.css`. For example,
  `var(--backgroud)` is an error; `var(--color-background)` is recognized. The
  native rule accepts unknown variables with a fallback, such as
  `var(--optional, 0)`; in those values the type check does not resolve the
  variable, and the colors are still blocked by the search by name. The shared
  references come from the `referenceFiles` option of Stylelint.
- Outside `src/theme/`, routes included, the required name is
  `styles.module.css`. In `src/theme/`, use names such as `colors.css` and
  `zIndex.css`.
- The limit is two levels of nesting inside a rule. Stylelint ignores at-rules
  at the root when counting that depth.
- `stylelint-use-nesting` points out adjacent selectors and media queries that
  can be nested. That rule does not find every nesting opportunity between
  distant blocks. The commands of the project do not apply automatic CSS fixes,
  to keep the order of the cascade.

The `project/css-filename` rule of the local Oxlint plugin validates the names
of the CSS files referenced by imports and re-exports in JS/TS. The `lint:css`
command reuses that validation for every CSS file in `src/`, those without
imports in JS/TS included.

`vp run test:tooling` checks the behavior of the checkers with in-memory cases
and runs in the hooks and in CI. The lint of the real CSS is still automatic,
and its violations block the validation until they are fixed.

## CSS processing

`vite.config.ts` uses Lightning CSS (`css.transformer: 'lightningcss'`) to
transpile nesting, `light-dark()` and prefixes for the browsers of the default
Vite Baseline, lowering modern colors only when the target requires it.
`light-dark()` becomes the `--lightningcss-light`/`--lightningcss-dark`
variables, switched by the `prefers-color-scheme` media query and by the
`.light`/`.dark` rules of `src/theme/tokens/colors.css`. The inline
`color-scheme` applied by `applyTheme` does not change those variables: the
manual theme switch depends on the classes on `<html>`, so keep the
`color-scheme` declaration in those rules. Vite+ handles the CSS imports and the
minification in the build, and the same configuration applies to the Nitro
builds and to the Vitest `browser` project.

The CSS Module classes follow the `[content-hash]_[local]` pattern
(`css.lightningcss.cssModules.pattern`). The default `[hash]` of Lightning CSS
includes the query of the module, and the development SSR of the Solid plugin
imports each stylesheet with `?inline` to deliver the style in the first HTML:
with the default, the component and the inline stylesheet would generate
different classes
([vitejs/vite#23735](https://github.com/vitejs/vite/issues/23735)). Do not use
`[name]_[local]`, because every module is called `styles.module.css` and the
classes would collide, or `[content-hash]` without `[local]`, which joins all
the classes of the stylesheet into a single name. Since the name comes from the
content, editing a CSS file changes the generated classes and the hash of the JS
chunk that imports the stylesheet, and two stylesheets with identical content
share the names; that is only safe without relative `url()`, `@import` or
`composes`, which would point to different targets.
`tooling/lightningCssModules/` loads the real `vite.config.ts` and checks that
the normal import and the `?inline` one use the same class and that the classes
stay distinct between selectors and between modules. When a version of Vite+
brings [vitejs/vite#23736](https://github.com/vitejs/vite/pull/23736), the
pattern can go back to the `[hash]` of Lightning CSS, as long as that test keeps
passing.

## Local SVGs as components

`unplugin-icons` loads the `my-images` collection from `src/assets/images/` with
`FileSystemIconLoader`. The home page shows the import of the Solid logo:

```tsx
import SolidLogo from '~icons/my-images/solid'

import S from './styles.module.css'

<SolidLogo class={S.logo} />
```

Add `.svg` files to that folder and import them by name, without the extension.
The original colors are kept. PNG, JPEG and WebP are still common images. The
plugin configuration already adds `aria-hidden="true"` to the imported SVGs; do
not repeat the attribute on each use of the component. `src/@types/icons.d.ts`
declares the components with the types of `@solidjs/web` to keep the icons
aligned with the API the project uses.

The
[Solid SVG comes from the official Vite template](https://github.com/vitejs/vite/blob/main/packages/create-vite/template-solid/src/assets/solid.svg).

The ready-made icons use the `@iconify-json/hugeicons` collection through the
same plugin. The theme switcher uses, for example,
`import IconSun from '~icons/hugeicons/sun-01'`. Only the imported icons go into
the build.
