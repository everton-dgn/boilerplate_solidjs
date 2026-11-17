# Architecture and conventions

[Back to the README](../README.md)

## Routes and organization

The pages in `src/routes` use `export default` and are found by
`filesystem-routing`. `index.tsx` defines `/`, `[id].tsx` defines a dynamic
parameter and `[...404]/index.tsx` catches unknown paths. `export const route`
sets options such as `preload`, which the fallback uses to answer with HTTP 404.
Components and other modules used by a single route stay in its folder, with two
or more helpers grouped in `helpers/`: without `export default` or an HTTP
handler, they are not registered as pages. There is no need to edit
`src/router.ts` when adding a page.

The `src/routes/(base).tsx` file defines the shared layout with `Topbar` and
renders `props.children` with `RouteSectionProps`. Its `(base)/` folder holds
`(home)/index.tsx`, `about/index.tsx`, `contact/index.tsx`, `privacy/index.tsx`
and `[...404]/index.tsx`. Groups in parentheses do not show up in the URL. The
router matches on the path without the locale; the home page answers on `/pt`,
`/en` and `/es`, and the fallback keeps the navigation bar. `App.tsx` keeps the
provider, the SEO and the global boundary, which also catches failures in the
layout. The E2E fixtures have their own tree and re-export that layout for the
pages, home and 404 included.

API routes are modules of `src/routes` that export `GET`, `POST` or another HTTP
method instead of `export default`. `createAPIHandler` in
`src/middleware/index.ts` answers those requests before the SSR and lets the
others through. After it, `restrictPageMethods` answers 405, with
`Allow: GET, HEAD`, to any other method, such as POST or OPTIONS, on page paths
without a handler: the render would treat the request as a GET in the base
locale. On an API route without a handler for the method, such as
`POST /robots.txt`, the 405 lists in `Allow` the methods the route serves. The
path relative to `src/routes` becomes the URL without the extension, the `index`
segment and the groups in parentheses. So `(seo)/sitemap.xml/index.ts` serves
`/sitemap.xml`; brackets still mark dynamic parameters. A route can return
`Response.redirect()`: since the headers of that response are immutable, the
middleware writes the security headers on a copy.

To correlate the events of a request, use `getTraceContext()` from
`@solidjs/web`: it continues the W3C `traceparent` it receives or creates a
trace for the request.

The plugin generates `src/@types/routes.d.ts` with the typed paths during the
build or in development. Keep that declaration versioned and up to date when the
routes change, so the type check can run before Vite starts.

[tsconfig.json](../tsconfig.json) keeps TypeScript in strict mode, with
`erasableSyntaxOnly` to restrict the TypeScript syntax that needs a
transformation beyond type removal.

Types, specific styles, tests and primitives used by a single component stay
next to it, including `Button/styles.module.css`. The global utilities live in
`theme/class/`, and `theme/tokens/` holds the visual values that the CSS uses.
`helpers/` has shared pure functions; a module used by a single route stays next
to it in `routes/`, without a default export or an HTTP handler, so it does not
become a route. `infra/adapters/` isolates the browser APIs, and `infra/server/`
holds the backend transport, the protection of the operations, the creation of
public errors and the render integrity state. The server modules use
`server-only`; see the [server error contract](server-errors.md). In client
primitives and helpers, the `make` prefix marks utilities without their own
reactive state, such as `makeThemeChannel`, which returns its disposal, and the
`create` prefix marks primitives with reactive state or effects, such as
`createTheme`. On the server, in the routes and in `infra/`, `create` still
names factories without reactivity, such as `createIndexRoute` and
`createPublicationController`.

`entry-client/` gathers the modules that only `entry-client.tsx` uses and that
run once, at browser boot, before `hydrate()`. The `install` prefix marks the
ones that register global listeners and hooks, such as the `vite:preloadError`
event and the single slots of `configureClientErrors` and of the server function
client, and return the function that undoes the registration:
`installLocaleHistoryGuard` and `installOutdatedPageDetection`. Unlike `create`,
it has no reactive state or owner; unlike `make`, it configures `window` or a
whole runtime instead of opening an isolated resource. `entry-client.tsx`
gathers the disposals in a single `import.meta.hot.dispose`. The folder belongs
to the entry layer, and `helpers`, `infra` and `primitives` do not import it.

CSS Module imports use the name `S`, for example,
`import S from './styles.module.css'`. The local lint rule
`project/css-modules-import` requires that form.

## Cohesion of the tooling modules

The split follows the
[cohesion rule of AGENTS.md](../AGENTS.md#cohesion-and-size-of-modules).
`tooling/lint.ts` builds the configuration and its overrides. The groups in
`tooling/lint/rules/` gather the rules for JavaScript, imports, TypeScript,
Unicorn, tests and integrations with the environment. The values of the rules
and the order of the overrides belong to the same contract, even when they live
in different modules.

`tooling/release/automatic-release.ts` coordinates the preparation and the
publication. The modules and the limits of the jobs are in the
[release guide](../tooling/release/README.md). In
`tooling/ciReuse/decideReuse/`, the validation of the evidence stays in the
entry; `hasMainCaches/` checks that the caches are available, and `types.ts`
holds the long contracts used in that decision.

## Data and infrastructure

The content publication keeps the coordination in the entries of the modules.
`middleware/markdownContent/` decides the representation of the request; its
local helpers handle the Markdown routing, the rendering, the HTTP responses and
the static inventory. In `routes/(seo)/sitemap/helpers/sitemapService/`, the
helpers gather the registry of the sources, the read and validation of the
entries, the planning of the index and the publication of the responses. The
cache stays next to the registry that uses it.

`infra/server/publication/` keeps together the counters and the lifecycle that
holds capacity until the producer and the child operations end. Consuming and
cancelling the HTTP bodies is in a local helper. The small limits used only by
the controller stay in the file itself.

`data/formatters/` (formatting of dates, currencies and numbers) and
`data/errorApi/` (normalization of domain errors from APIs) are conventions for
the first consumers and do not have modules yet. Public errors that only the
server uses are in
[`infra/server/publicErrors/`](../src/infra/server/publicErrors/index.ts), next
to the protection of the backend operations; requests and persistence live in
`infra/`.

## Component layers

`src/components/` uses the first three layers of
[Atomic Design](https://atomicdesign.bradfrost.com/chapter-2/). The layer comes
from the components that each one puts together, checked through the imports and
the exports. The size of the file and the amount of inner markup do not change
the layer.

- `atoms/` do not render another component. They can import styles, context,
  primitives and helpers: `Textarea` reuses the CSS of `Input` and is still an
  atom. Its own markup does not count either, so `DropdownMenu`, which receives
  a ready trigger, and `ToastProvider` stay here, with `Button`, `Input`,
  `LocalizedLink` and `PageBadge`.
- `molecules/` put atoms together into a unit with one purpose. `ThemeToggle`
  and `LocaleSwitcher` build on `Button` and `DropdownMenu`,
  `OutdatedPageNotice` and `Dialog` build on `Button`, `SiteContent` builds on
  `LocalizedLink` and `Provider` builds on `ToastProvider`. A component that
  exports its own pieces for the consumer to put together also goes here:
  `PageHero` puts together `PageHeroTitle` and `PageHeroDescription`, which only
  work inside it.
- `organisms/` put molecules together, with or without atoms, into a distinct
  section of the interface. `Topbar` is the header, `SiteArticle` builds the
  body of the content pages and `ErrorFallback` builds the error screen on top
  of `PageHero`.

The `architecture/layer-imports` rule only checks the direction of the imports,
described in the next section. The layer of each component is checked in review:
choose the layer when creating the component and, when it starts rendering
another one of the same layer, move the folder one layer up and update the
imports.

## Dependencies between layers

`architecture/layer-imports`, in `tooling/architecturePolicy/index.ts`, checks
the direct dependencies of imports and re-exports through the local paths. The
restrictions are:

| Source                                                                          | Forbidden dependencies                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `helpers`, `constants`, `@types`, `data`, `infra`, `theme`, `i18n`, `paraglide` | `primitives`, `components`, `routes` and application entries |
| `primitives`                                                                    | `components`, `routes` and application entries               |
| `components/atoms`                                                              | `components/molecules` and `components/organisms`            |
| `components/molecules`                                                          | `components/organisms`                                       |
| Any production module in `src`                                                  | Tests, fixtures of `src/tests` and `tooling`                 |

The entries are `App`, `Document`, `entry-server`, `entry-client`, `router` and
`middleware`. The classification starts from the root of `src`: primitives
colocated inside a component stay in the layer of that component. Tests
(`*.test.*`, `__tests__` and `src/tests`) can import the layers they check. The
generated declaration `src/@types/routes.d.ts` stays excluded from the lint.

In the diagnostics, `base` marks the folders of the first row, `entry` marks the
entries and `source` the other modules of `src`.

The rule normalizes `@/`, `/src/` and relative paths. It checks re-exports,
type-only imports and `import()` with a string or a template without
interpolation. External packages, virtual modules and computed paths are not
resolved. Each declaration is checked in the file that holds it, without
following the chain of imported modules. `import.meta.glob` and other loaders
require review. When creating a layer or alias, update the classification and
the tests. The layer lint does not replace the [server error](server-errors.md)
contract.

The implementation uses `defineRule` and `definePlugin` from
`vite-plus/lint/plugins`, with `RuleTester` from `vite-plus/lint/plugins-dev`,
without an extra dependency. Run the commands from the project root.
`vp run check:ci` checks the current code; `vp run test:tooling` tests the
policy, its registration in the lint and the backend restrictions. Both commands
run in CI.
