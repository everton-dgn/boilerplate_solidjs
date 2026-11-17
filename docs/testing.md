# Tests

[Back to the README](../README.md)

## Organization and criteria

Test files live in `__tests__` folders next to the code they exercise
(`src/__tests__/`, module folders, `tooling/release/__tests__/`). The E2E tests
are the exception and live in `src/tests/pages/`, outside the Vitest projects.

The `project/test-filename` lint rule, in `tooling/test-filename.ts`, checks the
names: `Name[.qualifier].environment.test.ts(x)` in `src`, with the `node`,
`dom`, `browser` or `e2e` environment; `Name[.qualifier].test-d.ts(x)` for
type-only tests; and `Name[.qualifier].test.ts` in `tooling`. `Name` is the
exact subject, which by default is the folder that contains `__tests__`, such as
`isTheme` in `helpers/isTheme/__tests__/isTheme.node.test.ts`; subjects with a
dot, such as `llms.txt`, are valid too. Qualifiers are separated by a dot, start
with a lowercase letter and continue in camelCase, as in
`Home.themeCss.e2e.test.ts`. Suites without a colocated module, such as those of
`src/__tests__/` and `tooling/__tests__/`, and each page in
`src/tests/pages/<Folder>/` declare their subjects in the `subjects` map of that
file. The first E2E suite of a new page requires the matching entry, and the
files of those folders use only the `e2e` environment.

Long suites can be split by responsibility using the qualifiers of the name. The
shared setup lives in `fixtures.ts` inside the same `__tests__`; shared types
and constants can live in `types.ts` and `constants.ts`. Those three support
modules are not executable test files. The naming exception does not apply to
the E2E page folders and does not waive the colocation rules. Keep the per-file
isolation and the cleanup of the fixture resources when splitting a suite.

Knip keeps `src/**/__tests__/` out of the production inventory, and the coverage
excludes the same folder: fixtures and support modules do not enter the
percentages of the application, although the tests still run their helpers.

Test rules and observable results: recovery after an error, navigation,
selection, persistence and sync. Simple presentation components do not need a
suite of their own to check mounting, static texts, classes or the native
behavior of buttons. Choose the environment that covers the behavior and avoid
repeating the same scenario at another level.

The tests in `tooling/**/__tests__/` use the `node:test` API. The
`vp run test:tooling` command runs the modules in Node, except
`tooling/release/`, which runs in Bun with `vp run test:release`, the same
runtime as the publication. Both commands run in `validate` and in the
`pre-push`, outside the Vitest commands: test, coverage, UI and watch. In the
CI, the Node suite runs in every execution, except in the `main` push whose
[reuse proof](development.md#reusing-the-pr-validation-on-main) waives the
`Tooling` job; the release tests only run when the automation or its
dependencies change, according to the
[release guide](../tooling/release/README.md#local-and-ci-validation).

## Environments

`vite.config.ts` defines three Vitest projects, chosen by the file suffix:

| Suffix                    | Environment   | Use                                     |
| ------------------------- | ------------- | --------------------------------------- |
| `*.node.test.{ts,tsx}`    | Node          | Server functions, middleware, utilities |
| `*.dom.test.{ts,tsx}`     | happy-dom     | Components without a real browser need  |
| `*.browser.test.{ts,tsx}` | Real Chromium | Interaction, layout and browser APIs    |

Type-only tests (`expectTypeOf`) use `Name[.qualifier].test-d.ts`. No Vitest
project includes that suffix, and `vp run check:ci` checks those files. Running
one of them in Vitest would fail on `expect.requireAssertions`, because
`expectTypeOf` does not count as a runtime assertion.

The `node` and `dom` projects use `pool: 'threads'` and `css: false`. The `node`
project does not load happy-dom or the component plugins. The `dom` project
loads happy-dom, Solid and icons, without Nitro or the SSR configuration.
`@solidjs/vite-plugin` registers the `@testing-library/jest-dom` matchers in
that project, without a `setupFiles` of its own, and the types come from
`tsconfig.json`. The injection only happens in DOM projects outside browser
mode, such as `happy-dom`, and is skipped when some `setupFiles` has `jest-dom`
in its path. The `browser` project uses Chromium with CSS enabled and the same
Lightning CSS as the application. Import the CSS in the test when you need to
check styles.

Locally, the browser and E2E tests use the Chromium installed by Playwright.
With `CI=true`, they use the Chrome of the runner through the `chrome` channel.

In `test` mode, `vite.config.ts` loads the versioned `.env.test` into
`process.env` before starting Vitest, so every variable of the file, with or
without the `VITE_` prefix, reaches the workers of the `node` and `dom`
projects. `BASE_URL_TEST`, `HOST` and `PORT` also go through `test.env`, which
the `browser` project exposes in `import.meta.env`; a variable the browser tests
need to read goes into that list. `tooling/playwright.ts` loads the same file
for the E2E tests. In both cases, variables already exported in the shell take
precedence over the file. Without `.env.test`, Vitest goes on with the shell
environment only.

## Isolation and diagnostics

The shared configuration clears the mock history and, before each test, restores
replaced spies, globals and environment variables (`restoreMocks`,
`unstubGlobals` and `unstubEnvs`), so the tests do not need `afterEach` for
that. `expect.requireAssertions` fails a test that ends without any assertion.
`expect.poll.interval` lowers the interval between the checks of `expect.poll`
and `expect.element` from 50ms to 10ms; `vi.waitUntil` does not read that option
and receives the interval in each call. `fsModuleCache`, on by default in
Vitest, keeps the transformations in `node_modules/.vitest-cache`, so only the
first run after a change pays the cost. The per-file isolation (`isolate`, the
Vitest default) is intentional: do not use `isolate: false`, even when Vitest
suggests the time gain. Without that isolation, files start sharing `document`
and the module state, and a test can pass or fail depending on the order. In
Browser Mode, the context still keeps cookies between files. The
`src/tests/setup/browser/index.ts` setup restores the base locale before each
test with `setLocale(baseLocale, { reload: false })`; each test can choose
another locale while it runs. The DOM and browser projects start in English. In
GitHub Actions, the `github-actions` reporter annotates the failures on the PR.
The `include` of the projects requires the `node`, `dom` and `browser` suffixes,
so the E2E files stay out without an exclusion of their own. Those options live
in the root configuration, and the projects inherit them through the default
Vitest `extends`, declaring only what changes.

In the tests, import from `vite-plus/test` instead of `vitest` (the
`vite-plus/prefer-vite-plus-imports` rule blocks the direct import). The
isolated linker of Bun creates more than one copy of `vitest` and of the
`@vitest/*` packages in the store, because of the peer cycle between them
([oven-sh/bun#46208](https://github.com/oven-sh/bun/issues/46208)): the copies
of `@vitest/browser-playwright` and `@vitest/coverage-v8` linked at the root
point to a `vitest` different from the one that runs. Through `vite-plus`, each
process loads a single copy of `vitest`; that is why the provider comes from
`vite-plus/test/browser-playwright`, and a direct import of
`@vitest/browser-playwright` would bring the second one. Several `vitest@`
entries in `node_modules/.bun` are expected until Bun publishes the fix
([oven-sh/bun#46454](https://github.com/oven-sh/bun/pull/46454)). The request
context of the middlewares is tested with `provideRequestEvent` from
`@solidjs/web/storage`. Each middleware of `src/middleware/` has its own suite
in `__tests__/`, and `src/middleware/__tests__/middleware.node.test.ts` covers
the default export and the chain built by `createMiddleware`.

## Full application tests

`vp run test:e2e` runs the tests in `src/tests/pages/**/*.e2e.test.ts`, except
the `*.production.e2e.test.ts` files and the isolated load suite
`PublicationLoad.e2e.test.ts`, with Chromium. Playwright generates the build and
starts the production server at `http://127.0.0.1:4317`, shutting it down at the
end. The port must be free. The scenarios cover the home page, the hydration of
the theme switcher, keyboard, persistence and sync between tabs, colors in the
initial HTML, layout and the 404 response with navigation back to the start.
They also cover the confidentiality of server errors: HTTP 500 from a local
backend, an exception after the read, an `Error` inside the result, a public
error and success, each one in the initial SSR, in a call from the browser and
in streaming, plus a reload that still fails, recovery after the backend comes
back and the isolation of the client bundle. The initial SSR is also checked
with JavaScript disabled. The details are in
[docs/server-errors.md](server-errors.md); the CI runs the whole suite, except
when the [reuse proof](development.md#reusing-the-pr-validation-on-main) waives
`E2E (fixtures)`.

### Publication load

The functional Markdown tests use the `markdown` project, with one worker. The
locale isolation case keeps 12 requests, in concurrent pairs, to respect the two
default slots. The load suite separately checks the refusal above that limit.
The teardown of the logs waits for both projects.

Run `TEST_PUBLICATION_LOAD=true vp run test:e2e` for the HTTP publication pilot.
The configuration selects only `PublicationLoad`, with one worker, its own
fixture build and a controllable backend. The flag is incompatible with
production routes. The suite does not run together with the other E2E: its
blocked requests deliberately take the publication capacity and would interfere
with the other tests. That pilot is an explicit run, outside the default CI
suite.

The first scenario keeps Markdown renders waiting for the backend until the
origin refuses a request with 503. It checks in the backend that the refused
request did not start the work, requests normal HTML during the saturation and
releases the operations to check the recovery and the return of the
reservations. A second instance of the same build, on the port of the first plus
two, uses the same backend and accepts work while the first one is saturated.
The counters of each process show why the local limit multiplies across the
fleet.

The second scenario converts a synthetic document over 1 MB while requesting
HTML pages. The `publication-probe` endpoint, exclusive to the fixtures, watches
the event loop delay in the server process, memory and aggregated counters. The
load generator runs in another process. The JSON attachments of the tests keep
the samples, the body size and the criteria defined before the measurement: a
maximum event loop delay below 250 ms and a longest HTML request duration below
the largest baseline value plus 500 ms. Those criteria are an initial local
reference, not a production SLO.

Run the pilot without other concurrent benchmarks or builds. Start with one run
and investigate a failure before repeating. The few samples serve to detect
blocking and excessive cost; they do not support p99, fleet capacity, CDN
behavior or socket cancellation on Vercel. The RSS peak is that of the whole
process, runtime included. The monitor is turned off when the test ends, and
Playwright shuts down the servers it started. The collection is only valid when
the monitor confirms samples before and after the load. The monitor state lives
in a shared module: the router bundles each HTTP method separately.

Two other scenarios disconnect a client during the render and pause the reading
of a 16 MiB response. The first one checks that the pending backend still takes
the slot after the disconnection and that it is released when the backend ends.
The second one watches the output reservation with the producer already
finished, the refusal for lack of bytes and the release within the fixture
deadline. Those tests use local sockets; they do not measure the retention of
the Vercel CDN.

The last two scenarios request GET and HEAD of the same part in parallel and
remove a part after getting the index, restoring it afterwards. They check
independent bodies, equivalent metadata, a 404 without cache during the absence
and the recovery after the restoration. The controllable source only exists in
the fixtures.

`hydrationFinished()` reads the `data-hydration-ended` attribute of `<html>`,
published by the experimental public `onHydrationEnd` API of Solid. The
registration lives inside the `hydrate()` callback, after building the tree: the
`async` entry can run before the end of the shell, and the module preload can
delay the root pass. Registering right after the call to `hydrate()` lets the
callback run too early. The SSR does not publish the attribute; a preload
failure that prevents the root from running also leaves the document without the
marker.

The attribute tells that the root ran and the hydration phase ended. That
includes cancellation and error recovery, without guaranteeing complete content
or correct interaction. The tests also check content, controls and browser
errors. When the stream is truncated, the runtime can end the phase and fetch
the data again on the client, keeping `Loading` while that new fetch waits. The
marker stays across navigations in the same document; a new document starts
without it. Do not use it to drive the UI: keep `isHydrating()` and `onSettled`
in the components that need to tell SSR from client state. The current contract
assumes a single hydration root.

The E2E tests that check page errors or CSP violations import `test` and
`expect` from `src/tests/helpers/pageWatchers/`. The `pageErrors` and
`cspViolations` fixtures start collecting before the test body, so no error of
the first navigation escapes, and the test only checks the lists. Pages opened
with `context.newPage()` register their own collection.

A fragment cut by the truncation is rendered from scratch on the client and
adopts by id what the server had already sent
([solidjs/solid#4319](https://github.com/solidjs/solid/pull/4319)). The records
the stream never settled leave the registry before that render
([solidjs/solid#4414](https://github.com/solidjs/solid/pull/4414)), so only the
reads without a server response are redone. The truncation cases of
`Hydration.parser.e2e.test.ts` cover that new fetch, and the contained error
test of `Hydration.streaming.e2e.test.ts` checks that rejections sent by the
server are still adopted, without a new fetch. That also holds for a root that
only starts hydrating after `DOMContentLoaded`
([solidjs/solid#4416](https://github.com/solidjs/solid/pull/4416)).

`Hydration/` tests raw HTML, disabled JavaScript, a held or aborted bundle,
reload, click replay and navigation. The parser and preload scenarios use the
`load` event of the entry module as the proof of evaluation. A proxy holds the
body after `</head>`; other cases end the stream before the fragments and before
the end of the shell, with `hydrate()` parked until `DOMContentLoaded`. The
fixture with two `Loading` uses backend gates, released by the test, to check
out-of-order resolution, a contained error, discarding on navigation and
recovery after truncation. The proofs use the real build, without a Solid mock,
and check the CSP in the streaming paths.

The E2E build uses `--mode e2e` with production optimizations and replaces
`src/routes/` with the `src/tests/fixtures/e2e/routes/` tree. The real pages and
endpoints the E2E tests exercise enter it through a re-export, such as
`export { default, route } from '@/routes/(base)/(home)/index.tsx'` and
`export { GET } from '@/routes/(seo)/robots.txt/index.ts'`; a new page of
`src/routes/` only shows up in that suite after it gets the matching re-export.
The mocked backend listens only on `127.0.0.1:4318` and is started and stopped
by Playwright. The normal build (`vp run build`) uses only `src/routes/` and
does not include the fixtures or the mocked backend. Ports 4317 and 4318 must be
free.

Re-exporting pages has a cost in that build. The manifest asks the wrapper only
for `route`, but the `?pick=` of filesystem-routing only applies to the module
it is applied to, and the re-export points to the page without that filter
([solidjs/filesystem-routing#26](https://github.com/solidjs/filesystem-routing/issues/26#issuecomment-6719362377)).
That is why home, about, contact and privacy enter the initial load of the E2E
build with the component and the CSS, while in the normal build they stay on
demand. The E2E tests of those pages do not check the chunk split. An app that
needs to re-export pages without that cost should declare `route` in a module of
its own, without the component, and re-export it from both the page and the
wrapper.

`vp run test:e2e:production` runs the `*.production.e2e.test.ts` files against a
normal build, with the real `src/routes/` tree. That suite checks over HTTP that
`/robots.txt`, `/llms.txt` and `/sitemap.xml` respond without a redirect, with
the expected content and headers, and that the local helpers do not become
public endpoints. It also checks the absence of a fixture route and that the
Home receives the security headers of the real middleware, since the E2E build
builds the chain through the `createMiddleware` factory. The Markdown tests
check over HTTP the negotiation and the `.md` of each page.
`AgentReadiness.build.production.e2e.test.ts` compares those responses with the
files generated in `.vercel/output/static`, checks the route precedence in
`.vercel/output/config.json`, the security headers that the `routeRules` write
into the static files and the `Content-Type` of the `.md` files in
`vercel.json`; that is why it depends on the artifacts of the local build.
`BuildOutput.production.e2e.test.ts` also reads those artifacts: it checks that
`/.vite/` does not go out in the static output and that the build ID of the
server functions is the same on the client and on the server.
`Hydration.preload` reads the Vite manifest in `.vercel/output/static/.vite/`,
which only the `e2e` mode build keeps. The Node tests of the middleware cover
semantic filters, relative links, links with a script or data scheme, images
without `alt`, negotiation, HEAD, errors, size limits and cancellation. The
shared eligibility has a regression for noindex inheritance with an explicit
override by the child. The E2E fixtures exercise parameterized pages,
asynchronous resolution and locale isolation. The Markdown serialization test
runs the real render with the hook installed and covers serialization failures,
an `onCleanup` that throws and an `<Errored>` fallback with HTML 200, through a
`redirect()` too; the Markdown streaming E2E tests cover renders that fail on
the server.

The publication is also checked through the complete inventory of the static
Markdown files and through the internal targets of `llms.txt`. The check
deduplicates requests and limits the concurrency; it does not fetch external
links. Those sets do not need to match the sitemap: the editorial selection, the
Markdown eligibility and the indexing have their own controls. The content size
criterion of the demo stays separate from that check, to accept short pages in
the derived applications.

The tooling tests exercise a wrong MIME, `.md.html`, redirects, omissions,
UTF-8, an empty body and legitimate HTML examples in the Markdown. The
`llms-full.txt` aggregate requires a deterministic selection, complete bodies,
deduplication, a byte limit, contained paths and publication only after
completion. Zero selected documents must omit both the file and its
announcement; a leftover aggregate in that condition must fail the build and
keep the file for diagnosis.

In the sitemap, the count and byte scenarios are independent, so one ceiling
does not hide the other. The tests cover indivisible locale groups, long
localized URLs, route ownership by the native matcher and sources with a
timeout, cancellation, or invalid or empty entries. The partitioned fixture
exercises the index and the parts over HTTP; a part request must read only its
batch. Changes between requests are tested as eventual consistency, including a
404 with `no-store` after removing an announced part.

Those checks cover the build and the local preview. The cache and the domain
rules of Vercel still need a check on the published site.

`AgentReadiness.content.production.e2e.test.ts` checks the compact presentation
of the home page, without subheadings or a footer in `main`, and keeps the
requirement for detailed content, with subheadings, on the inner pages. The
initial HTML and the topbar links are inspected in the three locales. After the
hydration, the links stay visible and named; the navigation, on narrow and wide
screens, keeps the theme, the locale and the same header, without widening the
document. At 375 px, the links overflow and scroll inside the bar, and the theme
and locale buttons, outside it, stay visible. The Markdown of the home page has
the title and no second-level section.

`Home.csp.production.e2e.test.ts` checks that the CSP carries a nonce that
changes on each request, that every `<script>` and `modulepreload` of the raw
HTML carries that nonce and that the Home hydrates without a CSP violation in
the console, also with the `dark` or `light` theme in the cookie, without a
`style` attribute on `<html>`. The command uses the same `BASE_URL_TEST`, loads
the public variables in `production` mode and does not need the mocked backend.
In the same local checkout, run the two suites one after the other, because they
share the port and the build artifacts. The CI runs both in parallel, on
separate runners to isolate ports and builds; the production suite also checks
the final build and is the only one that runs when the reuse proof waives
`E2E (fixtures)`.

On the push to `main`, the production E2E job tests the Vercel build that the
deploy publishes, according to the
[Vercel integration](../tooling/release/README.md#vercel-integration).
Playwright receives only the public `VITE_*` variables of the environment file
obtained from Vercel, keeping values already defined in the process; backend
credentials from that file are not passed to the preview. With
`TEST_PREBUILT=true`, Playwright only starts the preview.

PRs, from forks included, keep the local builds without Vercel credentials. The
local commands also keep building by default. To check a production build
already generated, use `TEST_PREBUILT=true vp run test:e2e:production`. The mode
requires production routes; using it with the fixture suite causes an error. An
`e2e` mode build in `.vercel/output`, left by an earlier `vp run test:e2e`, is
refused before the preview starts. The tests of
`tooling/__tests__/playwright.test.ts` run the startup commands with a mocked
CLI and check the number of builds in each mode.

Use `vp run test:e2e:ui` to open the interactive Playwright interface. With
`CI=true`, the E2E tests use two workers; locally, they keep the default
parallelism. `OutsideError.e2e.test.ts`, which checks the exact count of lines
in the server log, runs in the `server-logs` project, declared as the `teardown`
of `chromium` in `tooling/playwright.ts`: it starts after the other tests end,
even when one of them fails, and runs the file in order in a single worker. A
filtered run with `chromium` tests also runs that file at the end, and
`--no-deps` skips it; to run only that file, pass the path of the file or of the
`OutsideError` folder. A line written late by an earlier request would still
change the count. To compare times or investigate a concurrency failure, use
`CI=true vp run test:e2e --workers=1` and `CI=true vp run test:e2e --workers=2`.

The HTML reports live in `playwright-report/e2e/` and
`playwright-report/production/`. With `CI` defined, they keep only the tests
that failed, were flaky or were interrupted; without the variable, they include
all of them. In local runs with `CI=true`, `PLAYWRIGHT_HTML_ONLY_FAILURES=false`
brings back the complete report. The failure traces live in `test-results/e2e/`
and `test-results/e2e-production/`, respectively. The Vitest Browser Mode tests
keep failure traces in `test-results/browser-traces/` and the failure
screenshots in `.vitest/attachments/`. When the `Quality` job fails, the CI
uploads both folders as an artifact. Those artifacts are ignored by Git. The E2E
tests have a separate command and are not part of `vp run test` or
`vp run validate`.

## Checking on a physical device

To check the interface on a phone in the same network, run `vp run dev:phone`
and open the network URL shown by Vite. That command makes the development
server available on the network interfaces of the machine.
