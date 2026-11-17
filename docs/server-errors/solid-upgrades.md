# Solid upgrades and error contracts

[Back to the main guide](../server-errors.md)

## Upgrading Solid

Check the dependencies and the `workspaces.catalog` catalog of
[package.json](../../package.json) and the resolution in
[bun.lock](../../bun.lock). `vp toolchain` shows the tools of the active
installation. Those files and the command replace a list of versions kept in
this guide.

The current protection starts from the evaluation of the Solid version resolved
in the lockfile when the wrapper was reviewed, which already has the
[SSR sanitization (#3477)](https://github.com/solidjs/solid/pull/3477), the
[central hook (#3481)](https://github.com/solidjs/solid/pull/3481) and the
[onError consolidation (#3484)](https://github.com/solidjs/solid/pull/3484). In
that evaluation the runtime replaced thrown errors with the generic message, but
did not refuse an `Error` returned as data; that is why `wrapInvocation` stays
and the hook is additive. A closed issue or a merged commit does not prove that
the published and installed package changed that behavior.

1. Check the releases, exports and contract of the published packages. Upgrade
   `solid-js` and `@solidjs/web` together, checking the Router, the plugin and
   the lockfile. Keep the previous versions for a rollback; do not adopt
   internal APIs early.
2. Check that the contract of the `configureServerErrors({ onError })` hook that
   the central registration uses is still the same: a synchronous call, the
   return sent without another sanitization, a verdict per object and the
   replacement of the previous hook. A per-request `onError` (an option of
   `renderToStream` or of `handleServerFunctionRequest`) takes precedence over
   the global hook and would replace it without warning. The one from
   `renderToStream` stays registered in the render and also applies to the
   server functions called directly during it. Check that `src/entry-server.tsx`
   and the plugin still do not pass it, and that the `serverSetup` module still
   loads before the first dispatch.
3. Run
   `vp run test:e2e src/tests/pages/BackendError src/tests/pages/OutsideError`
   on the production build. The markers in the raw bodies, the positive controls
   and the log teardown are the regression test of the boundary. If the runtime
   changes the messages that reach the browser, measure before adjusting the
   `pageerror` tolerances, including with the CPU throttled 20x.
4. Run `vp run test:e2e:production src/tests/pages/BuildOutput`. The test checks
   that the `buildId:` of the `configureServerFunctionsServer(` call that
   carries `endpoint:` in `.vercel/output/functions/` and the id that the client
   stamps in `X-Server-Function-Build` are the same, and that `/.vite/` does not
   reach the static output. If the plugin leaves `.vite/` in the client output
   again or stops keeping the id in memory, review the removal of the metadata
   described in [security](../security.md) and the refusal per build described
   in [Validation and recovery](recovery.md#validation-and-recovery).
5. Run `vp run test:e2e src/tests/pages/OutdatedPage` and
   `vp run test src/__tests__/App.dom.test.tsx`. The recovery of an outdated
   page depends on six runtime behaviors: `vite:preloadError` delivers in
   `payload` the same error that reaches `Errored`; `Errored` reports the error
   in the console in development only with a zero `fallback.length`; a fallback
   that reads the error without tracking is not rebuilt by a later error; the
   router stores the target URL before the deferred reload; the router calls the
   `useBeforeLeave` listeners in subscription order, with a shared
   `defaultPrevented`, which `registerUnsavedChanges` relies on; and the
   `configureClientErrors` hook is called once per error object for every
   boundary that shows a fallback, without a per-root `onError` in `hydrate`,
   which the fallback notice relies on. See
   [Outdated page after a deploy](recovery.md#outdated-page-after-a-deploy).
6. Reassess the wrapper only if the release notes or the published code show
   that the runtime now refuses an `Error` returned as data. In an isolated
   reproduction, replace `wrapInvocation` with a passthrough and check the
   `result` scenario in the three channels through the markers in the raw
   bodies, without trusting a green test. Check the resolved production
   artifacts; `NODE_ENV` alone is not enough.
7. Remove only the interception that the runtime now covers. Keep the transport,
   the public data contract, the hook, the middleware containment and their
   tests. Record commands, results and limits in the validation of the upgrade.
   On a rollback, restore the dependencies and the protection together.

This is checked during dependency upgrades; no automatic monitor is configured.
