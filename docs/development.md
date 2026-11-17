# Development and delivery

[Back to the README](../README.md)

## Prerequisites

The exact versions live in `package.json`:

- Vite+: install the global CLI as the
  [official guide](https://viteplus.dev/guide/) explains. It selects the Node
  and the package manager declared in the project.
- Node: the runtime of Vitest, of the tooling tests outside `tooling/release/`
  and of the production SSR. `devEngines.runtime` pins the exact version, inside
  the line declared in `engines.node`.
- Bun: the installer and the runtime of development, build, Knip, CSS lint and
  release automation, pinned in `packageManager`. Vite+ selects that version for
  the installation and for the `bun` command.
- Playwright's Chromium: used by the browser and E2E tests. It is not downloaded
  by `vp install`; install it with `vp run test:browser:install` and run the
  command again after updating Playwright, which pins one browser revision per
  version.

In CI, the tests use the Chrome already installed on the runner.

When raising the Node line, confirm that Vercel accepts the target runtime and
change `engines` and `devEngines` in the same commit.

## Environment and preview

To clone and start the project, follow
[getting started](../README.md#getting-started).

To check the production build locally, SSR and server functions included:

```bash
vp run build && vp run start
```

The preview uses Vite+ with the Nitro integration. The versioned `.env` holds
the local values of `HOST` and `PORT`, used by both dev and preview, and
`VITE_SITE_URL`, the public URL the SEO metadata requires. It is also loaded
during the build; variables already set in the environment take priority. To
choose another port or interface in the preview, use `vp run start --port 3001`
or `vp run start --host 0.0.0.0`. On the development server the `--port` flag
does not change the port; use `PORT=3001 vp run dev`.

`vp run start` is an alias of the local preview. In production, set the
variables on the hosting platform; the `preview` command is meant for local
checks.

## Build and deploy

Nitro uses `preset: 'vercel'` in `vite.config.ts` and generates the SSR function
and the static files in `.vercel/output/`. The SSR entry of the build is the
native handler of the Solid plugin, which reads the nonce from `event.nonce`
after the middleware chain. It renders through the authored entries
`src/entry-server.tsx` and `src/entry-client.tsx`, which the plugin requires as
a pair. The server one creates the render integrity state and completes it
through `onCompleteAll`, which the generated entry does not pass to
`renderToStream`; the client one checks the locale and installs the outdated
page detection and the history guard before hydration. Server function requests
use the native integration between Solid and Nitro/srvx.

The client entry publishes the test marker with `onHydrationEnd`, inside the
root pass of `hydrate()`. It follows the end of the phase, error recovery
included. The contract and the parser, preload and streaming scenarios are in
[full application tests](testing.md#full-application-tests).

To generate the Vercel artifact:

```bash
vp run build
```

That command generates `.vercel/output/`, static files and the SSR function with
the Node runtime included. The Vite manifest does not reach the artifact, and
the server function manifest stays in the SSR output, outside the published
static folder ([security](security.md)). The build runs in Bun, and Nitro
chooses the Node runtime of the function from the `engines.node` of
`package.json`. Generating the artifact locally does not publish the
application.

### SSR runtime

The production SSR stays on Node because, in the Bun the project declares, the
`fetch()` responses allow changing the headers. `Response.redirect()` already
keeps the null body, but the protection of the server also depends on the
immutability of the headers of network responses. With `engines.node` set and no
`engines.bun`, Nitro generates the function on Node even when the build runs in
Bun. Do not add `engines.bun` to `package.json` together with `bunVersion` in
`vercel.json`: with `engines.node` set, only the two together switch the
function to Bun. Before migrating the SSR, keep the contracts of
[server errors](server-errors.md) and run the boundary tests on the target
runtime, plus the complete E2E suites.

### Publication

The production deploy comes from the `deploy` job of the
[CI workflow](../.github/workflows/ci.yml), only on a push to `main`, and
publishes with `vercel deploy --prebuilt --prod` the same build the production
E2E tested, without rebuilding. The complete flow, the credentials registered on
GitHub and the configuration of the remote project are in the
[Vercel integration](../tooling/release/README.md#vercel-integration). The
`vercel.json` turns off the deploys through the Git integration
(`git.deploymentEnabled: false`) and keeps only the `Content-Type` of the `.md`
files generated in the build. The immutable cache of `/images/` (a replaced
image needs a new name, as the [SEO guide](seo.md) explains) and the `nosniff`
and `Cross-Origin-Resource-Policy` headers of the static files come from the
Nitro `publicAssets` and `routeRules` in `vite.config.ts`, as the
[security](security.md) guide describes; the other security headers come from
the middleware. The Vercel configuration and the automatic release flow are in
the [release guide](../tooling/release/README.md).

Nitro is set in [package.json](../package.json). When updating it, validate the
Vercel build, the local preview and the E2E tests. The generated folders
`.output/`, `.nitro/` and `.vercel/` are ignored by Git.

## Styles on the first load in development

The SSR worker of Nitro is isolated and fetches the CSS of the lazy routes from
an HTTP bridge of the development server. The Solid plugin finds the URL of that
bridge after the server starts listening, even when Nitro imports the manifest
earlier, and clears the bridge cache in the worker after each edit. Without
that, the first HTML comes out without styles until the JavaScript loads, or
brings old styles that are only replaced on hydration.

The E2E tests run on the production build and do not cover that path. When
updating the Solid plugin or Nitro, check with `vp run dev` that the first HTML
of a page, requested right after the server starts, brings the
`<style data-vite-dev-id>` of the routes, and that an edit to a route CSS shows
up in the HTML of the next request.

## Scripts

| Command                       | Description                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `vp run dev`                  | Development server with HMR                                                       |
| `vp run dev:phone`            | Expose the development server on the local network                                |
| `vp run build`                | Nitro build for Vercel in `.vercel/output/`                                       |
| `vp run start`                | Preview the build through Vite                                                    |
| `vp run i18n:generate`        | Validate catalogs and generate messages and types                                 |
| `vp run typecheck:node`       | Types of the tooling in the Node environment, with tsrs                           |
| `vp run lint`                 | CSS, lint and types with the Vite+ cache                                          |
| `vp run lint:css`             | Check the CSS rules                                                               |
| `vp run format`               | Format code with Oxfmt                                                            |
| `vp run check:ci`             | CSS, formatting, lint and types of the application                                |
| `vp run check:fix`            | Formatting + lint, fixing what it can                                             |
| `vp run test`                 | Every test project of the application                                             |
| `vp run test:tooling`         | Tooling tests on Node, release excluded                                           |
| `vp run test:release`         | Test the release automation with Bun                                              |
| `vp run test:ui`              | Vitest UI with coverage; use the printed URL (it carries the token)               |
| `vp run test:ci`              | Run Vitest with coverage and stop at the first failure                            |
| `vp run test:coverage`        | Run Vitest with coverage                                                          |
| `vp run test:unit`            | Only the `node` and `dom` (happy-dom) projects                                    |
| `vp run test:watch`           | Tests in watch mode                                                               |
| `vp run test:shuffle`         | Tests in random order, to find order dependencies                                 |
| `vp run test:browser`         | Only the `browser` project (headless Chromium)                                    |
| `vp run test:browser:install` | Download Playwright's Chromium                                                    |
| `vp run test:e2e`             | Test the application with E2E fixtures                                            |
| `vp run test:e2e:production`  | Test the real production routes                                                   |
| `vp run test:e2e:ui`          | Open the interactive E2E interface                                                |
| `vp run test:e2e:codegen`     | Open the Playwright test generator                                                |
| `vp run deps:update`          | Select dependency updates                                                         |
| `vp run bun:update`           | Update the pinned Bun and reinstall dependencies                                  |
| `vp run detect:duplicates`    | Look for duplicated code in `src`                                                 |
| `vp run dead-code`            | Check unused code with Knip                                                       |
| `vp run dead-code:fix`        | Apply the Knip fixes and format with `vp fmt`                                     |
| `vp run scan:secrets`         | Look for secrets with Kingfisher (requires installation)                          |
| `vp run validate`             | check:ci + typecheck:node + dead-code + test:coverage + tooling + release + build |
| `vp run commitlint`           | Validate a commit message                                                         |

## Execution and cache

Knip runs in Bun through the `knip-bun` binary, `dead-code:fix` included. With
Node, loading this `vite.config.ts` through Jiti fails when evaluating the
`lazyPlugins` factories. The native Bun loader accepts the configuration.

The scripts call the local `vp` (Vite+) binary. `vp <command>` runs a built-in
command; `vp run <script>` runs a `package.json` script or a `vite.config.ts`
task. The two can differ, so check `package.json` before running one directly.

To select updates, use `vp run deps:update`, which runs
`vp update --interactive --latest`; `vp outdated` only lists the available
versions. Both commands compare each package only with the `latest` dist-tag and
leave out versions published only under another tag, such as a prerelease under
`next`. To adopt one, check the tags with `bun info <package> dist-tags` and
update the pinned version in `package.json` by hand.

`vp run lint`, `vp run lint:css`, `vp run check:ci` and `vp run dead-code` use
the cached tasks `lint-project`, `lint-css`, `check-project` and
`dead-code-project` of `vite.config.ts`. `lint-project` and `check-project`
declare `dependsOn: ['lint-css']`: the CSS lint runs first, with its own cache
and inputs, and a TypeScript-only change does not run it again. The two tasks
share the inputs of the `PROJECT_CHECK_INPUTS` constant. `check-project` runs
`vp check --continue-on-error`: a formatting failure does not stop the lint or
the type check, the output gathers the three results and the command ends with
an error if any of them fails. `vp run typecheck:node` uses the `typecheck-node`
task; `vp run test:tooling` uses the `test-tooling` task, without cache, because
the tests depend on temporary folders the cache does not track. Vite+ reuses
successful results when the files read, the folder listings, the arguments and
the selected environment variables stay the same. The lint tasks include
`NODE_ENV` in the cache key; `PATH` and `NODE_OPTIONS` reach the process without
invalidating the result. Vite also records the variables it loads. The server
configuration limits `loadEnv` to the `HOST` and `PORT` prefixes, so it does not
record the whole environment.

The automatic tracking records the files the type-aware lint reads, the types in
`node_modules` included. `typecheck-node` declares its inputs explicitly,
including sources, declarations, TypeScript configs, `package.json`, `bun.lock`
and `patches/**`: the tracking of the `tsrs` reads was only checked on macOS,
and CI reuses the task cache on Linux. From `src/` only the `.ts`, `.tsx` and
`.json` files enter, which `tsrs` reads; CSS, images and fonts come in through
module declarations and do not invalidate the check. The lockfile represents the
dependencies that `vp install --frozen-lockfile` installs, but keeps only the
path of each patch; that is why the content of `patches/` enters separately,
also in the inputs of `lint-project` and `check-project`. When creating a task
that reads installed types, include `patches/**`. Knip combines the automatic
tracking with explicit inputs for sources, tools and dependencies, the discovery
of new routes included. When creating a cached task, check with two runs that a
change in a file it reads invalidates the result.

The cache keeps `typeAware` and `typeCheck` on and tells in the output when it
replays an earlier result. To run everything again, use `vp run --no-cache lint`
or `vp run --no-cache check:ci`. To skip the cache of the other tasks, use
`vp run --no-cache typecheck:node`, `vp run --no-cache lint:css` or
`vp run --no-cache dead-code`. `check:fix`, the build and the Vitest suites keep
their own commands.

Before skipping the cache, see what it would do: `vp run --dry-run check:ci`
lists each command of the run and tells whether it would hit the cache, without
running anything or writing to the cache. With `--json`, the same plan comes out
as a document for scripts. To find out why a task missed the cache, run it with
`-v`, which lists the changes behind each miss, the changed input files
included; `-vv` adds the unchanged inputs and the outputs a hit restores. The
plan does not replace the invalidation check described above.

## Runtimes and CI

In CI and in the release automation, `setup-vp` provides the Node and the Bun
declared in the project and reuses the package cache.
`vp install --frozen-lockfile` installs with Bun without allowing changes to the
lockfile. The `dev` and `build` scripts call the local Vite+ CLI explicitly with
Bun, because the global `vp` and the children of `vp run` can select Node again.
Use `vp run dev` and `vp run build` to run those scripts. The release automation
and its tests (`vp run test:release`) run in Bun. Node stays in the application
tests, in the other tooling tests and in the production SSR: the Oxlint
`RuleTester` refuses Bun, and the Vitest suite showed incompatibilities when
loading the Solid modules. The `Quality` job restores
`node_modules/.vite/task-cache`, `node_modules/.vitest-cache` and `.tsbuild`,
with one key per run and a restore prefix restricted to the operating system,
architecture, Node, Bun and lockfile. Vite Task, Vitest and TypeScript check
their inputs before reusing the data. After the tests with coverage, the cache
is uploaded to GitHub, even when an earlier check fails. Vite Task only keeps
successful results and Vitest keeps transformations, so a failure does not
become a reused test result. The workflow waits for the upload before ending;
cache failures neither waive nor fail the checks. A run without cache does the
same checks. Reusing Vite Task between runners is experimental: check the hits
in the logs and compare the time saved with the cost of transferring the cache.

In CI, only `Quality` uploads the package cache, and only when the lockfile key
does not exist and the job ends successfully. The `setup-project` action only
restores by default (`cache-save: 'false'`), and `Quality` is the only job that
passes `cache-save: 'true'`. `Quality`, `Tooling` and the two E2E jobs also pass
`cache-toolchain: 'true'`: `setup-vp` keeps Vite+, Node and Bun in the Actions
cache, and only `Quality` uploads that cache. The project trusts the cache scope
of `main`: on `main` only caches written by `main` itself are restored, because
GitHub writes the caches of a PR to the merge ref, which `main` does not read.
That is why `E2E (production)`, which receives the `VERCEL_TOKEN` only on the
push to `main` and generates the deploy artifact, restores packages and
toolchain like the other E2E jobs. `Reuse proof`, the deploy and the release
automation do not pass `cache-toolchain` and prepare the toolchain without that
cache. `Reuse proof` and the deploy also pass `install-dependencies: false`: the
action prepares Vite+, Node and Bun from `package.json`, without a package cache
or `vp install`. The deploy only runs `vp dlx` on the tested artifact. With
`cache: false`, `setup-vp` neither restores nor saves the cache, and
`cache-save` and `cache-dependency-path` have no effect. The release automation
uses the same action: the plan job, without write permission, installs the
dependencies and restores the package cache of `main` without uploading it; the
jobs with write permission pass `install-dependencies: false` and neither
install nor import packages, according to the
[release guide](../tooling/release/README.md#enabling-on-github).

The `lint-css` task combines the files read automatically with explicit inputs
for CSS, CSS tooling, `package.json`, `bun.lock` and `bunfig.toml`. That way,
the invalidation of the CSS lint does not depend on the tracking of runtime
reads on each operating system. `lint-project` and `check-project` declare
sources, declarations, TypeScript configs and the dependency files. Bun uses the
isolated linker defined in `bunfig.toml`; only the packages of
`trustedDependencies` can run the authorized install scripts. The documented
commands use `vp`, and Vite keeps its per-mode variable loading. `env = false`
in `bunfig.toml` also stops `bun run` from reading `.env` early, before those
tools start. The `bunfig.toml` of the project does not define
`minimumReleaseAge`, which is off by default in Bun: a version quarantine
configured in the global bunfig of the developer still applies, and the local
bunfig would only override it by repeating the key. With that quarantine,
versions published more recently than the limit stay out of the updates.

CI spreads the checks over four independent runners: `Quality`, `Tooling`, E2E
with fixtures and production E2E. On the push to `main`, the first three can be
waived by the proof described below. `Quality` runs formatting, lint, types,
unused code (Knip) and coverage, plus the release tests in Bun when there are
relevant changes. On PRs, it also checks with the commitlint of the project the
messages of every commit between the base and the head. `Tooling` runs the other
tooling tests on Node after the installation, without waiting for the `Quality`
checks or sharing CPU with the coverage. The four jobs run in parallel, each one
with its own checkout, ports and build artifacts; on the push to `main`, the
three reusable ones start after `Reuse proof`, and the production E2E does not
wait for it. The local `setup-project` action holds the toolchain preparation:
the validation jobs also install the dependencies, and the deploy does not. That
parallelism cuts the wait, but repeats the preparation on the runners and can
increase the GitHub Actions minutes used. The production build approved in the
E2E tests is handed to the deploy in the same CI run. The PR builds two
applications, one with fixtures and another with the real routes, and the
tooling tests build their own smaller fixtures. On the push to `main` with the
proof approved, only the production application is built.

`CI required` waits for every job and requires success from `Quality`,
`Tooling`, `E2E (fixtures)` and `E2E (production)`; failures, cancellations and
skipped jobs block its approval. The result of `Reuse proof` is not required as
a job: it is skipped on every PR and, on the push to `main`, only allows
accepting as `skipped` the jobs that the approved proof waived. The deploy
depends on that result. The release reuses the approved CI of `main` and only
checks the version and changelog commit, according to the
[release guide](../tooling/release/README.md). The release filter only gates one
step of `Quality`, keeping the job and the aggregator required. The application
tests and the other tooling tests run in every CI run, except when the proof
described below waives them; the Vitest cache keeps module transformations. With
`CI=true`, Vitest uses at most two workers and the Node runner of the tooling
tests, at most three.

### Reusing the PR validation on main

The push to `main` is a merge commit created by GitHub from a PR updated with
the base, which the branch protection requires. When the run of that PR already
tested the same tree, the `Reuse proof` job waives `Quality`, `Tooling` and
`E2E (fixtures)`. `E2E (production)`, the artifact build and the deploy always
run, without depending on the proof.

On the PR, `Quality` publishes the `ci-reuse-evidence-<attempt>` artifact with
the SHA of the synthetic merge the checkout tested. On the push,
`tooling/ciReuse/prove-reuse.ts` runs on the Node declared in the project,
without installing dependencies, and approves the reuse only when all of these
conditions hold:

- the `main` commit has exactly two parents and does not change `.github/` or
  `tooling/ciReuse/`, a rename out of those folders included. That way, the run
  of the PR used the same workflow as `main` and ran the tests of the verifier;
  the PR does not run the proof, which only runs on the push to `main`;
- there is a single PR merged with that merge commit, from the repository
  itself, with base `main` and with base and head equal to the parents;
- there is a single `pull_request` run of `ci.yml` for the head, completed
  successfully, from the same repository and branch;
- in the attempt of that run, `Quality`, `Tooling` and `E2E (fixtures)` exist,
  belong to the same attempt and ended successfully. A partial re-run that does
  not repeat the three jobs does not count as proof;
- the evidence of the same attempt belongs to the run and to the head, and the
  synthetic commit it points to, looked up in the GitHub API, has the same
  parents and the same tree as the merge on `main`. A run from before a base
  change, or from another PR with the same head and another base, tested other
  parents and fails this check.

Any absence, ambiguity, timeout, API error, PR older than the evidence or
evidence of another version results in a full CI. The gate accepts `skipped`
only with the proof approved in the same run. Checks synthesized by the release
do not count as proof.

`Quality` also runs when the merge changes `bun.lock`, `package.json` or
`bunfig.toml`, or when `main` does not have the package cache and validation
entries for the current lockfile and toolchain. It is the only job that writes
those caches. The proof builds the package key in the format documented in the
`setup-vp` README; if that format changes, the lookup stops finding it and
`Quality` starts running on `main` on every merge, without losing validation.
The package key and the restore prefix of the validation only change in those
cases; with `Quality` waived, the PRs keep restoring the last validation entry
of `main` with the same prefix, which ages as the tree changes and can lower the
Vite Task and Vitest hits until the next lockfile change.

The verifier and the workflow are still reviewed code of `main`: a merge that
changes `.github/` or `tooling/ciReuse/` always runs the full CI. The reuse also
removes the second run that sometimes failed, on `main`, a flaky test that had
passed on the PR with the same tree. To repeat the whole validation of a commit,
trigger the workflow by hand (`workflow_dispatch`). That mode does not publish
to Vercel and uses another concurrency group, so it does not replace a pending
push.

### How to measure a CI optimization

Separate runner usage from waiting time. The first is the sum of the job
durations, computed between `started_at` and `completed_at`, divided by 60;
`skipped` jobs do not enter that sum. The waiting time goes from the creation of
the run to the end of the last job. Parallel jobs count separately in the usage,
but their times must not be added up to compute the wait. When computing the
daily usage, include re-run attempts and jobs that failed or were canceled after
starting; counting only the last green run underestimates the runner usage.

To attribute a gain to the change, compare base and candidate on the same
runner, with frozen installs and the same suite, alternating the runs of each
side.

To check the reuse after a merge, check the source run recorded by
`Reuse proof`, the waived jobs and the results of `CI required` and
`E2E (production)`. Also check that the `Deploy tested production artifact` step
really ran: the global green status, alone, does not prove the publication, and
a deploy job that refused an old commit through the freshness guard did not
publish that commit. A run without publication does not count as savings of the
complete flow.

A change to the workflow itself forces the full CI and includes the cost of the
proof. Measure that path separately from the merges eligible for reuse. When
projecting minutes per day, report the observed window and frequency; do not add
the savings of a faster job to the savings of waiving that same job in the same
run.

## Git hooks

Installed by Lefthook in `vp install`, authorized in the `trustedDependencies`
of `package.json`:

| Hook         | What runs                                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | `check:fix` on the staged files (with re-stage) + `scan:secrets --staged` when Kingfisher is available                                                                |
| `commit-msg` | `commitlint` (header up to 100 characters; blank line before the footer; warning for body and footer lines over 100)                                                  |
| `pre-push`   | `check:ci`, `typecheck:node` and `test:ci` in sequence; then `test:tooling`, `test:release` and `dead-code` (Knip) in parallel; the first failure stops the next jobs |

`pre-commit` is skipped during `merge` and `rebase`. In CI, Lefthook does not
install the hooks; the `Quality` job repeats the commitlint on the commits of
each PR. `pre-push` uses `piped: true`, because without it Lefthook goes on with
the next jobs after a failure.

## Maintenance conventions

- Dependency versions are pinned without `^` (`install.exact` in `bunfig.toml`)
  to avoid silent breakage. Check the dependency files to see which ones are
  installed.
- The `@solidjs/compiler` override keeps the native compiler aligned with the
  Solid runtime, and the `@solidjs/signals` one pins the reactive core to the
  same version as `solid-js`, which declares it with `^`. Update both together
  with `solid-js` and `@solidjs/web`, respecting the compatibility of the Vite
  plugin.
- The Solid plugin compiles with the native compiler and does not install Babel.
  To use `compiler: 'babel'`, declare `@babel/core` and `@solidjs/babel-plugin`
  as devDependencies, with the Babel plugin at the version of the Solid runtime;
  the `babel` option of the plugin, with the native compiler, requires only
  `@babel/core`.
- The Bun patches live in `patches/`, declared in `patchedDependencies`. The key
  includes the version of the package, so updating a patched package requires
  regenerating it with `bun patch` or proving that the new version no longer
  needs the fix. The `tooling/__tests__/patched-dependencies.test.ts` test fails
  when the key does not match a version resolved in `bun.lock`. The proof runs
  the regressions of the patch without it: they must fail on the old version and
  pass on the new one. The isolated linker reuses in `node_modules/.bun` the
  already patched copy of a version installed before; check in the installed
  package that the patch is gone, or reinstall `node_modules` from scratch,
  before running that control.
- `vite-plus`, `vite`, `vitest`, `tsrs` and the `@vitest/*` packages come from
  the catalog in `workspaces.catalog` of `package.json`; `vite` resolves to the
  Vite+ core. Update Vite+ with `vp migrate`, which aligns `vite-plus`, `vite`
  and `vitest`; keep the `@vitest/*` packages at the exact version of the Vitest
  bundled in Vite+. `vp migrate` does not touch `tsrs`: set it to the version
  that `vite-plus` depends on
  (`npm view vite-plus@<version> dependencies.tsrs`). The
  `tooling/__tests__/tsrs-version.test.ts` test fails when the catalog diverges
  from that version or when `bun.lock` resolves a second copy. CI reads the
  Vite+ version from that catalog.
- Commits must follow Conventional Commits.
- The lint is type-aware and runs with `typeCheck: true` through `tsrs-lint`,
  the backend that Vite+ installs with `tsrs`: the types of the application, the
  `test-d.ts` tests included, are checked by `vp run lint` and
  `vp run check:ci`, without a separate type check. That check only reports the
  files the lint reads: the ones in `ignorePatterns`, such as the generated
  `src/@types/routes.d.ts`, and diagnostics without a file stay out.
- CI, the pre-push and `vp run validate` combine `check:ci` with
  `typecheck:node`, which runs `tsrs --project tsconfig.node.json` and checks
  the tooling without the DOM types.
- The project does not install the `typescript` package: `tsrs` is the compiler
  of the command line and of the lint. An editor that needs a TypeScript 7 SDK
  can point to `node_modules/tsrs/tsdk`, as the
  [tsrs editor guide](https://github.com/oxc-project/tsrs/blob/main/docs/LSP.md#editor-setup)
  describes.
- Use the Node and Bun versions defined in `package.json`. `bun.lock` is the
  only lockfile of the project.

## External references

- SolidJS: https://docs.solidjs.com
- Solid Router: https://docs.solidjs.com/routing/solid-router
- Vite+: https://viteplus.dev/guide/
- Vite: https://vite.dev
- Vitest: https://vitest.dev
- Vitest Browser Mode: https://vitest.dev/guide/browser/
- Playwright: https://playwright.dev
- Oxlint: https://oxc.rs/docs/guide/usage/linter
- Oxfmt: https://oxc.rs/docs/guide/usage/formatter
- eslint-plugin-solid: https://github.com/solidjs-community/eslint-plugin-solid
- Commitlint: https://commitlint.js.org
- Lefthook: https://github.com/evilmartians/lefthook
- TypeScript: https://www.typescriptlang.org/docs
- tsrs: https://github.com/oxc-project/tsrs
