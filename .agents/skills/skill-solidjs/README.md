# SolidJS 2 skill

Implementation and diagnostics of SolidJS 2 through the installed public API. [SKILL.md](SKILL.md) holds the frequent pitfalls and points to the references by subject. Solid 1 and SolidStart are out of scope.

## Installation

Keep `skill-solidjs` and `skill-solidjs-testing` side by side in `.agents/skills/`: the references between them use relative paths. In this repository, `.claude/skills/` points to these folders through a symlink.

## Layout

- [SKILL.md](SKILL.md): entry point and choice of reference.
- `references/`: contracts and differences that lead to wrong code.
- [examples](examples/README.md): adaptable examples and their limitations.

## Verification history

The reverification of 2026-09-29 on the verified base, with a control on the previous base of the skill (commit `9a29b1a`) in the graph, SSR on Node, happy-dom and Chromium, covered the risks of [17](references/17-known-risks.md), the origin gate of server functions, `Loading.on`, every statement marked as coming from the base or from the installed runtime in references 01 to 16 and the migration table of 16; the changelogs of signals, `solid-js` and `@solidjs/web` published between the previous and the verified base were checked against the references and the contradictions found were fixed.

On the same date, the roughly 230 unmarked contract and pitfall paragraphs in references 01 to 16 were examined on the verified base: exports, types (strict tsc), compiler and the `dist` diff against the previous base, with a probe on both bases when the passage changed or the contract was behavioral; nine were fixed, 18 were left without a new measurement and the rest were kept. The 18 without a new measurement, because they need a real browser, full hydration or a served production build, or because the probe did not reproduce the case even on the previous base, are: the extra firing of the derivation and the reader held until `TimeoutError` in [10](references/10-actions-optimism-and-confirmation.md); the hydration snapshot in [02](references/02-reactivity-and-ownership.md); the marked owner with retained DOM in [03](references/03-effects-and-lifecycle.md); `seedLoadingValue` with `ssrSource: 'client'` in [05](references/05-stores-and-projections.md); focus with a pending action, `lazy` with `.then`, `clientOnly` and Portal during hydration in [06](references/06-lists-control-flow-and-local-state.md); the lint plugin in [07](references/07-dom-events-and-refs.md); `NoHydration`/`Hydration` with a whole document, the client side of hydration, the plugin build, production served by the adapter and the status retraction under `Loading`/`Errored` in [12](references/12-ssr-and-hydration.md); declared GET/HEAD, `X-Revalidate` of `reload` and a form without JS in [13](references/13-server-functions-and-security.md).

The version numbers of both bases are in the `package.json` and the `pnpm-lock.yaml` of the Solid monorepo, at the commits given. Guidance added after that date without its own probe says where it comes from (JSDoc of the installed package or the official skill) and does not change the verification date.

On 2026-11-17, the delta from the verified base to the stable base (the first stable release, commit `a8186e6`, with the router and the Vite plugin published for it; the installed versions are in `package.json` and `bun.lock`) was checked against every statement of references 01 to 17 that names an API, an export, a type, a diagnostic code, a default or a behavior: the exports and types of the installed packages, the changelogs published between the two bases and graph probes in the dev and default builds, with the verified base as the control. The passages that changed name the stable base. Not repeated: what needs a browser (focus with `moveBefore()`, a `<select>` whose options arrive later, the timing of refs, hydration) and the earlier measurements of references 10 and 17, which later fixes can shift without contradicting the contracts. The verification date and the base commit stay those of the full reverification.
