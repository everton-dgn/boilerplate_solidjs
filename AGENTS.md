<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Running Scripts

Run TypeScript and JavaScript files with `vpx <file>`, for example `vpx ./scripts/seed.ts --dry-run`. It handles enums, decorators, JSX, and tsconfig `paths`, so do not add `tsx` or `ts-node` to run scripts. `vpx --watch <file>` reruns the file when a file it uses changes, in place of `tsx watch`. `vp node <file>` runs plain Node.js.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Sizing the derived applications

- This repository is a boilerplate for applications of any size. The demo
  pages, data and traffic do not represent the size of the applications that
  will be built with it. Never use the current size of the demo as a reason to
  discard scale requirements.
- When choosing a solution, examine the growth of the data volume, of the
  concurrency and of the number of locales. Identify the cost per request and
  per build, memory, storage and the limits of the runtime environment. State
  which costs grow with the whole set and which stay bounded by batch or
  operation.
- Consider small and large applications, with static or dynamic data, multiple
  instances and concurrent updates when those scenarios affect the contract.
  Operational limits must be explicit and configurable when relevant, with a
  defined behavior when they are exceeded. Do not promise unlimited capacity.
- Prefer paths that work with the default configuration and allow growing
  without rewriting the public contract. If a given scale requires pagination,
  processing outside the request or shared persistence, implement the contract
  the scope needs and document the responsibility of the derived application.
  Do not treat a per-process cache as shared persistence.
- Size the validation by the risks and the real boundaries, failures and
  concurrency included. Use deterministic scenarios for correctness and
  isolated measurements for cost; measure a pilot before raising the load. The
  demo tests do not prove production capacity.
- Considering applications of any size does not authorize speculative
  infrastructure, new dependencies or a wider scope. State the limit of the
  current solution and the concrete change required to go past it.

## Command runtime

- Use `vp run dev` and `vp run build`: the scripts call the local Vite+ CLI
  with Bun explicitly. The built-in `vp dev` and `vp build` commands follow the
  Node selection of the global CLI.
- Keep Node in Vitest, in the tooling tests outside `tooling/release/` and in
  the production SSR until the incompatibilities described in
  [development](docs/development.md) are solved and verified. Nitro chooses the
  runtime of the Vercel function from `engines.node`, so running the build in
  Bun does not switch the function to Bun.
- Knip, the CSS lint, the mocked E2E backend and the release automation run in
  Bun. Validate the automation with `vp run test:release`, which also runs in
  the pre-push. In CI, that suite runs when the automation or its dependencies
  change; the publication keeps the real checks without repeating the tests.
  Only the plan job of the release installs dependencies and imports Vite+
  (`tooling/release/plan-release.ts`); the jobs with write permission use only
  Git, `gh` and `node:` modules. The pre-push runs Knip (`vp run dead-code`) in
  parallel with `test:tooling` and `test:release`; in CI, Knip runs in the
  `Quality` job.
- The `vite.config.ts` tasks that run files of `tooling/`, such as
  `i18n:generate` and the CSS lint, use `bun tooling/<file>.ts`. The `vpx`
  recommended in the managed block above applies to standalone scripts, outside
  those flows.
- To validate changes, use `vp run check:ci` and `vp run test`, not the built-in
  `vp check` and `vp test` commands cited above: they skip `i18n:generate` and
  the CSS lint.

## Dependency documentation

- Do not repeat dependency version numbers in guides, instructions or comments.
  Check `package.json`, `bun.lock` and the workflow responsible for the tools
  installed in CI.
- Document the contract, the limits and the validation commands. When updating
  dependencies, review the behavior and keep the numbers in the files that
  control the installation.

## Generated i18n files

- The official Paraglide CLI can replace and remove modules in `paraglide/`.
  Temporary files produced by the generator in `.paraglide/` can also be removed
  directly, as can the temporary roots created by the tests of `tooling/i18n/`.
  Skipping the trash applies only to those artifacts; the authored catalogs in
  `src/**/i18n/` still follow the rule of deleting through the trash.

## File and folder names of modules

- When a module exports a single function, component or class, use the same
  name and capitalization in the file or in the folder that holds its `index`:
  `makeSystemTheme/index.ts`, `Button/index.tsx` or `readBackend/index.ts`. A
  loose file outside an `index` folder follows the kebab-case required by
  `unicorn/filename-case`.
- Modules with several related exports are the exception. Use a name that
  describes the shared responsibility, such as `themeStorage` for `readTheme`
  and `saveTheme`. When there is a main export and related helper functions,
  the module can keep the name of the main one, such as `createMenuState` with
  `queryMenuItems`.
- Helper types and constants do not, by themselves, make a single-function
  module an exception. Internal functions that are not exported do not affect
  the choice of the name either.
- Do not split related exports just to satisfy this convention, and do not add
  artificial exports to avoid a rename. Exports without a common responsibility
  must be evaluated separately; the naming rule does not authorize an automatic
  reorganization.
- Keep names required by the framework, by the routing or by tools, plus
  generated files and support modules such as `types.ts`, `constants.ts` and
  `context.ts`. This rule does not require renaming organizational folders.
- When renaming a module, update its imports, documentation references and the
  names of the matching tests, keeping the environment suffixes.

## JavaScript and server rendering

- The application requires JavaScript for the interactive controls. Do not
  create navigation fallbacks in `noscript`, classes or scripts to hide controls
  when JavaScript is disabled, or alternative support specific to that scenario.
- Keep SSR, SEO and the initial HTML tests: they check the content delivered by
  the server and the hydration, without promising that the application works
  without JavaScript.

## Translations

- The locales and the base locale come from `project.inlang/settings.json`. Each
  consumer keeps colocated `i18n/{pt,en,es}.json` files. Share in `src/i18n/`
  only from the second production consumer on.
- Use global IDs prefixed with the owner and the same parameters in the three
  locales. Import `m` from `@paraglide/messages.js` and `Locale` from
  `@paraglide/runtime.js`; do not edit `paraglide/` or `.paraglide/`.
- Call messages in the component or in getters. Do not capture the locale or a
  translated text at the top of a module shared between SSR requests.
- Page links use `LocalizedLink`, programmatic navigation uses
  `createLocalizedNavigate()` and redirects use `localizedRedirect()`.
  `localizeHref()` is for composing SEO and index URLs. `paths` keeps the typed
  paths without a locale. Endpoints and assets stay without a prefix
  (`shouldLocalize: false`).
- Keep `AsyncLocalStorage`, the original body of the server functions, the
  document navigation on locale change and the tolerance to blocked cookies.
- Run `vp run i18n:generate` to check parity, duplicates and parameters.
  Integration changes require typecheck, tooling, tests and the i18n E2E tests.
  The split is per page and message; each module includes the three locales it
  uses.
- The repository's code, tests and documentation are written in English. The
  Portuguese and Spanish catalogs, the language labels and the tests that check
  translated texts are the application's internationalization and stay in their
  languages.

## TypeScript types

- Never write large or structured inline types in parameters, return types,
  callbacks or variable annotations, tests included. Extract a named `type`
  before using it. A type with multiple properties, nested objects or members
  that are functions counts as structured; fitting on one line does not allow
  the inline type.
- For example, use `create(context: Context): RuleListeners`, with
  `type RuleListeners = { Program: (node: object) => void }` declared
  separately. Do not use
  `create(context: Context): { Program: (node: object) => void }`.
- Simple types such as `string`, `Theme`, `Theme[]` and `string | undefined` can
  stay inline. Before delivering, review the added signatures and annotations to
  extract inline structures. A passing lint does not waive that review. Follow
  the "Type location" section when extracting them.
- Use `type` to declare object, props and contract types in code and tests. The
  lint applies `typescript/consistent-type-definitions` with `type`.
- Keep `interface` when declaration merging is needed: `RequestEventLocals` in
  `src/@types/solid.d.ts`, `ImportMetaEnv` in `src/@types/env.d.ts` and
  `RouteInfo` in `src/@types/router.d.ts` extend third-party interfaces. Keep the
  lint exception restricted to the files that need that behavior.
- Do not edit generated declarations to swap `interface` for `type`.
  `src/@types/routes.d.ts` belongs to the `filesystem-routing` generator and
  stays excluded from the lint.

## Type location

- Declare small types exclusive to one file in that file, close to the code that
  uses them.
- The criterion for creating `types.ts` is the number of files that import the
  type. With a single consumer, declare it in the file itself and do not export
  it. `types.ts` applies from two consumers on, or when the block goes past about
  30 lines and gets in the way of reading the implementation.
- Do not export a local type just so another file can import it from a
  component, hook, service or other implementation.
- When a type needs to be shared, move it to a types file close to the feature
  and update the consumers.
- Also separate long types when their declarations make the implementation hard
  to read, even with a single consumer.
- Do not create a separate file for each small type, and do not gather unrelated
  types in a global `types.ts`.
- Keep the types that need to be exported as part of an intentional public API.

## Module location

- The consumer criterion applies to any module, not only to functions: helpers,
  constants, configs, schemas, builders and types. The global folders
  `src/helpers/`, `src/constants/` and the shared types in `src/@types/` only
  receive modules with two or more production consumers. A module used by a
  single route lives inside its folder in `src/routes/`, and a module used by a
  single component lives inside the folder of the component.
- A single-consumer constant lives in the file that uses it. When it is a
  config the project edits, it goes into a `constants.ts` in the folder of the
  consumer, such as `DropdownMenu/constants.ts` and
  `(seo)/robots.txt/constants.ts`. Never in `src/constants/` before the second
  consumer.
- Extract constants to express domain meaning, configuration or a shared
  contract. Two consumers, by themselves, do not justify a shared module:
  idiomatic values such as the `-1` of `.at(-1)` stay where they are used. Do
  not create a name, file or comment just to explain the obvious semantics of a
  native API.
- HTTP codes used by the application live in `src/constants/http.ts`, even when
  a code still has a single consumer. The file gathers the protocol statuses;
  add only codes actually used. Tests can keep literal expected values to check
  the contract independently.
- A route that starts needing local modules becomes a folder with `index.ts`:
  `robots.txt.ts` becomes `robots.txt/index.ts`, and what the route consumes
  lives inside that folder. `sitemap.xml/`, `llms.txt/` and `robots.txt/` follow
  that format.
- When a route or component has two or more local helper modules, group them in
  a `helpers/` folder inside the folder of the route or component. With a single
  local helper, keep it directly in the folder of the consumer. `constants.ts`
  and `types.ts` are support modules and do not enter that count. That
  organization does not change the sharing criterion of the global folders.
- A folder or file in `src/routes/` only becomes a route with `export default`
  or with an HTTP handler (`GET`, `POST` and the other recognized methods).
  Colocated modules do not export those names.
- Expected reuse does not justify the extraction. Move to the matching global
  folder when the second consumer shows up, updating imports, tests and the
  matching guides in `docs/`.
- Tests do not decide the location. A colocated module keeps its tests in
  `__tests__/` next to it.

## Cohesion and size of modules

- Use the number of lines as a signal to examine responsibilities and reading
  cost, without imposing a line ceiling for splitting files.
- Extract cohesive blocks that can be understood and changed together, such as
  preparing and publishing a release or querying caches. Keep in the entry the
  sequence that coordinates those operations and the main decisions of the flow.
- Group long configs by responsibility, keeping the values, the precedence of
  the overrides and the evaluation order that has an effect.
- Keep together the operations that depend on the same local context. Avoid
  files with wrappers that only forward calls, fragments without meaning of
  their own or one file per function just to lower the line count.
- Declare the shared contracts close to the feature and keep the private types
  next to their single consumer, respecting the size exceptions of the "Type
  location" section.

## Page modules

- The page's own metadata lives in `seo.ts`, next to `index.tsx`. Export the
  `seo` object with `satisfies SeoRouteInfo` and import it into
  `route.info.seo`. The page still declares `llms`, `markdown` and the other
  route controls explicitly.
- Declare `route.info.markdown: true` on the leaf to publish the representation
  derived from the settled HTML: the build generates one static `.md` per
  locale. Use `'dynamic'` when the content depends on the request; the
  conversion happens on each request. The effective SEO must allow indexing.
  Do not create `markdown.ts` producers, manifests or Markdown-only content.
- Parameterized pages stay out of the build and use the native matching on the
  request. The finite enumeration of the sitemap and llms.txt is a separate
  contract.
- Localized texts and links are getters or calls in the component: do not
  capture the locale at the top of the module. Objects used by the HTML can stay
  as UI data; they do not need to implement a publication contract.
- `seo.ts` lives next to `index.tsx`, without entering the helper count. Do not
  export a default component or HTTP handlers from that module.
- The page body (the texts and data the component renders, such as the
  `content` of about, contact and privacy) lives in `index.tsx`, never in
  `seo.ts`. The route manifest imports the `route` of each page in the initial
  bundle, and everything `seo.ts` imports goes with it: a `content` exported
  from there takes the texts of every page, in the three locales, into the
  initial bundle. The `seo` getters call the messages directly, without reading
  the page object. Do not move `content` to `seo.ts`, to a module `seo.ts`
  imports or to another one the `route` reaches. The `project/seo-module` rule
  (`tooling/seoModule/index.ts`) refuses in the lint any export other than `seo`
  and any local value import in `seo.ts`, and `I18n.production.e2e` checks the
  result in the build; details in [SEO](docs/seo.md). When changing the rule,
  run `vp run test:tooling`.
- Markdown uses a semantic main and the converter filters. Use
  `data-md-exclude` to exclude content; computed CSS is not interpreted. Keep
  contextual citations in a footer inside main.
- Before publishing converted HTML, require a render integrity state that is
  present, completed and without errors. The global hook marks that state; do
  not pass a local `onError` to `renderToStream`, which would divert it. Keep the
  cancellation signal up to `renderToStream` and the streaming of the normal
  HTML.

## Function parameters

- Prefer a single parameter in the project's functions. When there are several
  values, prefer a named object: `makeBroadcastChannel({ name, receive })`.
  Destructure in the signature and name the object type according to the "Type
  location" section.
- The lint allows up to two parameters. That limit leaves room for library
  signatures, without changing the preference for one argument.
- The reason is the call site. With two positional arguments, a boolean or a
  loose string does not say what it means: `publish('dark', true)` requires
  opening the signature, while `publish({ theme: 'dark', persisted: true })`
  explains itself.
- A single parameter stays positional. Do not create an object to wrap a single
  argument.
- The preference applies to the project's functions. Signatures dictated by
  third parties stay as the contract requires, without adaptation: `(request,
  next)` middlewares in `src/middleware/`, test callbacks and Vite plugin hooks.

## Events in JSX

- DOM event handlers and component prop handlers can stay inline when they
  describe a short local action. Building an argument object or using a simple
  guard does not require extraction by itself.
- Extract a named function when there is complex logic, several steps, reuse or
  a name that clarifies the intent. Avoid creating a chain of handlers that only
  forward calls and force switching between the declarations and the JSX to
  understand the element.
- In `ToastProvider`, keep next to the JSX the short pause and close callbacks
  that use the `id` of each `For` item. The section handler that reads the focus
  origin uses `makeFocusOriginHandler`, shared with `OutdatedPageNotice`, and
  updates `focusOrigin` in the local callback. Keep dedicated functions to find
  the neighbor and return the focus.
- `ref` callbacks with a simple call can stay inline. When there is an
  assignment with `=` or additional logic, extract a named function. Render
  callbacks and other props follow their own contracts.
- Apply the rule to new code and to the changed parts, without a mass refactor
  of existing components. The choice between inline and a named function is
  checked in review; the current lint does not enforce that decision.

## Conditionals and control flow

- Avoid chaining conditions with `else if` as much as possible. Prefer guard
  clauses and early returns when each branch can end the flow. A single `if`
  and a simple `if/else` are still allowed.
- To select values by a key, prefer lookup maps when the mapping is direct.
  Consider `switch` for several discrete cases of the same expression, when that
  makes the decision clearer.
- Keep the evaluation order and the exclusivity of the branches. Do not turn an
  `else if` chain into several independent `if` statements that can run more
  than one branch, or into nested ternaries or artificial abstractions.
- Keep `else if` when the alternatives hurt clarity or require duplicating
  common work needed after the branches.
- Apply the rule to new code and to the parts the task changes. It does not
  authorize a mass refactor of adjacent code.

## Exports

- Export in the declaration itself: `export function`, `export const`,
  `export type` and `export default`. Do not use a local list such as
  `export { x }`, `export { x as y }` or `export type { T }`.
- An export list is only valid in a re-export with `from`, such as
  `export { default, route } from '@/routes/(base)/(home)/index.tsx'` in the E2E
  fixtures, because there is no local declaration to mark.
- An empty `export {}` is refused too. To turn into a module a `.d.ts` that only
  has `declare global`, use a real `import`, such as `import 'vite/client'` in
  `src/@types/env.d.ts`.
- `import/exports-last` requires the exports at the end of the file. Declare the
  private types, constants and helpers before them. When an exported value needs
  to exist before the private code that consumes it, move it to a module of its
  own, such as `tooling/backendPolicy/constants.ts`, instead of exporting the
  helpers.
- The `project/no-export-list` rule (`tooling/noExportList/index.ts`, registered
  in the plugin of `tooling/project-plugin.ts`) applies the convention. Validate
  with `vp run check:ci` and, when changing the rule, with
  `vp run test:tooling`.

## Functions that return a Promise

- When a function only passes a Promise along, return it directly, without
  `async`, keeping the `Promise<T>` return type when explicit. That also applies
  to HTTP handlers such as `GET`.
- Use `async` when you need `await` to consume the result or to handle the
  rejection with `try/catch`. Also keep `async` when the contract requires
  synchronous errors of the body to become Promise rejections.
- The lint keeps `typescript/promise-function-async` off to allow that direct
  return. Keep `typescript/require-await` and `typescript/return-await`; do not
  add `await` or disable comments just to satisfy the old `async` requirement.

## Code comments

- Do not add comments that repeat names, types, conditions or steps visible in
  the code. That also applies to JSDoc, function headers and summaries inserted
  by AI agents.
- Comment only a reason or constraint the code does not make clear, such as a
  security requirement, a library incompatibility or a race condition. Use the
  smallest comment that keeps that information.
- Usage guides, architecture decisions and long explanations live in the
  documentation. Do not copy those texts into each implementation.
- Keep tool directives, licenses and relevant contracts. When editing, remove
  redundant or outdated comments in the changed part.

## Boolean names

- The project's own booleans use a prefix that expresses their meaning: `is`
  for state (`isOpen`), `has` for presence (`hasErrors`), `can` for capability
  (`canSubmit`) and `should` for a decision (`shouldLocalize`). Prefer
  affirmative names, without double negation.
- The convention applies to variables, parameters, properties and getters of
  boolean signals. The setter follows the getter: `[isOpen, setIsOpen]`.
- Keep the names of external contracts, HTML attributes, ARIA properties,
  library APIs and generated code, such as `disabled`, `checked` and `reload`. A
  function that performs an action and returns success keeps an action name,
  such as `saveTheme`; the boolean return does not turn it into a query.
- This convention is checked in review. The current lint does not check names
  by the boolean type; do not create generic exceptions or claim automatic
  coverage.

## Signal names

- The destructured pair of `createSignal` uses `[x, setX]`: the setter name is
  the getter name with the `set` prefix. `[isOpen, setIsOpen]`,
  `[isReady, setIsReady]`. Never `[theme, setPreference]` or
  `[systemTheme, setSystem]`.
- When the internal name and the public name differ, rename the getter, not the
  setter, and expose the alias in the return. In `createTheme` the internal
  signal is `[themePreference, setThemePreference]` and the return publishes
  `theme: themePreference`.
- The same applies to `createStore` and any primitive that returns the pair.

## CSS classes

- Use snake_case in every CSS class of the project, CSS Modules and global
  utilities included: `.home_link`, `.radio_indicator` and `.sr_only`. One-word
  names, such as `.btn`, are still valid.
- In components with variants or sizes, use classes independent from the base
  class, with the `variant_` and `size_` prefixes: `.variant_default`,
  `.size_sm`. Concatenate the prefix with the value of the prop when accessing
  the CSS Module, without creating constant maps just to select classes.
- Use nesting for the states and media queries of each class. The variant and
  size classes live at the top level, outside the base class.
- Import CSS Modules as `S`. Stylelint requires snake_case in `src/**/*.css`;
  validate changes with `vp run lint:css` and `vp run test:tooling`.
- The tokens of `src/theme/tokens/` are the palette of the boilerplate for the
  derived applications. Do not flag or remove a token for having no consumer in
  the demo; review only a wrong value, name or use.

## The `label` prop of `Button`

- The `label` prop of `src/components/atoms/Button/index.tsx` is an intentional
  shortcut for a text-only button: `<Button label={m.save()} />`. It has been
  removed and restored more than once. Do not remove it, do not flag it as a
  duplication of `children` and do not treat it as a prop without a consumer;
  details in [UI](docs/ui.md#buttons).

## Dependencies between layers

- Keep `architecture/layer-imports` in `tooling/architecturePolicy/index.ts`.
  `helpers`, `constants`, `@types`, `data`, `infra`, `theme`, `i18n` and
  `paraglide` do not depend on UI, primitives, routes or entries (`App`,
  `Document`, `entry-server`, `entry-client`, `router`, `middleware`). Global
  primitives do not depend on UI, routes or entries; atoms do not depend on
  molecules/organisms, and molecules do not depend on organisms.
- The layer of each component comes from what it puts together: an atom does
  not render another component; a molecule puts atoms together into a unit, even
  when it exports its own pieces, such as `PageHero`; an organism puts molecules
  together into a section of the interface, such as `Topbar`. The lint checks
  only the direction of the imports. Choose the layer when creating the
  component and, when it starts rendering another one of the same layer, move
  the folder one layer up. Criterion and examples in
  [architecture](docs/architecture.md#component-layers).
- Production code in `src` does not import tests, fixtures of `src/tests` or
  `tooling`. The test exception applies as an origin, E2E fixtures included.
  Colocated primitives belong to the layer of the component that holds them.
- Type imports and re-exports also respect the layers. Computed paths and other
  loaders require review; do not work around the policy with dynamic imports or
  disable comments.
- When creating a layer or an alias, update the rule and its tests. Use the
  `vite-plus/lint/plugins` and `vite-plus/lint/plugins-dev` APIs, without
  installing another copy of Oxlint. Run `vp run test:tooling` and
  `vp run check:ci`. See the matrix and the limits in
  [architecture](docs/architecture.md#dependencies-between-layers).

## Security headers and CSP

- Before changing headers, CSP, nonce or the render entries, read
  [docs/security.md](docs/security.md). The headers come from the middleware,
  with the values in `src/middleware/securityHeaders/constants.ts`; do not move
  the CSP or the other headers of the function responses back to `vercel.json`.
  The static files do not go through the function: the Nitro `routeRules` in
  `vite.config.ts` write `Strict-Transport-Security`, `X-Content-Type-Options`
  and `Cross-Origin-Resource-Policy` into them, read from `SECURITY_HEADERS`.
  When publishing a new kind of static file, add the path to
  `STATIC_FILE_PATHS`, without a partial overlap with the other patterns or with
  the other `routeRules`. The `.md` files come in per locale; when changing the
  Paraglide `urlPatterns`, review those patterns. `vercel.json` keeps only the
  `Content-Type` of the `.md` files, which in a route rule would also overwrite
  the errors of the function ([known limits](docs/security.md#known-limits)).
- Do not add `'unsafe-inline'`, `'unsafe-eval'` or hosts to `script-src`, or
  `'unsafe-inline'` to `style-src`.
- Do not render `<style>` or use the `style` prop in JSX rendered in the SSR:
  the CSP blocks the attribute. Use classes.
- Every `<script>` of `Document` receives `nonce={nonce}`, and
  `src/entry-server.tsx` passes `event.nonce` to `renderToStream`.
- Keep the pair of authored entries, with the same tree in
  `src/entry-server.tsx` and `src/entry-client.tsx`, and the `FragmentCss`
  regression, from the `/fragment-css` fixture described in the guide.
- The CSP is not sent in development. Check CSP changes with
  `vp run test:e2e:production`.

## Server errors and backend calls

- Before changing the backend, server functions or SSR handling, read
  [docs/server-errors.md](docs/server-errors.md) and the matching guide:
  [backend calls](docs/server-errors/backend.md) or
  [SSR integrity](docs/server-errors/ssr-integrity.md). Every operation must end
  in public data or in a new public error before it reaches Solid.
- HTTP uses `requestJson`. An SDK or a database requires an adapter in
  `src/infra/server/`, with `server-only` and `protectServerOperation({ run })`
  wrapping the read, the validation and the output. `allowControl` belongs only
  to the global registry of server functions.
- The schema selects the public fields: the structural check of the wrapper
  does not identify confidential data in strings. Do not return errors, nested
  promises or deferred work without a specific contract.
- A public error is only born from `createPublicError()`, imported from
  `@/infra/server/publicErrors/index.ts`; only that module can call
  `markSafeError`. Never publish the message, cause, properties, body or headers
  of an upstream error, inside a result included.
- Do not log the original error, headers, cookies, arguments, bodies or
  credentials; detailed logs require a removal of sensitive data defined
  beforehand. The `console` is reserved for `logServerFailure`.
- Keep the restrictions of `tooling/backendPolicy`. A new SDK requires
  restricting the package in the lint, with an exception only for the adapter.
  Do not work around the contract with disable comments, computed imports or the
  other gaps listed in the guide.
- After changing that boundary, run `vp run test:tooling`, the relevant Node
  tests and
  `vp run test:e2e src/tests/pages/BackendError src/tests/pages/OutsideError src/tests/pages/OutdatedPage`.
  Keep in CI the check of the complete body in the initial SSR, streaming and
  HTTP call.
- On Solid or plugin updates, follow the "Upgrading Solid" roadmap of the
  guide: only remove the wrapper when a reproduction without that interception
  proves the coverage in the installed version.
